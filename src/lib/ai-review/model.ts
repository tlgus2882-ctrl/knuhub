import "server-only";
import { CLAUDE_MODEL, claudeReviewModel } from "./claude";
import { GEMINI_MODEL, geminiReviewModel } from "./gemini";
import type { ReviewModel, TokenUsage } from "./review";

/**
 * The model AI 검토 uses on this server: Claude (paid) when its key is set, else Gemini, which is
 * for development only (see ./gemini.ts). A Gemini key left on the server never wins over Claude.
 * `onUsage` hears each call's tokens (the 정확도 평가 script uses it for cost).
 */
export function reviewModel(onUsage?: (usage: TokenUsage) => void): ReviewModel | null {
  return claudeReviewModel(onUsage) ?? geminiReviewModel(onUsage);
}

/** The model name AI 검토 calls, for reports. */
export function reviewModelName(): string {
  return process.env.ANTHROPIC_API_KEY || !process.env.GEMINI_API_KEY ? CLAUDE_MODEL : GEMINI_MODEL;
}
