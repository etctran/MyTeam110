import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { sendNotificationEmail } from "@/lib/email";

export type NotificationType =
  | "SWAP_REQUEST"
  | "SWAP_ACCEPTED"
  | "SWAP_DENIED"
  | "ALL_HANDS_REMINDER"
  | "SCHEDULE_PUBLISHED";

const SUBJECT_BY_TYPE: Record<NotificationType, string> = {
  SWAP_REQUEST: "New swap request",
  SWAP_ACCEPTED: "Your swap was accepted",
  SWAP_DENIED: "Your swap was denied",
  ALL_HANDS_REMINDER: "All-hands reminder",
  SCHEDULE_PUBLISHED: "Schedule generated",
};

/**
 * Thin wrapper so every notification created across the app carries a
 * typed `type` (Notification.type is a free-form string in the schema)
 * and, when configured, an email alongside the in-app one.
 *
 * The email send is deliberately fire-and-forget on the non-transactional
 * `prisma` client, not `tx` — holding a DB transaction open for a network
 * call would be its own bug, and email is a bonus layered on top of the
 * in-app row this function just committed, not something that should be
 * able to roll it back.
 */
export function notify(
  tx: Prisma.TransactionClient | typeof prisma,
  params: { userId: string; type: NotificationType; message: string; relatedSwapId?: string },
) {
  const created = tx.notification.create({
    data: {
      userId: params.userId,
      type: params.type,
      message: params.message,
      relatedSwapId: params.relatedSwapId,
    },
  });

  prisma.user
    .findUnique({ where: { id: params.userId }, select: { email: true } })
    .then((user) => {
      if (user) return sendNotificationEmail(user.email, SUBJECT_BY_TYPE[params.type], params.message);
    })
    .catch((err) => console.error("Failed to look up user for notification email:", err));

  return created;
}
