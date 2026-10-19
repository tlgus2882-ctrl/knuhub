"use server";

import { refresh } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";

export type Criterion = { name: string; points: number; description: string };

// Raised by save_grading_criteria() (supabase/migrations/*_grading_criteria.sql).
const CRITERIA_ERRORS: Record<string, string> = {
  KH003: "이 과목의 담당 교수나 조교만 채점 항목을 정할 수 있어요.",
  KH007: "채점 항목마다 이름(200자까지)과 0~1000점 정수 배점을 넣어 주세요. 50개까지 정할 수 있어요.",
};

/** Replaces the 과제's 채점 항목 with `criteria`, in order. Saving is confirming. */
export async function saveGradingCriteria(assignmentId: string, criteria: Criterion[]): Promise<{ error: string | null }> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("save_grading_criteria", { target_assignment: assignmentId, criteria });
  if (error) {
    console.error("saveGradingCriteria failed", error.message);
    return { error: CRITERIA_ERRORS[error.code] ?? "저장하지 못했어요. 잠시 뒤에 다시 해 주세요." };
  }
  refresh();
  return { error: null };
}
