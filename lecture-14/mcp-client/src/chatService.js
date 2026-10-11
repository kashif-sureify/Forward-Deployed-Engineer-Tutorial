import { GoogleGenAI, mcpToTool } from "@google/genai";

export class ChatService {
  // ChatService(ChatClient.Builder builder, ToolCallbackProvider mcpTools)
  constructor(mcpClient) {
    this.mcpClient = mcpClient;
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    this.tools = [mcpToTool(mcpClient)]; // builder.defaultTools(mcpTools)
  }

  // Read the guidelines resource fresh on every chat so server-side edits show up immediately
  async getGuidelines() {
    const result = await this.mcpClient.readResource({ uri: "task://guidelines" });
    return result.contents.map((c) => c.text ?? "").join("\n");
  }

  // chatClient.prompt().system(guidelines).user(message).call().content()
  async chat(message) {
    const guidelines = await this.getGuidelines();
    const systemInstruction = `You are a task management assistant.

Use the following task management guidelines whenever they are relevant
to the user's question.

TASK GUIDELINES:

${guidelines}`;

    const response = await this.ai.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-3.5-flash-lite",
      contents: message,
      config: { systemInstruction, tools: this.tools },
    });

    // text is undefined when the response is blocked or has no text part
    if (!response.text) {
      const reason = response.promptFeedback?.blockReason ?? response.candidates?.[0]?.finishReason ?? "unknown";
      throw new Error(`Model returned no text (reason: ${reason})`);
    }
    return response.text;
  }

  async getPlan(hours) {
    const result = await this.mcpClient.getPrompt({
      name: "plan_day",
      arguments: { availableHours: String(hours) },
    });
    // The prompt only returns message text; chat() sends it to Gemini with the guidelines and task tools
    return this.chat(result.messages[0].content.text);
  }
}