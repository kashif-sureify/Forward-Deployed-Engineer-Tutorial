import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "./mcpServer.js";

export const createApp = (schedulerController) => {
  const app = express();

  app.use(express.text({ type: "*/*", limit: "10mb" }));
  app.use((req, res, next) => {
    if (typeof req.body === "string") {
      try {
        req.body = JSON.parse(req.body);
      } catch {
      }
    }
    next();
  });

  app.get("/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/meetings", schedulerController.scheduleMeeting);

  // Stateless MCP endpoint: a fresh server + transport per request
  app.post("/mcp", async (req, res) => {
    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      transport.close();
      server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("MCP request failed:", error);
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
      }
    }
  });

  // Stateless server: no SSE stream (GET) or session to delete (DELETE); 405 tells the client so
  app.all("/mcp", (req, res) => {
    res.status(405).set("Allow", "POST").json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null });
  });

  app.use((req,res)=> {
    res.status(404).json({ error: "Not Found" });
  });
  return app;
};