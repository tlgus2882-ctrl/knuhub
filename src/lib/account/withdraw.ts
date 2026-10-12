// 탈퇴: deletes the account and, through foreign keys, the profile, 제출물,
// 제출 파일 rows and 리뷰 with it (supabase/migrations/*_withdrawal.sql).
// Storage files can't be deleted from SQL, so they go first, with the secret key
// (docs/adr/0002 allows it for this server-only admin task).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { SUBMISSION_BUCKET } from "@/lib/submissions/storage";

type Clients = {
  /** Signed in as the leaving user: prepare_withdrawal() checks it is allowed and lists their files. */
  userClient: SupabaseClient<Database>;
  /** Secret-key client: removes the files and the account. */
  adminClient: SupabaseClient<Database>;
  userId: string;
};

/** Why withdrawal stopped. `code` is the DB's (e.g. KH006) when the DB refused. */
export type WithdrawError = { code: string | null; message: string };

/** Storage removes at most this many objects per call. */
const REMOVE_BATCH = 1000;

export async function withdrawAccount({ userClient, adminClient, userId }: Clients): Promise<{ error: WithdrawError | null }> {
  const { data: storagePaths, error } = await userClient.rpc("prepare_withdrawal");
  if (error) return { error: { code: error.code, message: error.message } };

  const storage = adminClient.storage.from(SUBMISSION_BUCKET);
  for (let i = 0; i < storagePaths.length; i += REMOVE_BATCH) {
    const { error: removeError } = await storage.remove(storagePaths.slice(i, i + REMOVE_BATCH));
    if (removeError) return { error: { code: null, message: removeError.message } };
  }

  const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
  return { error: deleteError && { code: deleteError.code ?? null, message: deleteError.message } };
}
