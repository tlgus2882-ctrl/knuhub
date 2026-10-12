import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export const STUDENT_NUMBER_PATTERN = /^[0-9]{6,12}$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Turns what the user typed in the login box (학번 or 학교 메일) into the email
 * to sign in with. Returns null when no confirmed user has that 학번.
 *
 * Looking up a 학번 reveals someone's email, so the DB only lets the server's
 * admin client do it; any other client makes this throw. The admin client is
 * created only when the input is a 학번, so email login works without it.
 */
export async function resolveLoginEmail(
  adminClient: () => SupabaseClient<Database>,
  identifier: string,
): Promise<string | null> {
  const value = identifier.trim();
  if (!STUDENT_NUMBER_PATTERN.test(value)) return normalizeEmail(value);

  const { data, error } = await adminClient().rpc("login_email_for_student_number", {
    candidate: value,
  });
  if (error) throw error;
  return data;
}
