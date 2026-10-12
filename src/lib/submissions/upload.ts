// Browser side of submitting: puts prepared files in Storage under a fresh
// attempt folder (docs/adr/0002: uploads go straight to Storage).
import type { createBrowserSupabase } from "@/lib/supabase/browser";
import type { FileKind, PreparedFile } from "./prepare-upload";
import { CONTENT_TYPE, SUBMISSION_BUCKET, submissionObjectName } from "./storage";

/** One uploaded file as submit_files() expects it. */
export type UploadedFile = { path: string; storage_path: string; kind: FileKind };

type Storage = ReturnType<ReturnType<typeof createBrowserSupabase>["storage"]["from"]>;

const PARALLEL_UPLOADS = 4;

export function submissionStorage(supabase: ReturnType<typeof createBrowserSupabase>): Storage {
  return supabase.storage.from(SUBMISSION_BUCKET);
}

/**
 * Uploads every file, a few at a time. If any upload fails, the ones already
 * uploaded are removed again and null is returned.
 */
export async function uploadPrepared(
  storage: Storage,
  target: { assignmentId: string; studentId: string },
  files: PreparedFile[],
  onProgress: (done: number) => void,
): Promise<UploadedFile[] | null> {
  const attempt = crypto.randomUUID();
  const uploaded = files.map((file, index) => ({
    path: file.path,
    storage_path: submissionObjectName(target.assignmentId, target.studentId, attempt, index),
    kind: file.kind,
  }));

  let done = 0;
  let failed = false;
  const queue = [...files.keys()];
  const worker = async () => {
    for (let index = queue.shift(); index !== undefined && !failed; index = queue.shift()) {
      const { error } = await storage.upload(uploaded[index].storage_path, files[index].data, {
        contentType: CONTENT_TYPE[files[index].kind],
      });
      if (error) failed = true;
      else onProgress(++done);
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL_UPLOADS, files.length) }, worker));

  if (failed) {
    await discardUploaded(storage, uploaded);
    return null;
  }
  return uploaded;
}

/** Removes an attempt's files that never became a 제출물 (best effort). */
export async function discardUploaded(storage: Storage, uploaded: UploadedFile[]): Promise<void> {
  await storage.remove(uploaded.map((f) => f.storage_path));
}
