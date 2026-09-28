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

  // One request for the whole list. The API returns an entry per input, which
  // we order by `index` rather than trusting response order.
  async function embedBatch(texts) {
    if (texts.length === 0) {
      return [];
    }
    const response = await client.embeddings.create({
      model,
      input: texts,
    });
    return response.data
      .slice()
      .sort((first, second) => first.index - second.index)
      .map((item) => item.embedding);
  }

  return { model, embed, embedBatch };
}

module.exports = { createEmbeddingModel };
