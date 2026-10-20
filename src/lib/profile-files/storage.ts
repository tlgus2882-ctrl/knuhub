// Where 프로필 파일 live in Storage. The Storage policies check this layout
// (supabase/migrations/*_profile_files.sql), so keep them in sync.
export const PROFILE_FILE_BUCKET = "profile-files";

/** At most 20MB per file (the bucket enforces it). */
export const PROFILE_FILE_MAX_BYTES = 20 * 1024 * 1024;

/** At most 50MB per person in all (add_profile_file() enforces it with profile_files_limit()). */
export const PROFILE_FILES_TOTAL_BYTES = 50 * 1024 * 1024;

/** Object name for one 프로필 파일: the owner's folder, then an id (Korean names aren't allowed here). */
export function profileFileObjectName(ownerId: string, fileId: string) {
  return `${ownerId}/${fileId}`;
}
