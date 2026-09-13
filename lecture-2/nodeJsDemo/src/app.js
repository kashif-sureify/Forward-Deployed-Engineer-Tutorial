import express from "express";

export function createApp(summarizeService) {
  if (!summarizeService?.summarize || !summarizeService?.chat) {
    throw new TypeError(
      "A summarizeService with summarize and chat is required",
    );
  }
  const app = express();
  app.use(express.text({ type: "*/*", limit: "100kb" }));

  app.post("/api/summarize", async (req, res) => {
    const ticket = typeof req.body === "string" ? req.body : "";

    if (!ticket.trim()) {
      return res
        .status(400)
        .type("text/plain")
        .send("Ticket content is required");
    }
    try {
      const summary = await summarizeService.summarize(ticket);
      return res.type("text/plain").send(summary);
    } catch (error) {
      console.error("Failed to summarize ticket:", error);
      return res.status(500).type("text/plain").send("Internal Server Error");
    }
  });

  app.post("/api/chat", async (req, res) => {
    const message = typeof req.body === "string" ? req.body : "";
    if (!message.trim()) {
      return res
        .status(400)
        .type("text/plain")
        .send("Message content is required");
    }

    try {
      const reply = await summarizeService.chat(message);
      return res.type("text/plain").send(reply);
    } catch (error) {
      console.error("Failed to process chat message:", error);
      return res.status(500).type("text/plain").send("Internal Server Error");
    }
  });
  return app;
}
