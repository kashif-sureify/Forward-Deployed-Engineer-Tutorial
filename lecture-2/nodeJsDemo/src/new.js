  const history = [];
  let historyQueue = Promise.resolve();
  function useHistory(operation) {
    const result = historyQueue.then(operation);
    historyQueue = result.catch(() => {}); // Prevent unhandled rejections
    return result;
  }


      async chat(message) {
      if (typeof message !== "string" || !message.trim()) {
        throw new TypeError("Message content must be a non-empty string");
      }
      const response = await client.responses.create({
        model,
        instructions:
          "You are a helpful support assistant. Answer clearly and concisely.",
        input: message,
        store: false,
      });

      console.log("Raw response from the client:", response);

      const reply = response?.output_text?.trim();
      if (!reply) {
        throw new Error("Failed to generate reply");
      }
      return reply;
    },


      app.post("/api/chat", async (req, res) => {
    const message = typeof req.body === "string" ? req.body : "";
    if (!message.trim()) {
      return res.status(400).type("text/plain").send("Message content is required");
    }

    try {
        const answer = await useHistory(async () => {
            history.push({role: "user", content: message});
        });
        const reply = await summarizeService.chat(message);
        return res.type("text/plain").send(reply);
    } catch (error) {
        console.error("Failed to process chat message:", error);
        return res.status(500).type("text/plain").send("Internal Server Error");
    }
  });