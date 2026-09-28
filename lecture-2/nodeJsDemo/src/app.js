import cors from "cors";
import express from "express";

// Run a service call that streams plain text, writing each chunk as it
// arrives. Headers are held back until the first chunk, so a failure before
// any text has gone out can still be reported as a 500. Once the body has
// started the status is already committed, and all we can do is end the
// stream, leaving the client with a partial answer.
async function streamPlainText(res, label, start) {
  // Stop generating as soon as the client hangs up, rather than paying for the
  // rest of a reply nobody will read.
  const controller = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) {
      controller.abort();
    }
  });

  try {
    for await (const chunk of start(controller.signal)) {
      if (!chunk) {
        continue;
      }
      if (!res.headersSent) {
        res.type("text/plain");
        res.setHeader("Cache-Control", "no-cache, no-transform");
        // Stop nginx and friends from buffering the body back into one blob.
        res.setHeader("X-Accel-Buffering", "no");
      }
      res.write(chunk);
    }
    if (!res.headersSent) {
      res.type("text/plain");
    }
    return res.end();
  } catch (error) {
    if (controller.signal.aborted) {
      return undefined; // The client hung up; nothing left to answer.
    }
    console.error(`Failed to ${label}:`, error);
    if (res.headersSent) {
      return res.end();
    }
    return res.status(500).type("text/plain").send("Internal Server Error");
  }
}

export function createApp(summarizeService, websiteService) {
  if (!summarizeService?.summarize || !summarizeService?.chat) {
    throw new TypeError(
      "A summarizeService with summarize and chat is required",
    );
  }
  if (!websiteService?.generate) {
    throw new TypeError("A websiteService with generate is required");
  }
  const app = express();
  app.use(cors());
  app.use(express.text({ type: "*/*", limit: "100kb" }));

  app.post("/api/summarize", async (req, res) => {
    const ticket = typeof req.body === "string" ? req.body : "";

    if (!ticket.trim()) {
      return res
        .status(400)
        .type("text/plain")
        .send("Ticket content is required");
    }
    return streamPlainText(res, "summarize ticket", (signal) =>
      summarizeService.summarize(ticket, { signal }),
    );
  });

  app.post("/api/chat", async (req, res) => {
    const message = typeof req.body === "string" ? req.body : "";
    if (!message.trim()) {
      return res
        .status(400)
        .type("text/plain")
        .send("Message content is required");
    }

    return streamPlainText(res, "process chat message", (signal) =>
      summarizeService.chat(message, { signal }),
    );
  });

  app.post("/api/website", async (req, res) => {
    const description = typeof req.body === "string" ? req.body : "";
    if (!description.trim()) {
      return res
        .status(400)
        .type("text/plain")
        .send("Website description is required");
    }

    return streamPlainText(res, "generate website", (signal) =>
      websiteService.generate(description, { signal }),
    );
  });

  return app;
}
