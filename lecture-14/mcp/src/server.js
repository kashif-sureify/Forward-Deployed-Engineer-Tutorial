import dotenv from "dotenv";
import { createApp } from "./app.js";

dotenv.config();

const PORT = Number(process.env.PORT) || 8080;

const app = createApp();

app.listen(PORT, () => {
  console.log(`MCP server is running on http://localhost:${PORT}/mcp`);
});
