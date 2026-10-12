import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

// Landing point of links in auth emails (signup confirmation, password reset).
// Supabase redirects here with a one-time code; exchanging it signs the user in.
// `next` says where to go afterwards and must be a path on this site.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = request.nextUrl.searchParams.get("next") ?? "/";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  if (code) {
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(safeNext, request.url));
  }

  return NextResponse.redirect(new URL("/login?confirm=failed", request.url));
}
