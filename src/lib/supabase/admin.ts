import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { supabaseSecretKey, supabaseUrl } from "./env";

// Bypasses RLS. Only for what users may not do themselves (docs/adr/0002):
// server-only lookups such as finding an email by 학번, and carrying out 탈퇴.
export function createAdminSupabase() {
  return createClient<Database>(supabaseUrl(), supabaseSecretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
