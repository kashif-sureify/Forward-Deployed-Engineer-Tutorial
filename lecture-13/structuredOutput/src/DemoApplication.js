import MeetingService from "./MeetingService.js";

class DemoApplication {
  static async main(generativeModel) {
    const meetingService = new MeetingService(generativeModel);

    // Controller used by the Express routes
    return {
      scheduleMeeting: async (req, res) => {
        // Accept a plain-text body or JSON like { "text": "...", "sessionId": "..." }
        const text = typeof req.body === "string" ? req.body.trim() : req.body?.text;
        // Follow-up answers carry the sessionId from a previous "needs_input" reply
        const sessionId = req.body?.sessionId ?? req.query.sessionId;
        if (!text) {
          return res.status(400).json({ error: "Send plain text or JSON with a 'text' field." });
        }
        try {
          const result = await meetingService.scheduleMeeting(text, sessionId);
          res.json(result);
        } catch (error) {
          if (error.message.startsWith("Unknown or expired sessionId")) {
            return res.status(404).json({ error: error.message });
          }
          console.error("Failed to schedule meeting:", error);
          res.status(500).json({ error: error.message });
        }
      },
    };
  }
}

export default DemoApplication;
