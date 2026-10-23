import { readFile, readdir } from "node:fs/promises";
import { AgentResponse } from "./models/AgentResponse.js";

export const resource = await readFile(
  new URL("resource/systemPrompt.txt", import.meta.url),
  "utf-8",
);
export class SupportService {
  constructor(
    chatClient,
    vectorStore,
    orderStatusTool,
    deliveryEstimationTool,
    refundAmountTool,
    toolTracker,
  ) {
    Object.assign(this, { chatClient, vectorStore, toolTracker });
    this.registry = {};
    for (const [tool, name, method] of [
      [orderStatusTool, "getOrderStatus", "getOrderStatus"],
      [deliveryEstimationTool, "getDeliveryEstimate", "getEstimateDelivery"],
      [refundAmountTool, "getRefundAmount", "getRefundAmount"],
    ]) {
      this.registry[name] = {
        description: tool?.constructor?.description,
        execute: (id) => tool[method](id),
      };
    }
  }
  async loadKnowledgeBase() {
    const directory = new URL("resource/knowledge/", import.meta.url);
    const names = (await readdir(directory))
      .filter((file) => file.endsWith(".txt"))
      .sort();

    const documents = await Promise.all(
      names.map(async (source) => ({
        text: await readFile(new URL(source, directory), "utf-8"),
        metadata: { source },
      })),
    );

    await this.vectorStore.addDocument(documents);
    this.systemPrompt = resource;

    console.log("Knowledge base loaded with documents:", documents.length);
  }

  async chat(question) {
    return this.toolTracker.run(async () => {
      this.toolTracker.clear();

      const documents = await this.vectorStore.similaritySearch(question, 1);

      const context = documents
        .map((doc) => `SOURCE : ${doc.metadata.source} \n${doc.text}`)
        .join("\n");

      const answer = await this.chatClient.chat(
        `${this.systemPrompt}\n\n${context}`,
        question,
        this.registry,
      );
      return new AgentResponse({
        answer,
        retrievedDocuments: documents.map((doc) => ({
          source: doc.metadata.source,
          text: doc.text,
        })),
        toolUsed: this.toolTracker.getToolsUsed(),
        toolArguments: this.toolTracker.getToolArguments(),
        toolResults: this.toolTracker.getToolResults(),
        context,
      });
    });
  }
}
