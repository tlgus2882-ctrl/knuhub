"use server";

import { refresh } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";

export type AppealFormState = { error: string | null; savedAt?: number };

// Who may file, answer and withdraw is decided by RLS (docs/adr/0002).
export async function createAppeal(_prev: AppealFormState, form: FormData): Promise<AppealFormState> {
  const body = readText(form, "body");
  if (!body) return { error: "이의신청 내용을 입력해 주세요." };

  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("grade_appeal")
    .insert({ assignment_id: String(form.get("assignment_id")), body });
  if (error?.code === "23505") return { error: "이 과제에는 이미 이의신청을 했어요." };
  if (error) return failed("createAppeal", error, "채점이 끝난 과제에 그 과목 수강생만 이의신청할 수 있어요.");

  refresh();
  return { error: null, savedAt: Date.now() };
}

export async function answerAppeal(_prev: AppealFormState, form: FormData): Promise<AppealFormState> {
  const answer = readText(form, "answer");
  if (!answer) return { error: "답변 내용을 입력해 주세요." };

  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("grade_appeal")
    .update({ answer })
    .eq("assignment_id", String(form.get("assignment_id")))
    .eq("student_id", String(form.get("student_id")))
    .select("student_id");
  if (error || !data?.length) return failed("answerAppeal", error, "이 과목의 담당 교수나 조교만 답변할 수 있어요.");

  refresh();
  return { error: null, savedAt: Date.now() };
}

/** The student takes back their own 이의신청, only while it is unanswered. */
export async function withdrawAppeal(assignmentId: string): Promise<{ error: string | null }> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("grade_appeal")
    .delete()
    .eq("assignment_id", assignmentId)
    .eq("student_id", user?.id ?? "")
    .select("student_id");
  if (error || !data?.length) return failed("withdrawAppeal", error, "답변을 받기 전에만 이의신청을 거둘 수 있어요.");

  refresh();
  return { error: null };
}

function readText(form: FormData, name: string): string {
  return String(form.get(name) ?? "").trim();
}

function failed(action: string, error: { message: string } | null, message: string): AppealFormState {
  if (error) console.error(`${action} failed`, error.message);
  return { error: message };
}
