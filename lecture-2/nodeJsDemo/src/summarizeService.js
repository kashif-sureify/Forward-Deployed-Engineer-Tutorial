import OpenAI from "openai";

import { toolDefinitions, toolHandlers } from "./tools/index.js";

const DEFAULT_MODEL = "meta-llama/llama-3.3-70b-instruct";
const MAX_HISTORY_MESSAGES = 50;
// One round is a single model call, so this also caps requests per chat turn.
const MAX_TOOL_ROUNDS = 5;

async function runToolCall({ name, arguments: rawArguments }) {
  console.log(`Running tool call: ${name} with arguments:`, rawArguments);
  const handler = toolHandlers[name];
  if (!handler) {
    return `Error: unknown tool "${name}"`;
  }
  try {
    const result = await handler(rawArguments ? JSON.parse(rawArguments) : {});
    console.log(`Tool call result for "${name}":`, result);
    return typeof result === "string" ? result : JSON.stringify(result);
  } catch (error) {
    // Hand the failure back to the model so it can retry or apologise, rather
    // than failing the whole chat turn.
    console.error(`Tool "${name}" failed:`, error);
    return `Error: ${error.message}`;
  }
}

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
        // Build the pending turn without committing it, so a failed request
        // leaves the stored history untouched.
        let input = [...history, { role: "user", content: message }];

        for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
          const response = await client.responses.create({
            model,
            instructions: `${CHAT_SYSTEM_PROMPT}\n\n${TOMATO_PROMPT}`,
            input,
            tools: toolDefinitions,
            store: false,
          });

          // console.log("Raw response from the client:", response);

          const toolCalls = (response?.output ?? []).filter(
            (item) => item.type === "function_call",
          );
          console.log("Tool calls:", toolCalls);

          console.log("Tool calls extracted from the response:", toolCalls.length);

          if (!toolCalls.length) {
            const reply = response?.output_text?.trim();
            if (!reply) {
              throw new Error("Failed to generate reply");
            }

            history.push(
              { role: "user", content: message },
              { role: "assistant", content: reply },
            );
            // Turns are always committed in pairs, so trimming an even number
            // of messages keeps the oldest surviving turn a user one.
            if (history.length > MAX_HISTORY_MESSAGES) {
              history.splice(0, history.length - MAX_HISTORY_MESSAGES);
            }
            return reply;
          }

          const outputs = await Promise.all(
            toolCalls.map(async (call) => ({
              type: "function_call_output",
              call_id: call.call_id,
              output: await runToolCall(call),
            })),
          );

          console.log("Tool call outputs:", outputs);

          // The calls and their results are replayed to the model within this
          // turn only; stored history keeps just the user message and reply.
          input = [
            ...input,
            ...toolCalls.map(({ call_id, name, arguments: args }) => ({
              type: "function_call",
              call_id,
              name,
              arguments: args,
            })),
            ...outputs,
          ];
        }

        throw new Error(
          `Chat did not produce a reply within ${MAX_TOOL_ROUNDS} tool rounds`,
        );
      });
    },
  };
}
