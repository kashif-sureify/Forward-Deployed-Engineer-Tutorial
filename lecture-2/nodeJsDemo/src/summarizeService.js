import OpenAI from "openai";

import { createAgent } from "./agentLoop.js";
import { toolDefinitions, toolHandlers } from "./tools/index.js";

const DEFAULT_MODEL = "meta-llama/llama-3.3-70b-instruct";

export function createSummarizeService({
  client = new OpenAI(),
  model = process.env.OPENAI_MODEL ?? DEFAULT_MODEL,
} = {}) {
  if (!client?.responses?.create) {
    throw new TypeError("A client with a responses.create method is required");
  }
  const TOMATO_PROMPT = `You are a customer-support executive for our
Food ordering app named Tomato.

Your job is to identify the customer's main
problem and urgency. Answer them related to there query.

Use professional language. If user has an issue,
use words like I understand your frustration,
I am really sorry for your trouble etc.

Do not answer any other question which is not
related to Ordering Food query, refund query,
order tracking status query or company policy query.
`;

  const CHAT_SYSTEM_PROMPT = `You are a helpful AI assistant with access to external tools.

Follow these rules:
1. For arithmetic calculations, ALWAYS use the calculator tool.
2. Always use calculator tool for even trivial calculation
3. For current weather, ALWAYS use the currentWeather tool.
4. For currency conversion or exchange rates, ALWAYS use the convertCurrency tool.
5. You may call multiple tools when solving a multi-step request.
6. After receiving tool results, explain the answer naturally.
7. Never invent current weather or exchange-rate information.`;

  const chatAgent = createAgent({
    client,
    model,
    instructions: `${CHAT_SYSTEM_PROMPT}`,
    tools: toolDefinitions,
    handlers: toolHandlers,
  });

  return {
    async *summarize(ticket, { signal } = {}) {
      if (typeof ticket !== "string" || !ticket.trim()) {
        throw new TypeError("Ticket content must be a non-empty string");
      }
      const stream = client.responses.stream(
        {
          model,
          input: `Summarize this following ticket in 2 lines:\n\n${ticket}`,
          store: false,
        },
        { signal },
      );
      for await (const event of stream) {
        if (event.type === "response.output_text.delta") {
          yield event.delta;
        }
      }
      const response = await stream.finalResponse();

      const summary = response?.output_text?.trim();
      if (!summary) {
        throw new Error("Failed to generate summary");
      }
      return summary;
    },

    chat(message, options) {
      return chatAgent.send(message, options);
    },
  };
}
