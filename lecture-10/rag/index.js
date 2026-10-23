import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { Pinecone } from '@pinecone-database/pinecone';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import * as dotenv from 'dotenv';
import { PineconeStore } from '@langchain/pinecone';
import { Document } from '@langchain/core/documents';

const PDF_SOURCE = './hld.pdf';

dotenv.config();

async function indexDocuments() {
    const PDF_PATH = './hld.pdf';
const pdfLoader = new PDFLoader(PDF_PATH);
const rawDocs = await pdfLoader.load();

console.log("Loaded raw documents:", rawDocs.length);

// console.log(JSON.stringify(rawDocs, null, 2));
// console.log(rawDocs.length)

const textSplitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1000,
  chunkOverlap: 200,
});

const chunkDocs = await textSplitter.splitDocuments(rawDocs); 
console.log("Split documents into chunks:", chunkDocs.length);
// console.log('Chunked documents:', chunkDocs);

const embeddings = new GoogleGenerativeAIEmbeddings({
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_MODEL,
    outputDimensionality: 1024 // must match the Pinecone index dimension
});

console.log("Initialized embeddings.");
console.log("Connecting to Pinecone index:", process.env.PINECONE_INDEX_NAME);

const pincone = new Pinecone();
const pineconeIndex = pincone.Index(process.env.PINECONE_INDEX_NAME);
console.log("Connected to Pinecone index.");

const vectorStore = new PineconeStore(embeddings, { pineconeIndex });

// Gemini free tier allows ~100 embeddings/minute, and the LangChain wrapper
// silently returns empty vectors for rate-limited batches, so we go one batch
// per minute and fail loudly if anything comes back empty.
const BATCH_SIZE = 100;
for (let i = 0; i < chunkDocs.length; i += BATCH_SIZE) {
    const batch = chunkDocs.slice(i, i + BATCH_SIZE);
    const vectors = await embeddings.embedDocuments(batch.map((d) => d.pageContent));
    if (vectors.some((v) => v.length === 0)) {
        throw new Error(`Embedding failed for batch starting at chunk ${i} (likely rate limited)`);
    }
    await vectorStore.addVectors(vectors, batch);
    console.log(`Indexed chunks ${i + 1}-${i + batch.length} of ${chunkDocs.length}`);

    if (i + BATCH_SIZE < chunkDocs.length) {
        await new Promise((resolve) => setTimeout(resolve, 60_000));
    }
}
console.log("Indexed documents into Pinecone.");
}

// ---------------------------------------------------------------------------
// Alternative chunking strategies (reference only, not used by indexDocuments)
// ---------------------------------------------------------------------------

// Structured chunking: split along the document's own structure (headings /
// sections) so each chunk is one logical section. Sections that are still too
// big are sub-split with the recursive splitter, and every chunk keeps its
// section heading in metadata so it can be shown or filtered on at query time.
async function structuredChunking(rawDocs, maxChunkSize = 1000) {
    // PDF text has no markdown, so treat numbered lines ("1.", "2.3 Title")
    // and short ALL-CAPS lines as headings.
    const headingRegex = /^(\d+(\.\d+)*\.?\s+\S.*|[A-Z][A-Z0-9 &/-]{3,60})$/;

    const sections = [];
    let current = { heading: 'Introduction', lines: [], page: 1 };

    for (const doc of rawDocs) {
        const page = doc.metadata?.loc?.pageNumber;
        for (const line of doc.pageContent.split('\n')) {
            const trimmed = line.trim();
            if (headingRegex.test(trimmed)) {
                if (current.lines.length) sections.push(current);
                current = { heading: trimmed, lines: [], page };
            } else if (trimmed) {
                current.lines.push(trimmed);
            }
        }
    }
    if (current.lines.length) sections.push(current);

    const subSplitter = new RecursiveCharacterTextSplitter({
        chunkSize: maxChunkSize,
        chunkOverlap: 100,
    });

    const chunks = [];
    for (const section of sections) {
        const text = `${section.heading}\n${section.lines.join(' ')}`;
        const metadata = { source: PDF_SOURCE, section: section.heading, page: section.page };
        if (text.length <= maxChunkSize) {
            chunks.push(new Document({ pageContent: text, metadata }));
        } else {
            // Prefix the heading on every sub-chunk so it keeps its context.
            const parts = await subSplitter.splitText(section.lines.join(' '));
            parts.forEach((part, idx) => chunks.push(new Document({
                pageContent: `${section.heading}\n${part}`,
                metadata: { ...metadata, part: idx + 1 },
            })));
        }
    }
    return chunks;
}

// Semantic chunking: split into sentences, embed each one, and start a new
// chunk wherever the meaning shifts, i.e. where the cosine distance between
// neighbouring sentences is in the top (100 - percentile)% of all distances.
// Note: this embeds every sentence, so it costs far more embedding calls than
// the other splitters (watch the Gemini rate limit).
async function semanticChunking(rawDocs, embeddings, { percentile = 95, bufferSize = 1 } = {}) {
    const fullText = rawDocs.map((d) => d.pageContent).join(' ').replace(/\s+/g, ' ');
    const sentences = fullText.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [];
    if (sentences.length < 2) {
        return [new Document({ pageContent: fullText, metadata: { source: PDF_SOURCE } })];
    }

    // Embed each sentence together with its neighbours to smooth out noise.
    const windows = sentences.map((_, i) =>
        sentences.slice(Math.max(0, i - bufferSize), i + bufferSize + 1).join(' ')
    );
    const vectors = await embeddings.embedDocuments(windows);

    const cosineDistance = (a, b) => {
        let dot = 0, normA = 0, normB = 0;
        for (let k = 0; k < a.length; k++) {
            dot += a[k] * b[k];
            normA += a[k] * a[k];
            normB += b[k] * b[k];
        }
        return 1 - dot / (Math.sqrt(normA) * Math.sqrt(normB));
    };

    const distances = [];
    for (let i = 0; i < vectors.length - 1; i++) {
        distances.push(cosineDistance(vectors[i], vectors[i + 1]));
    }

    const sorted = [...distances].sort((a, b) => a - b);
    const threshold = sorted[Math.floor((percentile / 100) * (sorted.length - 1))];

    const chunks = [];
    let start = 0;
    distances.forEach((distance, i) => {
        if (distance > threshold) {
            chunks.push(sentences.slice(start, i + 1).join(' '));
            start = i + 1;
        }
    });
    chunks.push(sentences.slice(start).join(' '));

    return chunks.map((text, idx) => new Document({
        pageContent: text,
        metadata: { source: PDF_SOURCE, chunk: idx + 1 },
    }));
}

indexDocuments();