"use server";

import { refresh } from "next/cache";
import type { Criterion } from "@/lib/ai-review/review";
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
