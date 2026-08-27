"use server";

import { requireUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";

/**
 * Called by NotificationToast right after a realtime ping — the ping
 * itself carries no row data (see src/lib/realtime.ts), so the client
 * re-fetches through this authenticated path instead of trusting
 * anything off the socket.
 */
export async function getLatestNotification() {
  const user = await requireUser();
  const latest = await prisma.notification.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });
  return latest ? { id: latest.id, type: latest.type, message: latest.message } : null;
}
