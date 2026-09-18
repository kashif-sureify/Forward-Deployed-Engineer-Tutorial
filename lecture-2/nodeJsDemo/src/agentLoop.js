const DEFAULT_MAX_HISTORY_MESSAGES = 50;
// One round is a single model call, so this also caps requests per turn.
const DEFAULT_MAX_TOOL_ROUNDS = 5;

async function runToolCall(handlers, { name, arguments: rawArguments }) {
  console.log(`Running tool call: ${name} with arguments:`, rawArguments);
  const handler = handlers[name];
  if (!handler) {
    return `Error: unknown tool "${name}"`;
  }
  try {
    const result = await handler(rawArguments ? JSON.parse(rawArguments) : {});
    console.log(`Tool call result for "${name}":`, result);
    return typeof result === "string" ? result : JSON.stringify(result);
  } catch (error) {
    // Hand the failure back to the model so it can retry or apologise, rather
    // than failing the whole turn.
    console.error(`Tool "${name}" failed:`, error);
    return `Error: ${error.message}`;
  }
}

// A conversational agent: one set of instructions, one tool registry and its
// own history. Callers get a single `send` method that runs the tool loop
// until the model answers with text.
export function createAgent({
  client,
  model,
  instructions,
  tools = [],
  handlers = {},
  maxToolRounds = DEFAULT_MAX_TOOL_ROUNDS,
  maxHistoryMessages = DEFAULT_MAX_HISTORY_MESSAGES,
}) {
  if (!client?.responses?.create) {
    throw new TypeError("A client with a responses.create method is required");
  }

  const history = [];
  let historyQueue = Promise.resolve();
  function useHistory(operation) {
    const result = historyQueue.then(operation);
    historyQueue = result.catch(() => {}); // Prevent unhandled rejections
    return result;
  }

  return {
    async send(message) {
      if (typeof message !== "string" || !message.trim()) {
        throw new TypeError("Message content must be a non-empty string");
      }
      return useHistory(async () => {
        // Build the pending turn without committing it, so a failed request
        // leaves the stored history untouched.
        let input = [...history, { role: "user", content: message }];

        for (let round = 0; round < maxToolRounds; round += 1) {
          const response = await client.responses.create({
            model,
            instructions,
            input,
            tools,
            store: false,
          });

          const toolCalls = (response?.output ?? []).filter(
            (item) => item.type === "function_call",
          );
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
            if (history.length > maxHistoryMessages) {
              history.splice(0, history.length - maxHistoryMessages);
            }
            return reply;
          }

          const outputs = await Promise.all(
            toolCalls.map(async (call) => ({
              type: "function_call_output",
              call_id: call.call_id,
              output: await runToolCall(handlers, call),
            })),
          );

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
          `The agent did not produce a reply within ${maxToolRounds} tool rounds`,
        );
      });
    },
  };
}
