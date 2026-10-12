"use server";

import { refresh } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";

export type ReviewFormState = { error: string | null; saved?: number };

// Who may write, edit and delete reviews is decided by RLS (docs/adr/0002).
export async function createReview(_prev: ReviewFormState, form: FormData): Promise<ReviewFormState> {
  const body = readBody(form);
  if (!body) return { error: "리뷰 내용을 입력해 주세요." };

  const supabase = await createServerSupabase();
  const { error } = await supabase.from("review").insert({ submission_id: String(form.get("submission_id")), body });
  if (error) return failed("createReview", error, "이 제출물에는 리뷰를 쓸 수 없어요.");

  refresh();
  return { error: null, saved: Date.now() };
}

export async function updateReview(_prev: ReviewFormState, form: FormData): Promise<ReviewFormState> {
  const body = readBody(form);
  if (!body) return { error: "리뷰 내용을 입력해 주세요." };

  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("review")
    .update({ body })
    .eq("id", String(form.get("review_id")))
    .select("id");
  if (error || !data?.length) return failed("updateReview", error, "내가 쓴 리뷰만 고칠 수 있어요.");

  refresh();
  return { error: null, saved: Date.now() };
}

export async function deleteReview(_prev: ReviewFormState, form: FormData): Promise<ReviewFormState> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("review")
    .delete()
    .eq("id", String(form.get("review_id")))
    .select("id");
  if (error || !data?.length) return failed("deleteReview", error, "리뷰 작성자나 담당 교수만 지울 수 있어요.");

  refresh();
  return { error: null };
}

function readBody(form: FormData): string {
  return String(form.get("body") ?? "").trim();
}

function failed(action: string, error: { message: string } | null, message: string): ReviewFormState {
  if (error) console.error(`${action} failed`, error.message);
  return { error: message };
}
