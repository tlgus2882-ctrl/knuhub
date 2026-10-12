import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";
import { supabasePublishableKey, supabaseUrl } from "./env";

// Supabase client for Client Components. Used only to upload files straight to
// Storage; everything else goes through Server Components and Actions (docs/adr/0002).
export function createBrowserSupabase() {
  return createBrowserClient<Database>(supabaseUrl(), supabasePublishableKey());
}
