const SYSTEM_PROMPT = 'You are a helpful AI assistant. Answer questions clearly and simply.';
const DEFAULT_MODEL = 'gemini-flash-latest';
const DEFAULT_TEMPERATURE = 0.4;

// Like the Spring singleton service, history is shared and kept in memory.
export class ChatService {
  constructor(client, { model, temperature } = {}) {
    this.client = client;
    this.model = model || DEFAULT_MODEL;
    this.temperature = temperature ?? DEFAULT_TEMPERATURE;
    this.history = [];
    this.queue = Promise.resolve();
  }

  // Serialize chat/clear operations so simultaneous requests preserve turn order.
  runInOrder(operation) {
    const result = this.queue.then(operation);
    this.queue = result.catch(() => {});
    return result;
  }

  // `onChunk` is called with each piece of text as the model streams it back.
  chat(message, image, onChunk = () => {}) {
    return this.runInOrder(async () => {
      const parts = [{ text: message }];
      console.log('Creating chat parts with message:', image.buffer.toString('base64'));
      if (image && image.buffer.length > 0) {
        parts.push({
          inlineData: { mimeType: image.mimetype, data: image.buffer.toString('base64') },
        });
      }
      const userMessage = { role: 'user', parts };
      const stream = await this.client.models.generateContentStream({
        model: this.model,
        contents: [...this.history, userMessage],
        config: {
          systemInstruction: SYSTEM_PROMPT,
          temperature: this.temperature,
        },
      });
      let reply = '';
      for await (const chunk of stream) {
        const text = chunk.text;
        if (text) {
          reply += text;
          onChunk(text);
        }
      }
      if (reply.length === 0) {
        throw new Error('The model returned no text response.');
      }
      // Only commit a complete turn after the API call succeeds.
      this.history.push(userMessage, { role: 'model', parts: [{ text: reply }] });
      return reply;
    });
  }

  clearHistory() {
    return this.runInOrder(() => { this.history.length = 0; });
  }
}
