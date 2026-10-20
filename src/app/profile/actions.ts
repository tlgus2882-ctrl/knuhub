"use server";

import { refresh } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { CONTACT_VISIBILITY_LABEL, type ContactVisibility } from "./contact-visibility";

export type ProfileFormState = { error: string | null; savedAt?: number };

const CHECK_VIOLATION = "23514";

// Only my own name and contacts can change; RLS and the column grants enforce it,
// and the DB checks the link and GitHub formats (docs/adr/0002).
export async function saveProfile(_prev: ProfileFormState, form: FormData): Promise<ProfileFormState> {
  const name = String(form.get("name") ?? "").trim();
  const openChatUrl = String(form.get("open_chat_url") ?? "").trim();
  const github = String(form.get("github") ?? "").trim().replace(/^@/, "");
  const visibility = String(form.get("contact_visibility") ?? "private");

  if (!name) return { error: "이름을 입력해 주세요." };
  if (!Object.hasOwn(CONTACT_VISIBILITY_LABEL, visibility)) return { error: "연락처 공개 범위를 골라 주세요." };

  // One transaction: the name and the contact methods change together or not at all.
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("update_my_profile", {
    new_name: name,
    show_email: form.get("show_email") === "on",
    contact_visibility: visibility as ContactVisibility,
    // Left out = cleared (the function defaults them to null).
    open_chat_url: openChatUrl || undefined,
    github: github || undefined,
  });
  if (error) return failed(error);

  refresh();
  return { error: null, savedAt: Date.now() };
}

function failed(error: { code: string; message: string }): ProfileFormState {
  // The name is checked above, so a CHECK failure here is the link or GitHub format.
  if (error.code === CHECK_VIOLATION) {
    return { error: "오픈채팅은 https://open.kakao.com/… 링크로, GitHub는 아이디만 입력해 주세요." };
  }
  console.error("saveProfile failed", error.message);
  return { error: "저장하지 못했어요. 잠시 뒤에 다시 해 주세요." };
}

/** My 자기소개; an empty one clears it. Only I can change it (RLS). */
export async function saveBio(_prev: ProfileFormState, form: FormData): Promise<ProfileFormState> {
  const bio = String(form.get("bio") ?? "").trim();
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "다시 로그인해 주세요." };
  const { error } = await supabase.from("profile").update({ bio }).eq("id", user.id);
  if (error) {
    console.error("saveBio failed", error.message);
    return { error: "자기소개를 저장하지 못했어요. 2000자까지 쓸 수 있어요." };
  }

  refresh();
  return { error: null, savedAt: Date.now() };
}
