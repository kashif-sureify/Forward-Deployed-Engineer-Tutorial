import OpenAI from "openai";

const DEFAULT_MODEL = "meta-llama/llama-3.3-70b-instruct";

export function createSummarizeService({
  client = new OpenAI(),
  model = process.env.OPENAI_MODEL ?? DEFAULT_MODEL,
} = {}) {
  if (!client?.responses?.create) {
    throw new TypeError("A client with a responses.create method is required");
  }
  return {
    async summarize(ticket) {
      if (typeof ticket !== "string" || !ticket.trim()) {
        throw new TypeError("Ticket content must be a non-empty string");
      }
      const response = await client.responses.create({
        model,
        input: `Summarize this following ticket in 2 lines:\n\n${ticket}`,
        store: false,
      });

      console.log("Raw response from the client:", response);

      const summary = response?.output_text?.trim();
      if (!summary) {
        throw new Error("Failed to generate summary");
      }
      return summary;
    },
  };
}
