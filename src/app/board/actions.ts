"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { toCategory } from "./categories";

export type BoardFormState = {
  error: string | null;
  /** When the form last saved; tells it to reset or close. */
  savedAt?: number;
};

const UNIQUE_VIOLATION = "23505";

// Who may write, edit, delete and report is decided by RLS (docs/adr/0002).
export async function createPost(_prev: BoardFormState, form: FormData): Promise<BoardFormState> {
  const post = readPost(form);
  if (typeof post === "string") return { error: post };

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("post").insert(post).select("id").single();
  if (error) return failed("createPost", error, "글을 올리지 못했어요. 다시 로그인해 주세요.");

  redirect(`/board/${data.id}`);
}

export async function updatePost(_prev: BoardFormState, form: FormData): Promise<BoardFormState> {
  const post = readPost(form);
  if (typeof post === "string") return { error: post };

  const postId = String(form.get("post_id"));
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("post").update(post).eq("id", postId).select("id");
  if (error || !data?.length) return failed("updatePost", error, "내가 쓴 글만 고칠 수 있어요.");

  redirect(`/board/${postId}`);
}

export async function deletePost(_prev: BoardFormState, form: FormData): Promise<BoardFormState> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("post").delete().eq("id", String(form.get("post_id"))).select("id");
  if (error || !data?.length) return failed("deletePost", error, "글쓴이나 관리자만 지울 수 있어요.");

  // From the 관리자 페이지 the admin stays there; from the post itself the post is gone.
  if (form.get("stay")) {
    refresh();
    return { error: null };
  }
  redirect("/board");
}

export async function createComment(_prev: BoardFormState, form: FormData): Promise<BoardFormState> {
  const body = readText(form, "body");
  if (!body) return { error: "댓글 내용을 입력해 주세요." };

  const supabase = await createServerSupabase();
  const { error } = await supabase.from("post_comment").insert({ post_id: String(form.get("post_id")), body });
  if (error) return failed("createComment", error, "댓글을 달지 못했어요. 글이 지워졌을 수 있어요.");

  refresh();
  return { error: null, savedAt: Date.now() };
}

export async function updateComment(_prev: BoardFormState, form: FormData): Promise<BoardFormState> {
  const body = readText(form, "body");
  if (!body) return { error: "댓글 내용을 입력해 주세요." };

  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("post_comment")
    .update({ body })
    .eq("id", String(form.get("comment_id")))
    .select("id");
  if (error || !data?.length) return failed("updateComment", error, "내가 단 댓글만 고칠 수 있어요.");

  refresh();
  return { error: null, savedAt: Date.now() };
}

export async function deleteComment(_prev: BoardFormState, form: FormData): Promise<BoardFormState> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("post_comment")
    .delete()
    .eq("id", String(form.get("comment_id")))
    .select("id");
  if (error || !data?.length) return failed("deleteComment", error, "글쓴이나 관리자만 지울 수 있어요.");

  refresh();
  return { error: null };
}

/** Reports a post (post_id) or a comment (comment_id); it goes to the 관리자 페이지. */
export async function report(_prev: BoardFormState, form: FormData): Promise<BoardFormState> {
  const reason = readText(form, "reason");
  if (!reason) return { error: "신고 사유를 적어 주세요." };

  const supabase = await createServerSupabase();
  const { error } = await supabase.from("report").insert({
    post_id: (form.get("post_id") as string | null) || null,
    comment_id: (form.get("comment_id") as string | null) || null,
    reason,
  });
  if (error?.code === UNIQUE_VIOLATION) return { error: "이미 신고했어요. 관리자가 확인할 거예요." };
  if (error) return failed("report", error, "신고하지 못했어요. 잠시 뒤에 다시 해 주세요.");

  return { error: null, savedAt: Date.now() };
}

/** The post's fields, or what is missing. */
function readPost(form: FormData) {
  const category = toCategory(form.get("category"));
  const title = readText(form, "title");
  const body = readText(form, "body");
  if (!category) return "말머리를 골라 주세요.";
  if (!title || !body) return "제목과 내용을 입력해 주세요.";
  return { category, title, body };
}

function readText(form: FormData, name: string): string {
  return String(form.get(name) ?? "").trim();
}

function failed(action: string, error: { message: string } | null, message: string): BoardFormState {
  if (error) console.error(`${action} failed`, error.message);
  return { error: message };
}
