import express from "express";
export class SupportController {
  constructor(supportService) {
    this.supportService = supportService;
  }

  router() {
    const router = express.Router();
    router.post(
      "/chat",
      express.json({ limit: "64kb" }),
      express.urlencoded({ extended: true, limit: "64kb" }),
      async (req, res) => {
        await this.handle(req, res);
      },
    );
    return router;
  }

  async chat(message) {
    return this.supportService.chat(message);
  }

  async handle(request, response) {

    let message = request.query?.message ?? request.body?.message ?? null;

    if (typeof message !== "string" || !message.trim()) {
      response.status(400).json({ error: "Bad Request" });
      return;
    }

    try {
      response.json(await this.chat(message));
    } catch (error) {
      console.error("Error for SupportController:", error.message);
      response
        .status(502)
        .json({ error: "Internal Server Error" });
    }
  }
}
