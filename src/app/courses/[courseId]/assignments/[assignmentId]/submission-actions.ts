"use server";

import { refresh } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { SUBMISSION_BUCKET } from "@/lib/submissions/storage";
import type { UploadedFile } from "@/lib/submissions/upload";

export type SubmissionActionState = { error: string | null };

// Raised by submit_files() / delete_submission() (supabase/migrations/*_submission.sql).
const SUBMISSION_ERRORS: Record<string, string> = {
  KH003: "지금은 제출하거나 지울 수 없어요. 이 과목의 수강생인지, 마감이 지나지 않았는지 확인해 주세요.",
  KH004: "올린 파일을 찾지 못했어요. 다시 골라서 제출해 주세요.",
  KH005: "제출물은 20MB를 넘을 수 없어요.",
};
const UNKNOWN_ERROR = "처리하지 못했어요. 잠시 뒤에 다시 해 주세요.";

// Who may submit and until when is decided by submit_files() and the Storage
// policies (docs/adr/0002); this only finishes what the browser uploaded.
export async function submitUploadedFiles(
  assignmentId: string,
  files: UploadedFile[],
): Promise<SubmissionActionState> {
  const supabase = await createServerSupabase();
  const { data: replaced, error } = await supabase.rpc("submit_files", {
    target_assignment: assignmentId,
    files,
  });

  if (error) return failed("submitUploadedFiles", error);

  await removeObjects("submitUploadedFiles", replaced);
  refresh();
  return { error: null };
}

export async function deleteSubmission(
  _prev: SubmissionActionState,
  form: FormData,
): Promise<SubmissionActionState> {
  const assignmentId = String(form.get("assignment_id"));
  const supabase = await createServerSupabase();
  const { data: removed, error } = await supabase.rpc("delete_submission", { target_assignment: assignmentId });

  if (error) return failed("deleteSubmission", error);

  await removeObjects("deleteSubmission", removed);
  refresh();
  return { error: null };
}

function failed(action: string, error: { code: string; message: string }): SubmissionActionState {
  console.error(`${action} failed`, error.message);
  return { error: SUBMISSION_ERRORS[error.code] ?? UNKNOWN_ERROR };
}

// Files no longer in a submission. If this fails they stay in Storage, but
// nobody else can read them: reads go through the submission's file list.
async function removeObjects(action: string, storagePaths: string[] | null) {
  if (!storagePaths?.length) return;
  const supabase = await createServerSupabase();
  const { error } = await supabase.storage.from(SUBMISSION_BUCKET).remove(storagePaths);
  if (error) console.error(`${action}: removing old files failed`, error.message);
}
