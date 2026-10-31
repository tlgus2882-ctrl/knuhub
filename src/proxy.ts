import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/supabase/database.types";
import { isIdleExpired, LAST_ACTIVE_COOKIE, SESSION_IDLE_SECONDS } from "@/lib/auth/session-age";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/env";

/** Pages that make no sense signed out; visitors without a session go to /login. */
const SIGNED_IN_ONLY = ["/courses", "/profile", "/search", "/users", "/admin", "/board"];

// Refreshes the auth session cookie on every request so Server Components
// always see a valid session, and sends signed-out visitors of SIGNED_IN_ONLY
// pages to the login page (an optimistic check: RLS is what actually guards the data).
// A session idle for an hour (no request) is signed out here, on the next request;
// every request while signed in moves the last-activity time forward.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  const now = Math.floor(Date.now() / 1000);

  if (claims && isIdleExpired(request.cookies.get(LAST_ACTIVE_COOKIE)?.value, now)) {
    await supabase.auth.signOut({ scope: "local" });
    const login = NextResponse.redirect(new URL("/login?expired=1", request.url));
    // Carry the cleared session cookies over to the redirect.
    for (const cookie of response.cookies.getAll()) login.cookies.set(cookie);
    login.cookies.delete(LAST_ACTIVE_COOKIE);
    return login;
  }

  if (!claims) {
    // Signed out: forget the old time, so the next login doesn't start out idle.
    if (request.cookies.has(LAST_ACTIVE_COOKIE)) response.cookies.delete(LAST_ACTIVE_COOKIE);
    if (SIGNED_IN_ONLY.some((path) => request.nextUrl.pathname.startsWith(path))) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return response;
  }

  response.cookies.set(LAST_ACTIVE_COOKIE, String(now), {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    maxAge: SESSION_IDLE_SECONDS * 24,
  });
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
