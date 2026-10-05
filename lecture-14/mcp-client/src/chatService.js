import { GoogleGenAI, mcpToTool } from "@google/genai";

export class ChatService {
  // ChatService(ChatClient.Builder builder, ToolCallbackProvider mcpTools)
  constructor(mcpClient) {
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    this.tools = [mcpToTool(mcpClient)]; // builder.defaultTools(mcpTools)
  }

  // chatClient.prompt().user(message).call().content()
  async chat(message) {
    const response = await this.ai.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-3.5-flash-lite",
      contents: message,
      config: { tools: this.tools },
    });

    // text is undefined when the response is blocked or has no text part
    if (!response.text) {
      const reason = response.promptFeedback?.blockReason ?? response.candidates?.[0]?.finishReason ?? "unknown";
      throw new Error(`Model returned no text (reason: ${reason})`);
    }
    return response.text;
  }
}