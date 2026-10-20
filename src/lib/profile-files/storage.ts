// Where 프로필 파일 live in Storage. The Storage policies check this layout
// (supabase/migrations/*_profile_files.sql), so keep them in sync.
export const PROFILE_FILE_BUCKET = "profile-files";

/** At most 20MB per file (the bucket enforces it). */
export const PROFILE_FILE_MAX_BYTES = 20 * 1024 * 1024;

// The per-person total lives in the DB only: read it with rpc("profile_files_limit").

/** Object name for one 프로필 파일: the owner's folder, then an id (Korean names aren't allowed here). */
export function profileFileObjectName(ownerId: string, fileId: string) {
  return `${ownerId}/${fileId}`;
}
