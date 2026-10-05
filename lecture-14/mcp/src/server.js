import dotenv from "dotenv";
import { createGenerativeModel } from "./generativeModel.js";
import { createApp } from "./app.js";
import DemoApplication from "./DemoApplication.js";

dotenv.config();

const PORT = Number(process.env.PORT) || 8080;

async function startServer() {
  const generativeModel = createGenerativeModel();
  const schedulerController = await DemoApplication.main(generativeModel);

  const app = createApp(schedulerController);

  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

startServer().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
