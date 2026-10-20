import { createServerSupabase } from "@/lib/supabase/server";
import type { LikeTarget } from "./actions";
import { LikeButton } from "./like-button";

/** 좋아요 count and button for something the viewer can see (RLS hides the likes otherwise). */
export async function Likes({ target }: { target: LikeTarget }) {
  const supabase = await createServerSupabase();
  const [{ data: claims }, { data: likes }] = await Promise.all([
    supabase.auth.getClaims(),
    "submissionId" in target
      ? supabase.from("submission_like").select("user_id").eq("submission_id", target.submissionId)
      : supabase.from("post_like").select("user_id").eq("post_id", target.postId),
  ]);
  const me = claims?.claims.sub;
  const rows = likes ?? [];
  return <LikeButton target={target} count={rows.length} liked={rows.some((row) => row.user_id === me)} />;
}
