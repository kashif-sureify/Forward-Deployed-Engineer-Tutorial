import express from "express";
import { createMcpClient } from "./mcpClient.js";
import { ChatService } from "./chatService.js";
import { chatController } from "./chatController.js";

const mcpClient = await createMcpClient();
const chatService = new ChatService(mcpClient);

const app = express();
app.use(chatController(chatService));

// server.port=8080
const PORT = Number(process.env.PORT) || 8080;
app.listen(PORT, () =>
  console.log(`taskClient running on http://localhost:${PORT}`)
);