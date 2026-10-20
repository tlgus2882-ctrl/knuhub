// 탈퇴: deletes the 사용자 (auth user) and, through foreign keys, the profile,
// 제출물, 제출 파일 rows and 리뷰 with it (supabase/migrations/*_withdrawal.sql).
// A professor's courses are moved to the archive tables first, by a DB trigger
// in the same transaction (docs/adr/0003).
// Storage files can't be deleted from SQL, so the server removes them with the
// secret key (docs/adr/0002). The user goes first: if removing files then fails,
// what is left are files nothing points to and nobody can read, not 제출물
// pointing to missing files.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { PROFILE_FILE_BUCKET } from "@/lib/profile-files/storage";
import { SUBMISSION_BUCKET } from "@/lib/submissions/storage";

type WithdrawInput = {
  /** Signed in as the leaving 사용자, who is the one deleted. prepare_withdrawal() checks it is allowed and lists their files. */
  userClient: SupabaseClient<Database>;
  /** Secret-key client: deletes the 사용자 and removes the files. */
  adminClient: SupabaseClient<Database>;
};

/** Why withdrawal stopped. `code` is the DB's (e.g. KH006) when the DB refused. */
export type WithdrawError = { code: string | null; message: string };

/** Storage removes at most this many objects per call. */
const REMOVE_BATCH = 1000;

export async function withdrawUser({ userClient, adminClient }: WithdrawInput): Promise<{ error: WithdrawError | null }> {
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return { error: { code: null, message: "not signed in" } };

  const { data: storagePaths, error } = await userClient.rpc("prepare_withdrawal");
  if (error) return { error: { code: error.code, message: error.message } };
  const { data: profileFilePaths, error: profileFilesError } = await userClient.rpc("my_profile_file_objects");
  if (profileFilesError) return { error: { code: profileFilesError.code, message: profileFilesError.message } };

  const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);
  if (deleteError) return { error: { code: deleteError.code ?? null, message: deleteError.message } };

  // The 사용자 is gone now, so this can't fail the withdrawal. If it does fail, the files
  // stay in Storage with nothing pointing to them and nobody able to read them; they are
  // logged for a manual clean-up (a deliberate trade-off, see the comment above).
  const storage = adminClient.storage.from(SUBMISSION_BUCKET);
  for (let i = 0; i < storagePaths.length; i += REMOVE_BATCH) {
    const { error: removeError } = await storage.remove(storagePaths.slice(i, i + REMOVE_BATCH));
    if (removeError) console.error("withdrawUser: removing files failed", removeError.message);
  }
  // At most 100 프로필 파일 objects (the Storage insert policy), so one call.
  if (profileFilePaths.length) {
    const { error: removeError } = await adminClient.storage.from(PROFILE_FILE_BUCKET).remove(profileFilePaths);
    if (removeError) console.error("withdrawUser: removing 프로필 파일 failed", removeError.message);
  }
  return { error: null };
}
