import * as dotenv from 'dotenv';
import readlineSync from 'readline-sync';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { Pinecone } from '@pinecone-database/pinecone';
import { GoogleGenAI } from "@google/genai";
dotenv.config();

const ai = new GoogleGenAI({});
const History = []


async function transformQuery(question){

History.push({
    role:'user',
    parts:[{text:question}]
    })  

const response = await ai.models.generateContent({
    model: process.env.GEMINI_CHAT_MODEL,
    contents: History,
    config: {
      systemInstruction: `You are a query rewriting expert. Based on the provided chat history, rephrase the "Follow Up user Question" into a complete, standalone question that can be understood without the chat history.
    Only output the rewritten question and nothing else.
      `,
    },
 });
 
 History.pop()
 
 return response.text


}

async function chattingWithAI(question) {
    const embeddings = new GoogleGenerativeAIEmbeddings({
        apiKey: process.env.GEMINI_API_KEY,
        model: process.env.GEMINI_MODEL,
        outputDimensionality: 1024 // must match the Pinecone index dimension
    });

    const transformedQuery = await transformQuery(question);

    const queryEmbedding = await embeddings.embedQuery(transformedQuery);

    const pinecone = new Pinecone();
    const pineconeIndex = pinecone.Index(process.env.PINECONE_INDEX_NAME);

    const searchResults = await pineconeIndex.query({
        vector: queryEmbedding,
        topK: 5,
        includeMetadata: true
    });

    // Pinecone has no score threshold option, so drop weak matches here.
    // With the cosine metric, score is similarity: higher means more relevant.
    const SIMILARITY_THRESHOLD = 0.7;
    const relevantMatches = searchResults.matches
                   .filter(match => match.score >= SIMILARITY_THRESHOLD);

    if (relevantMatches.length === 0) {
        console.log("No relevant matches found.");
        return "No relevant matches found.";
    }

    const context = relevantMatches
                   .map(match => match.metadata.text)
                   .join("\n\n---\n\n");


    History.push({ role: "user", parts: [{text: question}] });

    const response = await ai.models.generateContent({
    model: process.env.GEMINI_CHAT_MODEL,
    contents: History,
    config: {
      systemInstruction: `You have to behave like a System Design Expert.
    You will be given a context of relevant information and a user question.
    Your task is to answer the user's question based ONLY on the provided context.
    If the answer is not in the context, you must say "I could not find the answer in the provided document."
    Keep your answers clear, concise, and educational.
      
      Context: ${context}
      `,
    },
   });


   History.push({
    role:'model',
    parts:[{text:response.text}]
  })

  console.log("\n");
  console.log(response.text);

    return response.text;

}

async function main() {
    const userProblem = readlineSync.question("Ask me anything: >>> ");
    const results = await chattingWithAI(userProblem);
    main();
}

main();