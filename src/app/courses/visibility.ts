import type { Database } from "@/lib/supabase/database.types";

export type Visibility = Database["public"]["Enums"]["visibility"];

// 공개 범위 (GLOSSARY.md): who sees submissions after the deadline.
export const VISIBILITY_LABEL: Record<Visibility, string> = {
  private: "비공개",
  course: "수강생 공개",
  campus: "학내 공개",
};

export const VISIBILITY_HINT: Record<Visibility, string> = {
  private: "마감 후에도 교수·조교만 제출물을 봐요.",
  course: "마감 후 이 과목 수강생이 서로의 제출물을 봐요.",
  campus: "마감 후 로그인한 강남대 사용자 누구나 제출물을 봐요.",
};
