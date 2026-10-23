import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ChatClient } from "../main/infrastructure/ChatClient.js";
import { createApplication } from "../main/app.js";

class FakeClient extends ChatClient {
  constructor() {
    super({ apiKey: "testing-api-key" });
    this.requests = [];
  }

  async embed(texts) {
    return texts.map((text) =>
      /\breturn\b|send it back/i.test(text)
        ? [1, 0, 0]
        : /refund/i.test(text)
          ? [0, 1, 0]
          : [0, 0, 1],
    );
  }

  async complete(messages, tools) {
    this.requests.push(structuredClone(messages));
    const question = messages.find((msg) => msg.role === "user")?.content;
    const results = messages.filter((msg) => msg.role === "tool");

    if (results.length) {
      return {
        role: "assistant",
        content: results.map((msg) => msg.content).join(" "),
      };
    }

    const orderId = question?.match(/ord-\d+/i)?.[0];

    if (orderId) {
      const name = /arrive/i.test(question)
        ? "getDeliveryEstimate"
        : /refund/i.test(question)
          ? "getRefundAmount"
          : "getOrderStatus";

      assert.equal(tools.length, 3);

      return {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: { name, arguments: JSON.stringify({ orderId }) },
          },
        ],
      };
    }
    return {
      role: "assistant",
      content: "Products can be returned within 30 days of delivery.",
    };
  }
}

test("load Policies, Retrive top k and complete tool calls with FakeClient", async () => {
  const client = new FakeClient();
  const { supportService } = await createApplication(client);

  const response = await supportService.chat(
    "How many days do I have to return a product?",
  );
  assert.deepEqual(
    response.retrievedDocuments.map((doc) => doc.source),
    ["return-policy.txt"],
  );
  assert.match(response.context, /within 30 days/);
  assert.deepEqual(response.toolUsed, []);
  assert.deepEqual(Object.keys(response).sort(), [
    "answer",
    "context",
    "retrievedDocuments",
    "toolArguments",
    "toolResults",
    "toolUsed",
  ]);

  // ToolTracker records the tool class name, not the LLM-facing function name
  for (const [question, tool, expected] of [
    ["Where is ord-101?", "OrderTrackerTool", /SHIPPED/],
    ["When will ORD-101 arrive?", "DeliveryEstimateTool", /15 October 2026/],
    ["How much refund for ORD-103?", "RefundAmountTool", /INR 4999/],
    ["Where is ORD-999?", "OrderTrackerTool", /ORD-999 not found/],
  ]) {
    const response = await supportService.chat(question);
    assert.deepEqual(response.toolUsed, [tool]);
    assert.match(response.answer, expected);
    assert.deepEqual(response.toolArguments[tool], {
      orderId: question.match(/ord-\d+/i)[0].toUpperCase(),
    });
    assert.equal(response.toolResults[tool], response.answer);
  }

  // concurrent chats must not leak tool usage into each other
  const [status, refund, policy] = await Promise.all([
    supportService.chat("Where is ORD-101?"),
    supportService.chat("How much refund for ORD-103?"),
    supportService.chat("What is the return policy?"),
  ]);
  assert.deepEqual(status.toolUsed, ["OrderTrackerTool"]);
  assert.deepEqual(refund.toolUsed, ["RefundAmountTool"]);
  assert.deepEqual(policy.toolUsed, []);
});

test("POST /chat accepts query and form parameters and rejects missing messages", async (t) => {
  const { server } = await createApplication(new FakeClient());
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  const url = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${url}/chat?message=Where%20is%20ORD-101`, {
    method: "POST",
  });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).toolUsed, ["OrderTrackerTool"]);
  const form = await fetch(`${url}/chat`, {
    method: "POST",
    body: new URLSearchParams({ message: "return policy" }),
  });
  assert.equal(form.status, 200);
  assert.deepEqual(
    (await form.json()).retrievedDocuments.map((doc) => doc.source),
    ["return-policy.txt"],
  );
  assert.equal((await fetch(`${url}/chat`, { method: "POST" })).status, 400);
  assert.equal((await fetch(`${url}/missing`, { method: "POST" })).status, 404);
});

test("embedding cache skips re-embedding unchanged documents across restarts", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "embedding-cache-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const embeddingCacheFile = join(directory, "embeddings.json");
  const countingClient = () => {
    const client = new FakeClient();
    client.embeddedTexts = [];
    const embed = client.embed.bind(client);
    client.embed = async (texts) => {
      client.embeddedTexts.push(...texts);
      return embed(texts);
    };
    return client;
  };
  const first = countingClient();
  await createApplication(first, { embeddingCacheFile });
  assert.equal(first.embeddedTexts.length, 3);
  const second = countingClient();
  const { supportService } = await createApplication(second, {
    embeddingCacheFile,
  });
  assert.equal(second.embeddedTexts.length, 0);
  const response = await supportService.chat(
    "How many days do I have to return a product?",
  );
  assert.deepEqual(
    response.retrievedDocuments.map((doc) => doc.source),
    ["return-policy.txt"],
  );
  const third = countingClient();
  third.embeddingModel = "another-model";
  await createApplication(third, { embeddingCacheFile });
  assert.equal(third.embeddedTexts.length, 3);
});

test("rejects invalid model tool calls and bounds tool-call loops", async () => {
  const client = new FakeClient();
  const { supportService } = await createApplication(client);
  client.complete = async () => ({
    tool_calls: [
      { id: "bad", function: { name: "notAllowed", arguments: "{}" } },
    ],
  });
  await assert.rejects(
    () => supportService.chat("Where is ORD-101?"),
    /Tool not found or invalid arguments/,
  );
  client.complete = async () => ({
    role: "assistant",
    tool_calls: [
      {
        id: "repeat",
        type: "function",
        function: {
          name: "getOrderStatus",
          arguments: '{"orderId":"ORD-101"}',
        },
      },
    ],
  });
  await assert.rejects(
    () => supportService.chat("Where is ORD-101?"),
    /Exceeded maximum number of chat rounds/,
  );
});
