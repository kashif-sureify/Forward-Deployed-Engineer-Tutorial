import dotenv from "dotenv";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createApplication } from "../main/app.js";
import { ChatClient } from "../main/infrastructure/ChatClient.js";
import { EvalCase } from "../main/models/EvalCase.js";
import { JudgeResult } from "../main/models/JudgeResult.js";

dotenv.config({ quiet: true });

const resourceDir = new URL("../main/resource/", import.meta.url);

const metrics = [
  "relevance",
  "correctness",
  "helpfulness",
  "faithfulness",
  "hallucinationFree",
];

// golden dataset uses the LLM-facing tool names; ToolTracker records class names
const toolNames = {
  getOrderStatus: "OrderTrackerTool",
  getDeliveryEstimate: "DeliveryEstimateTool",
  getRefundAmount: "RefundAmountTool",
};

const judgeSchema = {
  type: "object",
  properties: {
    ...Object.fromEntries(
      metrics.map((metric) => [
        metric,
        { type: "integer", minimum: 1, maximum: 5 },
      ]),
    ),
    reason: { type: "string" },
  },
  required: [...metrics, "reason"],
  additionalProperties: false,
};

test("runGoldenDataset", async () => {
  const { supportService } = await createApplication(new ChatClient(), {
    embeddingCacheFile:
      process.env.EMBEDDING_CACHE_FILE ?? ".cache/embedding.json",
  });

  const judgeClient = new ChatClient();

  const cases = JSON.parse(
    await readFile(new URL("golden-dataset.json", resourceDir), "utf8"),
  );

  const rubric = await readFile(new URL("judge-rubrics.txt", resourceDir), "utf8");

  const totals = Object.fromEntries(metrics.map((metric) => [metric, 0]));

  const failures = [];

  for (const data of cases) {
    const evalCase = new EvalCase(data);
    const response = await supportService.chat(evalCase.question);
    const trackedTool = toolNames[evalCase.expectedTool];
    const checks = {
      "Response Exist": Boolean(response?.answer?.trim()),
      "Correct Tools":
        evalCase.expectedTool === null
          ? response?.toolUsed?.length === 0
          : response?.toolUsed?.includes(trackedTool),
      "Correct Tool Arguments":
        evalCase.expectedTool === null ||
        response?.toolArguments?.[trackedTool]?.orderId ===
          evalCase.expectedToolArgument,
      "Expected Source Retrieved":
        evalCase.expectedSource === null ||
        response?.retrievedDocuments?.some(
          (doc) => doc.source === evalCase.expectedSource,
        ),
    };

    const prompt = `Evaluate the following response based on the rubric:

USER QUESTION: ${evalCase.question}
EXPECTED ANSWER: ${evalCase.expectedAnswer ?? ""}
EXPECTED BEHAVIOR: ${evalCase.expectedBehavior ?? ""}
RETRIEVED POLICY CONTEXT: ${response?.context ?? ""}
TOOL RESULTS: ${JSON.stringify(response?.toolResults)}
ACTUAL ANSWER: ${response?.answer ?? ""}
Rubric: ${rubric}

Return a JSON object that conforms to the following schema with integer fields (1-5) for each metric:
${metrics.join(", ")} and a string "reason" field for justification.
`;

    const message = await judgeClient.complete(
      [
        {
          role: "system",
          content:
            "You are strict AI Evaluator. Evaluate the response based on the provided rubric and return a JSON object with integer fields for each metric and a string 'reason' field for justification.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      null,
      judgeSchema,
    );

    const judge = new JudgeResult(JSON.parse(message.content));

    for (const metric of metrics) {
      assert.ok(
        Number.isInteger(judge[metric]) &&
          judge[metric] >= 1 &&
          judge[metric] <= 5,
        `Invalid Judge score for metric: ${metric} in ${evalCase.id} : ${message.content}`,
      );
      totals[metric] += judge[metric];
    }

    const passed =
      Object.values(checks).every(Boolean) &&
      metrics.every((metric) => judge[metric] >= 4);

    if (!passed) {
      failures.push({
        evalCaseId: evalCase.id,
        message: message.content,
      });
    }

    console.log(
      JSON.stringify(
        {
          test: evalCase.id,
          question: evalCase.question,
          answer: response?.answer ?? "",
          deterministic: checks,
          quality: judge,
          finalResult: passed ? "PASS" : "FAILED",
        },
        null,
        2,
      ),
    );
  }

  console.log("FINAL EVALUATION RESULTS", {
    total: cases.length,
    passed: cases.length - failures.length,
    failed: failures.length,
    average: Object.fromEntries(
      metrics.map((metric) => [
        metric,
        Math.round((totals[metric] / cases.length) * 100) / 100,
      ]),
    ),
  });

  assert.deepEqual(
    failures,
    [],
    `failed Evaluation Cases ${failures.map((f) => f.evalCaseId).join(", ")}`,
  );
});
