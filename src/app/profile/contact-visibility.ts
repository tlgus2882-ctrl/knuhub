import type { Database, Tables } from "@/lib/supabase/database.types";

export type ContactVisibility = Database["public"]["Enums"]["contact_visibility"];

/** My contact methods and who may see them, as stored in profile_contact. */
export type ContactSettings = Pick<
  Tables<"profile_contact">,
  "show_email" | "open_chat_url" | "github" | "contact_visibility"
>;

/** What applies until I save my own: 학교 메일 shown to everyone (matches the DB defaults). */
export const NO_CONTACT_SETTINGS: ContactSettings = {
  show_email: true,
  open_chat_url: null,
  github: null,
  contact_visibility: "public",
};

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
