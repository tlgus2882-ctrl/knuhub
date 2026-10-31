// Removing many Storage objects with the secret key, after a DB function listed them (docs/adr/0002).
import type { SupabaseClient } from "@supabase/supabase-js";

/** Storage removes at most this many objects per call. */
const REMOVE_BATCH = 1000;

/**
 * Removes the objects in batches. Failures are logged, not thrown: callers run this after the DB
 * rows are gone, so what is left are files nothing points to and nobody can read.
 */
export async function removeObjects(admin: SupabaseClient, bucket: string, names: string[], context: string): Promise<void> {
  for (let i = 0; i < names.length; i += REMOVE_BATCH) {
    const { error } = await admin.storage.from(bucket).remove(names.slice(i, i + REMOVE_BATCH));
    if (error) console.error(`${context}: removing ${bucket} files failed`, error.message);
  }
}
