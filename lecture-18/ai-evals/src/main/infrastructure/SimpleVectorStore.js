import { createHash } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { dirname } from "node:path";

export function cosineSimilarity(a, b) {
  if (!a.length || a.length !== b.length) {
    throw new Error("Vectors must be of the same length and non-empty");
  }
  const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const norm = Math.hypot(...a) * Math.hypot(...b);
  return norm ? dotProduct / norm : 0;
}

export class simpleVectorStore {
  constructor(embeddingModel, { cacheFile } = {}) {
    Object.assign(this, { embeddingModel, cacheFile });
    this.documents = [];
  }

  cacheKey(text) {
    return createHash("sha256")
      .update(`${this.embeddingModel.embeddingModel} \n ${text}`)
      .digest("hex");
  }

  async readCache() {
    if (!this.cacheFile) return null;
    try {
      const data = await readFile(this.cacheFile, "utf-8");
      return JSON.parse(data);
    } catch (error) {
      if (error.code !== "ENOENT") {
        console.warn("Error reading cache file:", error);
      }
      return null;
    }
  }

  async addDocument(document) {
    if (!this.cacheFile) {
      const vectors = await this.embeddingModel.embed(
        document.map((doc) => doc.text),
      );

      this.documents = document.map((doc, i) => ({
        ...doc,
        embedding: vectors[i],
      }));

      return;
    }

    const cache = (await this.readCache()) ?? {};
    const keys = document.map((doc) => this.cacheKey(doc.text));
    const uniqueKeys = new Set(keys);
    const missing = [...uniqueKeys].filter((k) => !cache[k]);

    if (missing.length) {
      const textByKey = Object.fromEntries(
        keys.map((k, i) => [k, document[i].text]),
      );
      const vectors = await this.embeddingModel.embed(
        missing.map((k) => textByKey[k]),
      );
      missing.forEach((k, i) => (cache[k] = vectors[i]));
    }

    if (missing.length || Object.keys(cache).length !== uniqueKeys.size) {
      const current = Object.fromEntries(keys.map((k) => [k, cache[k]]));
      await mkdir(dirname(this.cacheFile), { recursive: true });
      await writeFile(this.cacheFile, JSON.stringify(current), "utf-8");
    }

    this.documents = document.map((doc, i) => ({
      ...doc,
      embedding: cache[keys[i]],
    }));

    console.log(
      `Embeddings : ${uniqueKeys.size - missing.length} cached ${missing.length} fetched`,
    );
  }
  async similaritySearch(query, topK = 5) {
    const [embedding] = await this.embeddingModel.embed([query]);
    const similarities = this.documents.map((doc) => ({
      document: doc,
      similarity: cosineSimilarity(embedding, doc.embedding),
    }));
    similarities.sort((a, b) => b.similarity - a.similarity);
    return similarities.slice(0, topK).map((item) => item.document);
  }
}
