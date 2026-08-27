"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";

/** Scoped to the caller's own id, so a tampered notificationId can never delete someone else's row. */
export async function dismissNotification(notificationId: string) {
  const user = await requireUser();
  await prisma.notification.deleteMany({ where: { id: notificationId, userId: user.id } });
  revalidatePath("/notifications");
}
