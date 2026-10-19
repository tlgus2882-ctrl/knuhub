import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/supabase/database.types";
import { isSessionExpired } from "@/lib/auth/session-age";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/env";

/** Pages that make no sense signed out; visitors without a session go to /login. */
const SIGNED_IN_ONLY = ["/courses", "/profile", "/search", "/users", "/admin"];

// Refreshes the auth session cookie on every request so Server Components
// always see a valid session, and sends signed-out visitors of SIGNED_IN_ONLY
// pages to the login page (an optimistic check: RLS is what actually guards the data).
// A session an hour past its login is signed out here, on the next request.
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

  if (claims && isSessionExpired(claims.amr, Math.floor(Date.now() / 1000))) {
    await supabase.auth.signOut({ scope: "local" });
    const login = NextResponse.redirect(new URL("/login?expired=1", request.url));
    // Carry the cleared session cookies over to the redirect.
    for (const cookie of response.cookies.getAll()) login.cookies.set(cookie);
    return login;
  }

  if (!claims && SIGNED_IN_ONLY.some((path) => request.nextUrl.pathname.startsWith(path))) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
