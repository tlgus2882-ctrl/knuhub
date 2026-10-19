"use server";

import { refresh } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";

// Raised by admin_promote_to_professor() / admin_set_student_number() (supabase/migrations/*_admin.sql).
const ADMIN_ERRORS: Record<string, string> = {
  KH011: "관리자만 할 수 있어요.",
  KH012: "학번은 숫자 6~12자리여야 하고, 다른 사용자가 쓰고 있지 않아야 해요. 차지한 사용자의 학번을 먼저 비워 주세요.",
  KH013: "학생만 교수로 승격할 수 있어요.",
};
const UNKNOWN_ERROR = "처리하지 못했어요. 잠시 뒤에 다시 해 주세요.";

function done(name: string, error: { code: string; message: string } | null): { error: string | null } {
  if (!error) {
    refresh();
    return { error: null };
  }
  console.error(`${name} failed`, error.message);
  return { error: ADMIN_ERRORS[error.code] ?? UNKNOWN_ERROR };
}

export async function promoteToProfessor(userId: string): Promise<{ error: string | null }> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("admin_promote_to_professor", { target_user: userId });
  return done("admin_promote_to_professor", error);
}

/** An empty value clears the 학번. */
export async function setStudentNumber(userId: string, studentNumber: string): Promise<{ error: string | null }> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("admin_set_student_number", {
    target_user: userId,
    new_student_number: studentNumber,
  });
  return done("admin_set_student_number", error);
}
