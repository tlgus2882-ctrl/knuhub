import type { Database } from "@/lib/supabase/database.types";

export type ContactVisibility = Database["public"]["Enums"]["contact_visibility"];

// 연락처 공개 범위 (GLOSSARY.md): who sees my contact methods on my 작성자 카드.
export const CONTACT_VISIBILITY_LABEL: Record<ContactVisibility, string> = {
  public: "전체",
  course: "수강생",
  private: "비공개",
};

export const CONTACT_VISIBILITY_HINT: Record<ContactVisibility, string> = {
  public: "로그인한 강남대 사용자 누구나 봐요.",
  course: "나와 같은 과목의 수강생·교수·조교만 봐요.",
  private: "아무에게도 보이지 않아요.",
};
