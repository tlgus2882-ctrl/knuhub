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

export function toCategory(value: unknown): PostCategory | null {
  return CATEGORIES.find((category) => category === value) ?? null;
}
