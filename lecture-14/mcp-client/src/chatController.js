import { Router } from "express";

// @RestController
export function chatController(chatService) {
  const router = Router();

  // @GetMapping("/ask")
  router.get("/ask", async (req, res) => {
    const { message } = req.query; // @RequestParam String message

    if (!message) return res.status(400).send("Required parameter 'message' is missing");

    try {
      res.send(await chatService.chat(message));
    } catch (err) {
      console.error(err);
      res.status(500).send(err.message);
    }
  });

  // @GetMapping("/guidelines") - raw task://guidelines resource from the MCP server
  router.get("/guidelines", async (req, res) => {
    try {
      res.type("text/plain").send(await chatService.getGuidelines());
    } catch (err) {
      console.error(err);
      res.status(500).send(err.message);
    }
  });

  return router;
}