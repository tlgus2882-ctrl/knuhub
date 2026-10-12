"use server";

import { refresh } from "next/cache";
import { ASSIGNMENT_FILE_BUCKET } from "@/lib/assignments/storage";
import { createServerSupabase } from "@/lib/supabase/server";

export type AttachmentActionState = { error: string | null };

// Raised by attach_assignment_file() / detach_assignment_file() (supabase/migrations/*_assignment_file.sql).
const ATTACHMENT_ERRORS: Record<string, string> = {
  KH003: "이 과목의 담당 교수나 조교만 첨부파일을 올리고 지울 수 있어요.",
  KH004: "올린 파일을 찾지 못했어요. 다시 골라 주세요.",
};
const UNKNOWN_ERROR = "처리하지 못했어요. 잠시 뒤에 다시 해 주세요.";

// The browser has already uploaded the file to Storage (docs/adr/0002); this makes it a 첨부파일.
export async function attachAssignmentFile(
  assignmentId: string,
  storagePath: string,
  name: string,
): Promise<AttachmentActionState> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("attach_assignment_file", {
    target_assignment: assignmentId,
    storage_path: storagePath,
    name,
  });
  if (error) {
    // Not attached, so the uploaded object is useless; best-effort clean-up.
    await supabase.storage.from(ASSIGNMENT_FILE_BUCKET).remove([storagePath]);
    return failed("attachAssignmentFile", error);
  }
  refresh();
  return { error: null };
}

export async function detachAssignmentFile(
  _prev: AttachmentActionState,
  form: FormData,
): Promise<AttachmentActionState> {
  const supabase = await createServerSupabase();
  const { data: storagePath, error } = await supabase.rpc("detach_assignment_file", {
    target_file: String(form.get("file_id")),
  });
  if (error) return failed("detachAssignmentFile", error);

  const { error: removeError } = await supabase.storage.from(ASSIGNMENT_FILE_BUCKET).remove([storagePath]);
  if (removeError) console.error("detachAssignmentFile: removing the file failed", removeError.message);
  refresh();
  return { error: null };
}

function failed(action: string, error: { code: string; message: string }): AttachmentActionState {
  console.error(`${action} failed`, error.message);
  return { error: ATTACHMENT_ERRORS[error.code] ?? UNKNOWN_ERROR };
}
