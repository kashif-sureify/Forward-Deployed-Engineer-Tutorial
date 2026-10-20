import "dotenv/config";
import { createApplication } from "./app.js";
import { ChatClient } from "./infrastructure/ChatClient.js";

const PORT = process.env.PORT || 3000;

const embeddingCacheFile = process.env.EMBEDDING_CACHE_FILE ?? ".cache/embedding.json";


const { server } = await createApplication( new ChatClient(), { embeddingCacheFile });
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
