require("dotenv/config");
const { createApp } = require("./app.js");
const { createEmbeddingModel } = require("./embeddingModel.js");
const DemoApplication = require("./DemoApplication.js");

const port = Number(process.env.PORT || 8080);

async function start() {
  const embeddingModel = createEmbeddingModel();

  console.log("Embedding movies, this takes a moment...");
  const movieController = await DemoApplication.main(embeddingModel);

  const app = createApp(embeddingModel, movieController);

  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
}

start().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
