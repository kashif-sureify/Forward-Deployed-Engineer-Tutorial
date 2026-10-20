import express from "express";
import { ChatClient } from "./infrastructure/ChatClient.js";
import { ToolTracker } from "./ToolTracker.js";
import { simpleVectorStore } from "./infrastructure/SimpleVectorStore.js";
import { SupportService } from "./SupportService.js";
import { RefundAmountTool } from "./tools/RefundAmountTool.js";
import { DeliveryEstimateTool } from "./tools/DeliveryEstimate.js";
import { OrderTrackerTool } from "./tools/OrderTrackerTool.js";
import { SupportController } from "./SupportController.js";
import { createServer } from "http";

export async function createApplication(
  client = new ChatClient(),
  { embeddingCacheFile } = {},
) {
  const tracker = new ToolTracker();
  const vectorStore = new simpleVectorStore(client, {
    cacheFile: embeddingCacheFile,
  });
  const supportService = new SupportService(
    client,
    vectorStore,
    new OrderTrackerTool(tracker),
    new DeliveryEstimateTool(tracker),
    new RefundAmountTool(tracker),
    tracker,
  );

  await supportService.loadKnowledgeBase();
  const controller = new SupportController(supportService);

  const app = express();
  app.use(controller.router());
  app.use((req, res) => {
    res.status(404).json({ error: "Not Found" });
  });

  app.use((err, req, res, next) => {
    if (err.type === "entity.too.large") {
      res.status(413).json({ error: "Payload Too Large" });
      return;
    }
    console.error("Unhandled error:", err);
    res.status(err.status || 500).json({ error: "Internal Server Error" });
  });

  const server = createServer(app);

  return { app, server, controller, supportService };
}
