const express = require("express");

function createApp(embeddingModel, movieController) {
  const app = express();

  app.use(express.json({ limit: "100kb" }));

  app.get("/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Test route: POST { "text": "a spy thriller" } to see the raw embedding
  app.post("/api/embed", async (req, res) => {
    const text = typeof req.body?.text === "string" ? req.body.text : "";
    if (!text.trim()) {
      return res.status(400).json({ error: "text is required" });
    }

    try {
      const embedding = await embeddingModel.embed(text);
      return res.json({
        model: embeddingModel.model,
        dimensions: embedding.length,
        preview: embedding.slice(0, 5),
        embedding,
      });
    } catch (error) {
      console.error("Failed to create embedding:", error);
      return res.status(500).json({ error: "Failed to create embedding" });
    }
  });

  app.use("/api/movies", movieController.router);

  app.use((req, res) => {
    res.status(404).json({ error: "Not Found" });
  });

  app.use((error, req, res, next) => {
    console.error("Unhandled error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  });

  return app;
}

module.exports = { createApp };
