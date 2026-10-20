import type { Database } from "@/lib/supabase/database.types";

export type PostCategory = Database["public"]["Enums"]["post_category"];

// 말머리 in the order the board shows them.
export const CATEGORY_LABEL: Record<PostCategory, string> = {
  free: "자유",
  question: "질문",
  career: "취창업",
  info: "정보",
  etc: "기타",
};

export const CATEGORIES = Object.keys(CATEGORY_LABEL) as PostCategory[];

/** Where a post's board lists it: its course, or the 메인 게시판. */
export function boardHref(courseId: string | null) {
  return courseId ? `/courses/${courseId}#board` : "/board";
}

export function toCategory(value: unknown): PostCategory | null {
  return CATEGORIES.find((category) => category === value) ?? null;
}
