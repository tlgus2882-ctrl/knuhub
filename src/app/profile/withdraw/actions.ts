"use server";

import { redirect } from "next/navigation";
import { withdrawUser } from "@/lib/account/withdraw-user";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";
import { CONFIRM_PHRASE } from "./confirm-phrase";

export type WithdrawFormState = { error: string | null };

// Raised by prepare_withdrawal() (supabase/migrations/*_withdrawal.sql).
const WITHDRAW_ERRORS: Record<string, string> = {
  KH006: "과목을 연 교수는 스스로 탈퇴할 수 없어요. 과목과 학생들의 제출물이 함께 지워지기 때문이에요. 관리자에게 문의해 주세요.",
};

export async function withdraw(_prev: WithdrawFormState, form: FormData): Promise<WithdrawFormState> {
  if (String(form.get("confirm") ?? "").trim() !== CONFIRM_PHRASE) {
    return { error: `확인을 위해 “${CONFIRM_PHRASE}”를 그대로 입력해 주세요.` };
  }

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "다시 로그인해 주세요." };

  const { error } = await withdrawUser({ userClient: supabase, adminClient: createAdminSupabase(), userId: user.id });
  if (error) {
    const known = error.code ? WITHDRAW_ERRORS[error.code] : undefined;
    if (!known) console.error("withdraw failed", error.message);
    return { error: known ?? "탈퇴하지 못했어요. 잠시 뒤에 다시 해 주세요." };
  }

  // The 사용자 is gone; clear this browser's session cookies too.
  await supabase.auth.signOut({ scope: "local" });
  redirect("/?withdrawn=1");
}
