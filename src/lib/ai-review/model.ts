import "server-only";
import { claudeReviewModel } from "./claude";
import { geminiReviewModel } from "./gemini";
import type { ReviewModel } from "./review";

/** The model AI 검토 uses on this server: Gemini while its key is set (see ./gemini.ts), else Claude. */
export function reviewModel(): ReviewModel | null {
  return geminiReviewModel() ?? claudeReviewModel();
}
