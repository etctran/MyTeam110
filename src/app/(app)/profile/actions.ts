"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { requireRole } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";
import type { TaType } from "@/generated/prisma/client";

export type ActionResult = { ok: true } | { ok: false; error: string };

const QUOTA_BY_TA_TYPE: Record<TaType, number> = { FIVE_HOUR: 4, TEN_HOUR: 8 };

export type AddTaResult = { ok: true; tempPassword: string } | { ok: false; error: string };

/**
 * Creates a real TA account outside the seed script — the only other way
 * users get created in this app. Generates a one-time temporary password
 * rather than building a full email-invite/set-password flow (a
 * reasonable next step, not built here): the professor shares it with
 * the TA out of band, same as any admin-created account.
 */
export async function addTa(_prevState: AddTaResult | undefined, formData: FormData): Promise<AddTaResult> {
  await requireRole("PROFESSOR");

  const name = formData.get("name");
  const email = formData.get("email");
  const taType = formData.get("taType");
  const isSenior = formData.get("isSenior") === "on";
  const quotaOverride = formData.get("weeklyQuota");

  if (typeof name !== "string" || !name.trim() || typeof email !== "string" || !email.trim()) {
    return { ok: false, error: "Name and email are required." };
  }
  if (taType !== "FIVE_HOUR" && taType !== "TEN_HOUR" && taType !== "") {
    return { ok: false, error: "Invalid TA type." };
  }

  const existing = await prisma.user.findUnique({ where: { email: email.trim() } });
  if (existing) return { ok: false, error: "A user with that email already exists." };

  const resolvedTaType = taType === "" ? null : taType;
  const weeklyQuota =
    quotaOverride && String(quotaOverride).trim() !== ""
      ? Number(quotaOverride)
      : resolvedTaType
        ? QUOTA_BY_TA_TYPE[resolvedTaType]
        : null;

  const tempPassword = randomBytes(9).toString("base64url"); // 12 chars, URL-safe

  const admin = createAdminClient();
  const { data: authUser, error } = await admin.auth.admin.createUser({
    email: email.trim(),
    password: tempPassword,
    email_confirm: true,
    app_metadata: { role: "UTA" },
  });
  if (error || !authUser.user) {
    return { ok: false, error: error?.message ?? "Couldn't create the auth account." };
  }

  try {
    await prisma.user.create({
      data: {
        name: name.trim(),
        email: email.trim(),
        role: "UTA",
        taType: resolvedTaType,
        isSenior,
        weeklyQuota,
        hireDate: new Date(),
      },
    });
  } catch (err) {
    // Roll back the auth user so a failed second half doesn't leave an
    // orphaned login with no matching profile.
    await admin.auth.admin.deleteUser(authUser.user.id);
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't create the TA profile." };
  }

  revalidatePath("/profile");
  return { ok: true, tempPassword };
}

export async function updateTa(
  userId: string,
  updates: { taType: TaType | null; isSenior: boolean; weeklyQuota: number | null },
): Promise<ActionResult> {
  await requireRole("PROFESSOR");

  await prisma.user.update({
    where: { id: userId },
    data: {
      taType: updates.taType,
      isSenior: updates.isSenior,
      weeklyQuota: updates.weeklyQuota,
    },
  });

  revalidatePath("/profile");
  return { ok: true };
}
