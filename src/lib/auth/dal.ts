import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/generated/prisma/client";

/**
 * Data Access Layer — the one place that turns "is there a Supabase
 * session" into "who is this app user, and what's their role."
 *
 * `auth.getUser()` (not `getSession()`) re-validates the session against
 * Supabase Auth on every call, which is the "secure" check per Next's
 * auth guide — proxy.ts only does the cheap optimistic cookie check.
 * Wrapped in React's `cache()` so multiple calls in one render pass only
 * hit Supabase/the DB once.
 */
export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser?.email) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { email: authUser.email },
  });

  return user;
});

/** Redirects to /login if there's no session. Returns the app User row. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

/** Redirects to /login (no session) or /unauthorized (wrong role). */
export async function requireRole(role: Role) {
  const user = await requireUser();
  if (user.role !== role) {
    redirect("/unauthorized");
  }
  return user;
}
