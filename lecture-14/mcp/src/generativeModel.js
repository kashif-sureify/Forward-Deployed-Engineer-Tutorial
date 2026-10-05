import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

export const createGenerativeModel = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set. Add it to your .env file.");
  }

  const client = new GoogleGenAI({ apiKey });
  const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";

  // Plain text response
  const generateText = async (prompt, systemInstruction) => {
    const response = await client.models.generateContent({
      model,
      contents: prompt,
      config: { systemInstruction },
    });
    return response.text;
  };

  // Structured response validated against a Zod schema
  const generateStructured = async (prompt, schema, systemInstruction) => {
    const response = await client.models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseJsonSchema: z.toJSONSchema(schema),
      },
    });
    return schema.parse(JSON.parse(response.text));
  };

  return { client, model, generateText, generateStructured };
};
