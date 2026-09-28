// RAG querying WITHOUT LangChain.
// The only LangChain piece in ../rag/query.js was GoogleGenerativeAIEmbeddings;
// here the query is embedded with ai.models.embedContent() directly.

import { fileURLToPath } from 'node:url';
import * as dotenv from 'dotenv';
import readlineSync from 'readline-sync';
import { Pinecone } from '@pinecone-database/pinecone';
import { GoogleGenAI } from '@google/genai';

// Reuse the .env from the langchain version of the project
dotenv.config({ path: fileURLToPath(new URL('../rag/.env', import.meta.url)) });

const DIMENSIONS = 1024; // must match the Pinecone index dimension
const NAMESPACE = 'rag-scratch'; // must match the namespace used in index.js
const TOP_K = 5;

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const index = pinecone.index(process.env.PINECONE_INDEX_NAME).namespace(NAMESPACE);

const History = [];

// Rewrite a follow-up question ("what about its drawbacks?") into a standalone
// one using the chat history, so the vector search has enough to go on.
async function transformQuery(question) {
    const response = await ai.models.generateContent({
        model: process.env.GEMINI_CHAT_MODEL,
        contents: [...History, { role: 'user', parts: [{ text: question }] }],
        config: {
            systemInstruction: `You are a query rewriting expert. Based on the provided chat history, rephrase the "Follow Up user Question" into a complete, standalone question that can be understood without the chat history.
    Only output the rewritten question and nothing else.`,
        },
    });
    return response.text;
}

async function embedQuery(text) {
    const response = await ai.models.embedContent({
        model: process.env.GEMINI_MODEL,
        contents: text,
        config: {
            taskType: 'RETRIEVAL_QUERY',
            outputDimensionality: DIMENSIONS,
        },
    });
    const vector = response.embeddings?.[0]?.values;
    if (!vector?.length) {
        throw new Error('Embedding returned an empty vector (likely rate limited)');
    }
    return vector;
}

async function retrieveContext(query) {
    const queryEmbedding = await embedQuery(query);

    const searchResults = await index.query({
        vector: queryEmbedding,
        topK: TOP_K,
        includeMetadata: true,
    });

    return searchResults.matches
        .map((match) => match.metadata.text)
        .join('\n\n---\n\n');
}

async function chattingWithAI(question) {
    const standaloneQuestion = await transformQuery(question);
    const context = await retrieveContext(standaloneQuestion);

    History.push({ role: 'user', parts: [{ text: question }] });

    const response = await ai.models.generateContent({
        model: process.env.GEMINI_CHAT_MODEL,
        contents: History,
        config: {
            systemInstruction: `You have to behave like a System Design Expert.
    You will be given a context of relevant information and a user question.
    Your task is to answer the user's question based ONLY on the provided context.
    If the answer is not in the context, you must say "I could not find the answer in the provided document."
    Keep your answers clear, concise, and educational.

      Context: ${context}`,
        },
    });

    History.push({ role: 'model', parts: [{ text: response.text }] });

    console.log('\n');
    console.log(response.text);
    return response.text;
}

async function main() {
    while (true) {
        const question = readlineSync.question('Ask me anything: >>> ');
        if (question.trim().toLowerCase() === 'exit') break;
        await chattingWithAI(question);
    }
}

main();
