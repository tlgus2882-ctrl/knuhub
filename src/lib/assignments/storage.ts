// Where 과제 첨부파일 live in Storage. The Storage policies check this layout
// (supabase/migrations/*_assignment_file.sql), so keep them in sync.
export const ASSIGNMENT_FILE_BUCKET = "assignment-files";

/** Like a 제출물, at most 20MB per file (the bucket enforces it). */
export const ASSIGNMENT_FILE_MAX_BYTES = 20 * 1024 * 1024;

/** Object name for one 첨부파일; the original file name stays in the DB (Korean names aren't allowed here). */
export function assignmentFileObjectName(assignmentId: string, fileId: string) {
  return `${assignmentId}/${fileId}`;
}
