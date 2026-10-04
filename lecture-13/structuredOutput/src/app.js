import express from "express";

export const createApp = (generativeModel, schedulerController) => {
  const app = express();

  app.use(express.text({ type: "*/*", limit: "10mb" }));
  app.use((req, res, next) => {
    if (typeof req.body === "string") {
      try {
        req.body = JSON.parse(req.body);
      } catch {
      }
    }
    next();
  });

  app.get("/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/meetings", schedulerController.scheduleMeeting);

  app.use((req,res)=> {
    res.status(404).json({ error: "Not Found" });
  });
  return app;
};