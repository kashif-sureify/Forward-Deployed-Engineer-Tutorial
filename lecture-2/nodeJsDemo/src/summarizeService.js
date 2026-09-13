import OpenAI from "openai";

const DEFAULT_MODEL = "meta-llama/llama-3.3-70b-instruct";
const MAX_HISTORY_MESSAGES = 50;

export function createSummarizeService({
  client = new OpenAI(),
  model = process.env.OPENAI_MODEL ?? DEFAULT_MODEL,
} = {}) {
  if (!client?.responses?.create) {
    throw new TypeError("A client with a responses.create method is required");
  }
  const SYSTEM_PROMPT = `You are a customer-support executive for our
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

  const history = [];
  let historyQueue = Promise.resolve();
  function useHistory(operation) {
    const result = historyQueue.then(operation);
    historyQueue = result.catch(() => {}); // Prevent unhandled rejections
    return result;
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
    async chat(message) {
      if (typeof message !== "string" || !message.trim()) {
        throw new TypeError("Message content must be a non-empty string");
      }
      return useHistory(async () => {
        // Send the pending turn without committing it, so a failed request
        // leaves the stored history untouched.
        const response = await client.responses.create({
          model,
          instructions: SYSTEM_PROMPT,
          input: [...history, { role: "user", content: message }],
          store: false,
        });

        console.log("Raw response from the client:", response);

        const reply = response?.output_text?.trim();
        if (!reply) {
          throw new Error("Failed to generate reply");
        }

        history.push(
          { role: "user", content: message },
          { role: "assistant", content: reply },
        );
        // Turns are always committed in pairs, so trimming an even number of
        // messages keeps the oldest surviving turn a user one.
        if (history.length > MAX_HISTORY_MESSAGES) {
          history.splice(0, history.length - MAX_HISTORY_MESSAGES);
        }
        return reply;
      });
    },
  };
}
