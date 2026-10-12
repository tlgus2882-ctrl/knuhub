import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { supabaseSecretKey, supabaseUrl } from "./env";

// Bypasses RLS. Only for privileged server-side lookups the DB deliberately
// refuses to users, such as finding an email by 학번 (docs/adr/0002).
export function createAdminSupabase() {
  return createClient<Database>(supabaseUrl(), supabaseSecretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
