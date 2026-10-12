"use server";

import { redirect } from "next/navigation";
import { withdrawUser } from "@/lib/withdrawal/withdraw-user";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";
import { CONFIRM_PHRASE } from "./confirm-phrase";

export type WithdrawFormState = { error: string | null };

// Raised by prepare_withdrawal() (supabase/migrations/*_withdrawal.sql).
const WITHDRAW_ERRORS: Record<string, string> = {
  KH006: "파일을 올리는 중이에요. 제출을 마친 뒤 잠시 후에 다시 시도해 주세요.",
};

export async function withdraw(_prev: WithdrawFormState, form: FormData): Promise<WithdrawFormState> {
  if (String(form.get("confirm") ?? "").trim() !== CONFIRM_PHRASE) {
    return { error: `확인을 위해 “${CONFIRM_PHRASE}”를 그대로 입력해 주세요.` };
  }

  const supabase = await createServerSupabase();
  const { error } = await withdrawUser({ userClient: supabase, adminClient: createAdminSupabase() });
  if (error) {
    const known = error.code ? WITHDRAW_ERRORS[error.code] : undefined;
    if (!known) console.error("withdraw failed", error.message);
    return { error: known ?? "탈퇴하지 못했어요. 잠시 뒤에 다시 해 주세요." };
  }

  // The 사용자 is gone; clear this browser's session cookies too.
  await supabase.auth.signOut({ scope: "local" });
  redirect("/?withdrawn=1");
}
