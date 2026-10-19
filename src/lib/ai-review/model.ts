import "server-only";
import { CLAUDE_MODEL, claudeReviewModel } from "./claude";
import { GEMINI_MODEL, geminiReviewModel } from "./gemini";
import type { ReviewModel, TokenUsage } from "./review";

/**
 * The model AI 검토 uses on this server: Gemini while its key is set (see ./gemini.ts), else Claude.
 * `onUsage` hears each call's tokens (the 정확도 평가 script uses it for cost).
 */
export function reviewModel(onUsage?: (usage: TokenUsage) => void): ReviewModel | null {
  return geminiReviewModel(onUsage) ?? claudeReviewModel(onUsage);
}

/** The model name AI 검토 calls, for reports. */
export function reviewModelName(): string {
  return process.env.GEMINI_API_KEY ? GEMINI_MODEL : CLAUDE_MODEL;
}
