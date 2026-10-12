import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";
import { supabasePublishableKey, supabaseUrl } from "./env";

// Browser-side client. Per docs/adr/0002 this is only for uploading
// submission files straight to Storage; everything else goes through the server.
export function createClient() {
  return createBrowserClient<Database>(supabaseUrl(), supabasePublishableKey());
}
