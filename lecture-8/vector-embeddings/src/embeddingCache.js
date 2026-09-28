const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Kept outside src/ so writing it never trips the nodemon watcher.
const CACHE_DIR = path.join(__dirname, "..", ".cache");
const CACHE_FILE = path.join(CACHE_DIR, "movie-embeddings.json");

// Identifies one exact (model, corpus) pair. Change the model or edit a single
// movie description and the fingerprint changes, so the cache misses and the
// corpus is re-embedded.
function fingerprint(model, texts) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify({ model, texts }))
    .digest("hex");
}

function read(model, texts) {
  try {
    const cached = JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
    if (cached.fingerprint !== fingerprint(model, texts)) {
      return null;
    }
    if (!Array.isArray(cached.embeddings) || cached.embeddings.length !== texts.length) {
      return null;
    }
    return cached.embeddings;
  } catch {
    // Missing, unreadable or corrupt cache is not an error: just re-embed.
    return null;
  }
}

function write(model, texts, embeddings) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(
      CACHE_FILE,
      JSON.stringify({ model, fingerprint: fingerprint(model, texts), embeddings }),
    );
  } catch (error) {
    // A cache we cannot persist costs quota, not correctness.
    console.warn("Could not write embedding cache:", error.message);
  }
}

module.exports = { read, write, CACHE_FILE };
