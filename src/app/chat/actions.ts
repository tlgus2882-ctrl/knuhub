"use server";

import { createServerSupabase } from "@/lib/supabase/server";

/** A 채팅 메시지 as everyone sees it: the 채팅 별명 number, never the author. */
export type ChatMessage = { id: string; alias: number; body: string; created_at: string; mine: boolean };

// Raised by send_chat_message() (supabase/migrations/*_anonymous_chat.sql).
const SEND_ERRORS: Record<string, string> = {
  KH020: "채팅 메시지는 1~100자로 써 주세요.",
  KH021: "5초에 한 번만 보낼 수 있어요.",
};

/** The latest 100 채팅 메시지, oldest first. */
export async function loadChatMessages(): Promise<ChatMessage[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("recent_chat_messages");
  if (error) console.error("loadChatMessages failed", error.message);
  return data ?? [];
}

// Everyone else gets the message from the DB's broadcast; the sender gets it back here.
export async function sendChatMessage(message: string): Promise<{ message: ChatMessage | null; error: string | null }> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("send_chat_message", { message }).single();
  if (error) {
    if (!SEND_ERRORS[error.code]) console.error("sendChatMessage failed", error.message);
    return { message: null, error: SEND_ERRORS[error.code] ?? "보내지 못했어요. 잠시 뒤에 다시 보내 주세요." };
  }
  return { message: { ...data, mine: true }, error: null };
}

const UNIQUE_VIOLATION = "23505";

/** 신고 for a 채팅 메시지; it goes to the 관리자 페이지 with the real author. */
export async function reportChatMessage(messageId: string, reason: string): Promise<{ error: string | null }> {
  const text = reason.trim();
  if (!text) return { error: "신고 사유를 골라 주세요." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("report").insert({ chat_message_id: messageId, reason: text });
  if (error?.code === UNIQUE_VIOLATION) return { error: "이미 신고했어요. 관리자가 확인할 거예요." };
  if (error) {
    console.error("reportChatMessage failed", error.message);
    return { error: "신고하지 못했어요. 메시지가 지워졌을 수 있어요." };
  }
  return { error: null };
}
