import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { Pinecone } from '@pinecone-database/pinecone';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import * as dotenv from 'dotenv';
import { PineconeStore } from '@langchain/pinecone';


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

indexDocuments();