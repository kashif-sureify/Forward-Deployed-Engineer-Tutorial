import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { createApp } from './app.js';
import { ChatService } from './chatService.js';

dotenv.config();

const API_KEY = process.env.GEMINI_API_KEY;
const PORT = process.env.PORT || 8081;
if (!API_KEY) {
  console.error('GEMINI_API_KEY is not set in the environment variables.');
  process.exit(1);
}

const client = new GoogleGenAI({
  apiKey: API_KEY,
});

const temperature = Number.parseFloat(process.env.TEMPERATURE);
const chatService = new ChatService(client, {
  model: process.env.GEMINI_MODEL,
  temperature: Number.isNaN(temperature) ? undefined : temperature,
});

const app = createApp(chatService);

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Server is running on http://127.0.0.1:${PORT}`);
});
