"use server";

import { refresh } from "next/cache";
import { claudeReviewModel } from "@/lib/ai-review/claude";
import { draftCriteria, type Criterion } from "@/lib/ai-review/review";
import { createServerSupabase } from "@/lib/supabase/server";

export type { Criterion };

// Raised by save_grading_criteria() (supabase/migrations/*_grading_criteria.sql).
const CRITERIA_ERRORS: Record<string, string> = {
  KH003: "이 과목의 담당 교수나 조교만 채점 항목을 정할 수 있어요.",
  KH007: "채점 항목은 1~50개, 항목마다 이름(200자까지)과 0~1000점 정수 배점, 설명(2000자까지)으로 정해 주세요.",
};
const UNKNOWN_ERROR = "저장하지 못했어요. 잠시 뒤에 다시 해 주세요.";

/** Replaces the 과제's 채점 항목 with `criteria`, in order. Saving is confirming. */
export async function saveGradingCriteria(assignmentId: string, criteria: Criterion[]): Promise<{ error: string | null }> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("save_grading_criteria", { target_assignment: assignmentId, criteria });
  if (error) {
    console.error("saveGradingCriteria failed", error.message);
    return { error: CRITERIA_ERRORS[error.code] ?? UNKNOWN_ERROR };
  }
  refresh();
  return { error: null };
}

/**
 * AI 초안: proposes 채점 항목 from the 과제 description. Nothing is saved; the editor
 * shows the draft until the professor or an assistant saves it.
 */
export async function draftGradingCriteria(assignmentId: string): Promise<{ error: string | null; criteria?: Criterion[] }> {
  const supabase = await createServerSupabase();
  const { data: assignment } = await supabase
    .from("assignment")
    .select("course_id, description")
    .eq("id", assignmentId)
    .maybeSingle();
  // The API call costs money, so only the course's professor and assistants may make it.
  const { data: staff } = assignment
    ? await supabase.rpc("is_professor_or_assistant", { target_course: assignment.course_id })
    : { data: false };
  if (!assignment || !staff) return { error: CRITERIA_ERRORS.KH003 };
  if (!assignment.description.trim()) return { error: "과제 설명이 비어 있어서 초안을 만들 수 없어요." };

  const model = claudeReviewModel();
  if (!model) return { error: "AI 기능이 아직 설정되지 않았어요. 관리자에게 문의해 주세요." };
  const criteria = await draftCriteria(model, assignment.description);
  if (!criteria?.length) return { error: "초안을 만들지 못했어요. 과제 설명이 너무 길지 않은지 보고 잠시 뒤에 다시 해 주세요." };
  return { error: null, criteria };
}
