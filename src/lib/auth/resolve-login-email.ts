import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

const STUDENT_NUMBER = /^[0-9]{6,12}$/;

/**
 * Turns what the user typed in the login box (학번 or 학교 메일) into the email
 * to sign in with. Returns null when no confirmed user has that 학번.
 *
 * Looking up a 학번 reveals someone's email, so the DB only lets the
 * server's admin client do it; any other client makes this throw.
 */
export async function resolveLoginEmail(
  supabase: SupabaseClient<Database>,
  identifier: string,
): Promise<string | null> {
  const value = identifier.trim();
  if (!STUDENT_NUMBER.test(value)) return value.toLowerCase();

  const { data, error } = await supabase.rpc("login_email_for_student_number", {
    candidate: value,
  });
  if (error) throw error;
  return data;
}
