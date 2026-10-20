const useGemini = () =>
  !process.env.OPENAI_API_KEY && !!process.env.GEMINI_API_KEY;

export class ChatClient {
  constructor({
    apiKey = useGemini()
      ? process.env.GEMINI_API_KEY
      : process.env.OPENAI_API_KEY,
    model = useGemini()
      ? (process.env.GEMINI_MODEL ?? "gemini-2.5-flash")
      : (process.env.OPENAI_MODEL ?? "gpt-4o-mini"),
    embeddingModel = useGemini()
      ? (process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-001")
      : (process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small"),
    baseUrl = useGemini()
      ? (process.env.GEMINI_BASE_URL ??
        "https://generativelanguage.googleapis.com/v1beta/openai")
      : (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1"),
  } = {}) {
    if (!apiKey) {
      throw new Error("API key is required");
    }
    Object.assign(this, { apiKey, model, embeddingModel, baseUrl });
  }

  async post(path, body, maxRetries = 3) {
    for (let attempt = 0; ; attempt++) {
      const response = await fetch(`${this.baseUrl}/${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60000),
      });
      if (response.ok) {
        return await response.json();
      }
      const text = await response.text();
      const retryable = [429, 500, 502, 503, 504].includes(response.status);
      if (!retryable || attempt >= maxRetries) {
        throw new Error(`Failed to POST to ${path}: ${text}`);
      }
      const seconds =
        Number(response.headers.get("Retry-After")) ||
        Number(text.match(/"retryDelay":\s*"(\d+(?:\.\d+)?)"/)?.[1]) ||
        2 ** attempt * 10;

      console.warn(
        `POST to ${path} failed with status ${response.status}. Retrying in ${seconds} seconds...`,
      );
      await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
    }
  }

  async embed(text) {
    const response = await this.post("embeddings", {
      model: this.embeddingModel,
      input: text,
    });
    return response.data
      .sort((a, b) => a.index - b.index)
      .map((item) => item.embedding);
  }

  async complete(messages, tools, json = false) {
    const response = await this.post("chat/completions", {
      model: this.model,
      messages,
      ...(tools ? { tools } : {}),
      ...(json ? { response_format: { type: "json_object" } } : {}),
    });
    return response.choices?.[0]?.message ?? null;
  }

  async chat(system, question, registry) {
    const messages = [
      { role: "system", content: system },
      { role: "user", content: question },
    ];
    const tools = Object.entries(registry).map(([name, tool]) => ({
      type: "function",
      function: {
        name,
        description: tool.description,
        parameters: {
          type: "object",
          properties: {
            orderId: {
              type: "string",
              description: "The ID of the order",
            },
          },
          required: ["orderId"],
          additionalProperties: false,
        },
      },
    }));

    for (let round = 0; round < 3; round++) {
      const message = await this.complete(messages, tools);
      if (!message) {
        throw new Error("Received no message from the model");
      }

      if (!message.tool_calls?.length) {
        if (!message.content?.trim()) {
          throw new Error("Received empty message content");
        }
        return message.content;
      }
      messages.push(message);

      for (const toolCall of message.tool_calls) {
        const tool = registry[toolCall.function.name];
        let args;
        try {
          args = JSON.parse(toolCall.function.arguments || "{}");
        } catch {
          args = {};
        }

        if (!tool || typeof args.orderId !== "string" || !args.orderId.trim()) {
          throw new Error(
            `Tool not found or invalid arguments: ${toolCall.function.name}`,
          );
        }

        const result = await tool.execute(args.orderId);
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: typeof result === "string" ? result : JSON.stringify(result),
        });
      }
    }
    throw new Error(
      "Exceeded maximum number of chat rounds without resolving the query.",
    );
  }
}
