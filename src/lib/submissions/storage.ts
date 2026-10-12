// Where submission files live in Storage. The folder layout is what the
// Storage policies check (supabase/migrations/*_submission.sql), so keep them in sync.
export const SUBMISSION_BUCKET = "submissions";

/** Per submission (spec: 제출물당 최대 20MB). The bucket and submit_files() enforce it too. */
export const SUBMISSION_MAX_BYTES = 20 * 1024 * 1024;

/**
 * Object name for the `index`-th file of one upload attempt. The original file
 * path stays in the DB: Storage object names can't hold Korean file names.
 */
export function submissionObjectName(assignmentId: string, studentId: string, attempt: string, index: number) {
  return `${assignmentId}/${studentId}/${attempt}/${index}`;
}

/** Content type to store each kind of file with (text is served as UTF-8). */
export const CONTENT_TYPE: Record<"text" | "binary", string> = {
  text: "text/plain;charset=utf-8",
  binary: "application/octet-stream",
};
