"use server";

import { refresh } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";

/** Puts on or takes off the 교수 추천. Only the course's 교수·조교 may (RLS, docs/adr/0002). */
export async function setRecommended(submissionId: string, recommended: boolean): Promise<{ error: string | null }> {
  const supabase = await createServerSupabase();
  const { error } = recommended
    ? await supabase.from("recommendation").insert({ submission_id: submissionId })
    : // Already off (another tab) or not allowed both delete nothing; the refreshed page shows which.
      await supabase.from("recommendation").delete().eq("submission_id", submissionId);
  const alreadyOn = error?.code === "23505";
  if (error && !alreadyOn) {
    console.error("setRecommended failed", error.message);
    return { error: "그 과목의 교수님과 조교만 추천을 붙이고 뗄 수 있어요." };
  }
  refresh();
  return { error: null };
}
