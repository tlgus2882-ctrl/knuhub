"use server";

import { refresh } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";

export type LikeTarget = { submissionId: string } | { postId: string };

/** 좋아요 or its 취소. Who may like what is decided by RLS (docs/adr/0002). */
export async function setLiked(target: LikeTarget, liked: boolean): Promise<{ error: string | null }> {
  const supabase = await createServerSupabase();
  const { error } =
    "submissionId" in target
      ? await (liked
          ? supabase.from("submission_like").insert({ submission_id: target.submissionId })
          : supabase.from("submission_like").delete().eq("submission_id", target.submissionId))
      : await (liked
          ? supabase.from("post_like").insert({ post_id: target.postId })
          : supabase.from("post_like").delete().eq("post_id", target.postId));
  // Pressing twice (two tabs) is not an error: the like is already there.
  if (error && error.code !== "23505") {
    console.error("setLiked failed", error.message);
    return { error: "좋아요를 누르지 못했어요. 새로 고쳐 주세요." };
  }
  refresh();
  return { error: null };
}
