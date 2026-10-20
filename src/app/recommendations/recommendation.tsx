import { createServerSupabase } from "@/lib/supabase/server";
import { RecommendButton } from "./recommend-button";
import { RecommendedBadge } from "./recommended-badge";

/** On a 제출물: the 교수 추천 button for its course's 교수·조교, the mark for everyone else. */
export async function Recommendation({ submissionId }: { submissionId: string }) {
  const supabase = await createServerSupabase();
  const [{ data: row }, { data: isStaff }] = await Promise.all([
    supabase.from("recommendation").select("submission_id").eq("submission_id", submissionId).maybeSingle(),
    supabase.rpc("is_submission_course_staff", { target_submission: submissionId }),
  ]);
  if (isStaff) return <RecommendButton submissionId={submissionId} recommended={Boolean(row)} />;
  return row ? <RecommendedBadge /> : null;
}
