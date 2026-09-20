const { OpenAI } = require("openai");

function createEmbeddingModel() {
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL,
  });
  const model = process.env.EMBEDDING_MODEL;

  async function embed(text) {
    const response = await client.embeddings.create({
      model,
      input: text,
    });
    return response.data[0].embedding;
  }

  return { model, embed };
}

module.exports = { createEmbeddingModel };
