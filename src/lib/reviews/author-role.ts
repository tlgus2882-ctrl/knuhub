/**
 * The 리뷰 author's role inside the 과목 of the reviewed 제출물, as the DB computed column
 * `review.author_role` returns it. `null` means the author is not in that 과목 (no badge).
 */
export type ReviewAuthorRole = "professor" | "assistant" | "student";

export const REVIEW_AUTHOR_ROLE_LABEL: Record<ReviewAuthorRole, string> = {
  professor: "교수",
  assistant: "조교",
  student: "학생",
};

/**
 * How much each role's 리뷰 counts in the AI 강점·약점 요약 (교수 > 조교 > 학생). An author outside
 * the 과목 counts as a 학생. Change the weights here only.
 */
export const REVIEW_WEIGHTS: Record<ReviewAuthorRole, number> = {
  professor: 3,
  assistant: 2,
  student: 1,
};

/** Narrows the computed column's text to a role, or null for anything else. */
export function toReviewAuthorRole(value: string | null | undefined): ReviewAuthorRole | null {
  return value === "professor" || value === "assistant" || value === "student" ? value : null;
}

export function reviewWeight(role: ReviewAuthorRole | null): number {
  return REVIEW_WEIGHTS[role ?? "student"];
}
