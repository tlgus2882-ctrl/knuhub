import "server-only";
import { FinishReason, GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type { ReviewModel } from "./review";

// shortcut: a free Gemini API key lets Google use and human-review what we send (Unpaid Services terms),
// so it is only for development and the mock course. Switch to a paid Gemini key or ANTHROPIC_API_KEY
// before any real 제출물 goes through AI 검토.

/** The current lightweight Gemini model, unless AI_REVIEW_MODEL names another. */
const MODEL = process.env.AI_REVIEW_MODEL ?? "gemini-3.5-flash-lite";

/** The Gemini adapter for AI 검토, or null when this server has no Gemini API key. */
export function geminiReviewModel(): ReviewModel | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  const client = new GoogleGenAI({ apiKey });
  return {
    async countTokens({ system, user }) {
      const { totalTokens } = await client.models.countTokens({ model: MODEL, contents: `${system}\n${user}` });
      return totalTokens ?? Infinity;
    },
    async generate({ system, user }, schema) {
      const response = await client.models.generateContent({
        model: MODEL,
        contents: user,
        config: {
          systemInstruction: system,
          responseMimeType: "application/json",
          responseJsonSchema: z.toJSONSchema(schema),
        },
      });
      // A blocked or cut-off answer is no answer.
      if (response.candidates?.[0]?.finishReason !== FinishReason.STOP || !response.text) return null;
      return JSON.parse(response.text);
    },
  };
}
