import { createHmac } from "node:crypto";
import { connection } from "next/server";
import { supabaseSecretKey } from "@/lib/supabase/env";
import { createServerSupabase } from "@/lib/supabase/server";
import { kstToday } from "@/lib/time";
import { ChatWindow } from "./chat-window";

/** The 익명 채팅 bubble in every page's bottom-right corner, for signed-in users only. */
export async function ChatWidget() {
  const supabase = await createServerSupabase();
  const { data: claims } = await supabase.auth.getClaims();
  const me = claims?.claims.sub;
  if (!me) return null;

  await connection();
  // Counts each person once across tabs without telling the others who is online: a key that is
  // the same for one person all day but can't be traced back to their id.
  const presenceKey = createHmac("sha256", supabaseSecretKey()).update(`chat-presence:${me}:${kstToday(new Date())}`).digest("hex").slice(0, 32);
  return <ChatWindow presenceKey={presenceKey} />;
}
