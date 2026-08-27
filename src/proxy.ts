import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import "./lib/supabase/ws-polyfill";

const PUBLIC_ROUTES = ["/login"];

/**
 * Runs on (almost) every request, including prefetched ones — Next's own
 * docs are explicit that Proxy must stay to *optimistic* checks only
 * (decode the session cookie, no network/DB round-trip), precisely
 * because it runs this often. The authoritative check lives in the DAL
 * (`requireUser`/`requireRole`, via `auth.getUser()`), which every page
 * already calls before touching real data — Proxy is a cheap redirect
 * hint layered in front of that, never a substitute for it.
 *
 * `getSession()` (not `getUser()`) is deliberate here: it decodes the
 * JWT already sitting in the cookie and only hits the network to refresh
 * it if it's actually expired, rather than revalidating against Supabase
 * Auth on every single request. `getUser()` is reserved for the DAL,
 * where a forged/stale cookie actually matters.
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
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;

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
