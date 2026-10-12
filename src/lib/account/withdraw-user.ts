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
import { SUBMISSION_BUCKET } from "@/lib/submissions/storage";

type WithdrawInput = {
  /** Signed in as the leaving 사용자: prepare_withdrawal() checks it is allowed and lists their files. */
  userClient: SupabaseClient<Database>;
  /** Secret-key client: deletes the 사용자 and removes the files. */
  adminClient: SupabaseClient<Database>;
  userId: string;
};

/** Why withdrawal stopped. `code` is the DB's (e.g. KH007) when the DB refused. */
export type WithdrawError = { code: string | null; message: string };

/** Storage removes at most this many objects per call. */
const REMOVE_BATCH = 1000;

export async function withdrawUser({
  userClient,
  adminClient,
  userId,
}: WithdrawInput): Promise<{ error: WithdrawError | null }> {
  const { data: storagePaths, error } = await userClient.rpc("prepare_withdrawal");
  if (error) return { error: { code: error.code, message: error.message } };

  const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
  if (deleteError) return { error: { code: deleteError.code ?? null, message: deleteError.message } };

  // The 사용자 is gone now, so this can't fail the withdrawal; leftovers are only logged.
  const storage = adminClient.storage.from(SUBMISSION_BUCKET);
  for (let i = 0; i < storagePaths.length; i += REMOVE_BATCH) {
    const { error: removeError } = await storage.remove(storagePaths.slice(i, i + REMOVE_BATCH));
    if (removeError) console.error("withdrawUser: removing files failed", removeError.message);
  }
  return { error: null };
}
