"use server";

import { refresh } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";

/** Marks the 과제 채점 완료 (its 제출물 open up per the 공개 범위) or takes it back. Only the course's 교수·조교 may (RLS). */
export async function setGraded(assignmentId: string, graded: boolean): Promise<{ error: string | null }> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("assignment")
    .update({ graded_at: graded ? new Date().toISOString() : null })
    .eq("id", assignmentId)
    .select("id");
  if (error || !data?.length) {
    if (error) console.error("setGraded failed", error.message);
    return { error: "이 과목의 담당 교수나 조교만 채점 완료를 표시할 수 있어요." };
  }
  refresh();
  return { error: null };
}
