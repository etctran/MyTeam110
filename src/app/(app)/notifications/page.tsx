import { Suspense } from "react";
import { requireUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app-shell/app-shell";
import { InlineLoading } from "@/components/app-shell/inline-loading";
import { LiveRefresh } from "@/components/live-refresh";
import { notificationsChannel } from "@/lib/realtime";
import { NOTIFICATION_ICON } from "@/lib/notification-icon";
import { DismissButton } from "./dismiss-button";

export default async function NotificationsPage() {
  const user = await requireUser();

  return (
    <>
      <LiveRefresh channel={notificationsChannel(user.id)} />
      <PageHeader title="Notifications" live />
      <Suspense fallback={<InlineLoading />}>
        <NotificationsList userId={user.id} />
      </Suspense>
    </>
  );
}

async function NotificationsList({ userId }: { userId: string }) {
  const notifications = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
  if (unreadIds.length > 0) {
    await prisma.notification.updateMany({ where: { id: { in: unreadIds } }, data: { read: true } });
  }

  if (notifications.length === 0) {
    return <p className="text-sm text-text-muted">Nothing here yet.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {notifications.map((n) => {
        const Icon = NOTIFICATION_ICON[n.type] ?? NOTIFICATION_ICON.default;
        const isUnread = unreadIds.includes(n.id);
        return (
          <div
            key={n.id}
            className={
              "flex items-start gap-3 p-4 text-sm " + (isUnread ? "announcement-card" : "panel-card")
            }
          >
            <Icon size={18} className="mt-0.5 shrink-0 text-accent" strokeWidth={2} />
            <div className="flex-1">
              <p className={isUnread ? "font-medium text-text" : "text-text"}>{n.message}</p>
              <p className="mt-1 text-xs text-text-muted">{n.createdAt.toLocaleString()}</p>
            </div>
            <DismissButton notificationId={n.id} />
          </div>
        );
      })}
    </div>
  );
}
