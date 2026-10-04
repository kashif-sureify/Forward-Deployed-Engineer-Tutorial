import { randomUUID } from "node:crypto";
import { z } from "zod";

// What the model fills in; mandatory fields are nullable so it can say "not given" instead of guessing
export const MeetingDraftSchema = z.object({
  title: z.string().describe("Short title for the meeting"),
  date: z.string().nullable().describe("Meeting date in YYYY-MM-DD format, or null if not given"),
  time: z.string().nullable().describe("Start time in 24-hour HH:MM format, or null if not given"),
  durationMinutes: z.number().int().describe("Meeting length in minutes; default 30 if not stated"),
  attendees: z.array(z.string()).describe("Names of the people attending, empty if none given"),
  location: z.string().nullable().describe("Place or link, or null if not mentioned"),
});

// The final meeting, only produced once every mandatory field is present
export const MeetingSchema = MeetingDraftSchema.extend({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "time must be HH:MM"),
});

const REQUIRED_FIELDS = {
  date: "the meeting date",
  time: "the start time",
};

class MeetingService {
  constructor(generativeModel) {
    this.generativeModel = generativeModel;
    // sessionId -> partially filled meeting, kept until the user supplies the missing fields
    this.drafts = new Map();
  }

  async scheduleMeeting(meetingDetails, sessionId) {
    const previousDraft = sessionId ? this.drafts.get(sessionId) : undefined;
    if (sessionId && !previousDraft) {
      throw new Error(`Unknown or expired sessionId: ${sessionId}`);
    }

    const today = new Date().toLocaleDateString("en-CA");
    const systemInstruction =
      `You extract meeting information from the user's request.

      Today's date is ${today}.

      Rules:

      - Convert relative dates like today and tomorrow
        into yyyy-MM-dd format.

      - Convert time into 24-hour HH:mm format.

      - If title is missing, create a simple title.

      - If duration is missing, use 30 minutes.

      - Do not invent attendee, date or time.

      - If date or time is missing, return null for it.

      - If a current draft is given, keep its values and only
        change or fill fields the user's new message mentions.
`;

    const prompt = previousDraft
      ? `Current draft:\n${JSON.stringify(previousDraft, null, 2)}\n\nUser's new message:\n${meetingDetails}`
      : meetingDetails;

    const draft = await this.generativeModel.generateStructured(prompt, MeetingDraftSchema, systemInstruction);

    const missingFields = Object.keys(REQUIRED_FIELDS).filter((field) => !draft[field]);
    if (missingFields.length > 0) {
      const id = sessionId ?? randomUUID();
      this.drafts.set(id, draft);
      const missingText = missingFields.map((field) => REQUIRED_FIELDS[field]).join(" and ");
      return {
        status: "needs_input",
        sessionId: id,
        missingFields,
        message: `Please provide ${missingText}.`,
        draft,
      };
    }

    if (sessionId) this.drafts.delete(sessionId);
    return { status: "scheduled", meeting: MeetingSchema.parse(draft) };
  }
}

export default MeetingService;
