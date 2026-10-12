"use server";

import { refresh } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { SUBMISSION_BUCKET } from "@/lib/submissions/storage";

export type UploadedFile = { path: string; storage_path: string };

// Who may submit and until when is decided by submit_files() and the Storage
// policies (docs/adr/0002); this only finishes what the browser uploaded.
export async function submitUploadedFiles(
  assignmentId: string,
  files: UploadedFile[],
): Promise<{ error: string | null }> {
  const supabase = await createServerSupabase();
  const { data: replaced, error } = await supabase.rpc("submit_files", {
    target_assignment: assignmentId,
    files,
  });

  if (error) {
    console.error("submitUploadedFiles failed", error.message);
    return { error: "제출하지 못했어요. 이 과목의 수강생인지, 마감이 지나지 않았는지 확인해 주세요." };
  }

  await removeObjects("submitUploadedFiles", replaced);
  refresh();
  return { error: null };
}

export async function deleteSubmission(form: FormData) {
  const assignmentId = String(form.get("assignment_id"));
  const supabase = await createServerSupabase();
  const { data: removed, error } = await supabase.rpc("delete_submission", { target_assignment: assignmentId });

  if (error) console.error("deleteSubmission failed", error.message);
  else await removeObjects("deleteSubmission", removed);
  refresh();
}

// Files no longer in a submission. If this fails they stay in Storage, but
// nobody else can read them: reads go through the submission's file list.
async function removeObjects(action: string, storagePaths: string[] | null) {
  if (!storagePaths?.length) return;
  const supabase = await createServerSupabase();
  const { error } = await supabase.storage.from(SUBMISSION_BUCKET).remove(storagePaths);
  if (error) console.error(`${action}: removing old files failed`, error.message);
}
