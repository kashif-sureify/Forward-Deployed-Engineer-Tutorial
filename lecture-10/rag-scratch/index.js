// RAG indexing WITHOUT LangChain.
// Every LangChain piece from ../rag/index.js is replaced by plain code:
//   PDFLoader                      -> pdf-parse (the same library LangChain uses internally)
//   RecursiveCharacterTextSplitter -> splitText() / mergeSplits() below
//   GoogleGenerativeAIEmbeddings   -> ai.models.embedContent() from @google/genai
//   PineconeStore.addVectors       -> index.upsert() from @pinecone-database/pinecone

import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PDFParse } from 'pdf-parse';
import { GoogleGenAI } from '@google/genai';
import { Pinecone } from '@pinecone-database/pinecone';
import * as dotenv from 'dotenv';

// Reuse the .env from the langchain version of the project
dotenv.config({ path: fileURLToPath(new URL('../rag/.env', import.meta.url)) });

const PDF_PATH = fileURLToPath(new URL('../rag/hld.pdf', import.meta.url));
const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;
const SEPARATORS = ['\n\n', '\n', ' ', ''];
const DIMENSIONS = 1024; // must match the Pinecone index dimension
const BATCH_SIZE = 100;
// Separate namespace so these vectors don't mix with the ones LangChain stored
const NAMESPACE = 'rag-scratch';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// ---------------------------------------------------------------------------
// 1. Load the PDF -> one "document" per page: { text, metadata }
// ---------------------------------------------------------------------------
async function loadPdf(path) {
    const buffer = await fs.readFile(path);
    const parser = new PDFParse({ data: buffer });
    try {
        const result = await parser.getText();
        return result.pages
            .filter((page) => page.text.trim().length > 0)
            .map((page) => ({
                text: page.text,
                metadata: { source: path, pageNumber: page.num },
            }));
    } finally {
        await parser.destroy();
    }
}

// ---------------------------------------------------------------------------
// 2. Recursive character text splitter
//    Try to split on the "biggest" separator first (paragraphs), and only fall
//    back to smaller ones (lines, words, characters) for pieces that are still
//    larger than CHUNK_SIZE. Then glue small pieces back together into chunks
//    of ~CHUNK_SIZE, keeping ~CHUNK_OVERLAP characters shared between chunks.
// ---------------------------------------------------------------------------
function splitText(text, separators = SEPARATORS) {
    // Pick the first separator that actually appears in the text
    let separator = separators[separators.length - 1];
    let remainingSeparators = [];
    for (let i = 0; i < separators.length; i++) {
        const s = separators[i];
        if (s === '' || text.includes(s)) {
            separator = s;
            remainingSeparators = separators.slice(i + 1);
            break;
        }
    }

    const splits = text.split(separator).filter((s) => s !== '');

    const finalChunks = [];
    let smallSplits = [];
    for (const split of splits) {
        if (split.length < CHUNK_SIZE) {
            smallSplits.push(split);
            continue;
        }
        // Flush the small pieces collected so far
        if (smallSplits.length) {
            finalChunks.push(...mergeSplits(smallSplits, separator));
            smallSplits = [];
        }
        // This piece is too big on its own: recurse with the next separator
        if (remainingSeparators.length) {
            finalChunks.push(...splitText(split, remainingSeparators));
        } else {
            finalChunks.push(split);
        }
    }
    if (smallSplits.length) {
        finalChunks.push(...mergeSplits(smallSplits, separator));
    }
    return finalChunks;
}

function mergeSplits(splits, separator) {
    const chunks = [];
    let current = [];
    let total = 0;

    const sepLen = () => (current.length ? separator.length : 0);

    for (const split of splits) {
        if (total + split.length + sepLen() > CHUNK_SIZE && current.length) {
            const chunk = current.join(separator).trim();
            if (chunk) chunks.push(chunk);

            // Drop pieces from the front until only ~CHUNK_OVERLAP is left,
            // so the next chunk starts with the tail of this one.
            while (
                total > CHUNK_OVERLAP ||
                (total > 0 && total + split.length + sepLen() > CHUNK_SIZE)
            ) {
                total -= current[0].length + (current.length > 1 ? separator.length : 0);
                current.shift();
            }
        }
        current.push(split);
        total += split.length + (current.length > 1 ? separator.length : 0);
    }

    const chunk = current.join(separator).trim();
    if (chunk) chunks.push(chunk);
    return chunks;
}

function splitDocuments(docs) {
    const chunks = [];
    for (const doc of docs) {
        for (const text of splitText(doc.text)) {
            chunks.push({ text, metadata: { ...doc.metadata } });
        }
    }
    return chunks;
}

// ---------------------------------------------------------------------------
// 3. Embeddings via the Gemini API directly
// ---------------------------------------------------------------------------
async function embedTexts(texts) {
    const response = await ai.models.embedContent({
        model: process.env.GEMINI_MODEL,
        contents: texts,
        config: {
            taskType: 'RETRIEVAL_DOCUMENT',
            outputDimensionality: DIMENSIONS,
        },
    });
    const vectors = (response.embeddings ?? []).map((e) => e.values ?? []);
    if (vectors.length !== texts.length || vectors.some((v) => v.length === 0)) {
        throw new Error('Embedding returned missing/empty vectors (likely rate limited)');
    }
    return vectors;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// 4. Store vectors in Pinecone. The chunk text goes into metadata.text so the
//    query side can read it back (same convention PineconeStore uses).
// ---------------------------------------------------------------------------
async function indexDocuments() {
    const rawDocs = await loadPdf(PDF_PATH);
    console.log('Loaded pages:', rawDocs.length);

    const chunks = splitDocuments(rawDocs);
    console.log('Split documents into chunks:', chunks.length);

    const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
    const index = pinecone.index(process.env.PINECONE_INDEX_NAME).namespace(NAMESPACE);
    console.log('Connected to Pinecone index:', process.env.PINECONE_INDEX_NAME);

    // Gemini free tier allows ~100 embeddings/minute -> one batch per minute
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        const batch = chunks.slice(i, i + BATCH_SIZE);
        const vectors = await embedTexts(batch.map((c) => c.text));

        const records = batch.map((chunk, j) => ({
            // Deterministic ids: re-running overwrites instead of duplicating
            id: `hld-chunk-${i + j}`,
            values: vectors[j],
            metadata: { ...chunk.metadata, text: chunk.text },
        }));
        await index.upsert(records);
        console.log(`Indexed chunks ${i + 1}-${i + batch.length} of ${chunks.length}`);

        if (i + BATCH_SIZE < chunks.length) {
            await sleep(60_000);
        }
    }
    console.log('Indexed documents into Pinecone.');
}

indexDocuments();
