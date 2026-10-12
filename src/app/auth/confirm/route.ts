import { NextResponse, type NextRequest } from "next/server";
import { PASSWORD_RESET_COOKIE, PASSWORD_RESET_WINDOW_SECONDS } from "@/lib/auth/password-reset-cookie";
import { createServerSupabase } from "@/lib/supabase/server";

// Landing point of links in auth emails. The link carries a one-time token
// (not a browser-bound code), so it works on any device. Where to go next is
// decided by the link type, never by the URL, so there is nothing to redirect elsewhere.
export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");

  if (tokenHash && (type === "email" || type === "recovery")) {
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

    if (!error && type === "email") {
      return NextResponse.redirect(new URL("/", request.url));
    }
    if (!error && type === "recovery") {
      const response = NextResponse.redirect(new URL("/reset-password", request.url));
      response.cookies.set(PASSWORD_RESET_COOKIE, "1", {
        httpOnly: true,
        sameSite: "lax",
        secure: request.nextUrl.protocol === "https:",
        maxAge: PASSWORD_RESET_WINDOW_SECONDS,
        path: "/",
      });
      return response;
    }
  }

  return NextResponse.redirect(new URL("/login?confirm=failed", request.url));
}
