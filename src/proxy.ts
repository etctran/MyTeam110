import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import "./lib/supabase/ws-polyfill";

const PUBLIC_ROUTES = ["/login"];

/**
 * Runs on (almost) every request. Two jobs:
 *
 * 1. Refresh the Supabase session cookie via `auth.getUser()`. This is
 *    Supabase's required SSR pattern (not just a Next.js "optimistic
 *    check") — it's how expired access tokens get silently refreshed
 *    using the refresh token before they expire.
 * 2. Cheap, optimistic role-based redirects using the role Supabase
 *    stores in the JWT's `app_metadata` (set at user-creation time) —
 *    no DB round-trip here. The authoritative check against the `User`
 *    table happens in the DAL (`requireRole`) on the actual page.
 */
export default async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublicRoute = PUBLIC_ROUTES.includes(path);

  if (!user && !isPublicRoute && path !== "/") {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (user) {
    const role = user.app_metadata?.role as "PROFESSOR" | "UTA" | undefined;

    // UTAs can't reach professor-only routes. Professors *can* reach the
    // UTA routes (their nav includes the same tabs, read/write across
    // everyone's data), so there's no symmetric block.
    if (path.startsWith("/professor") && role !== "PROFESSOR") {
      return NextResponse.redirect(new URL("/uta", request.url));
    }

    // Already logged in — bounce away from /login to the right home tab.
    if (path === "/login") {
      return NextResponse.redirect(
        new URL(role === "PROFESSOR" ? "/professor" : "/uta", request.url),
      );
    }
  }

  return response;
}

export const config = {
  // Excludes /api entirely — route handlers there (e.g. the cron-triggered
  // /api/schedule/generate) authenticate themselves via a shared secret,
  // not a Supabase session, and have no session to redirect on.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
};
