import { requireUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app-shell/app-shell";
import { LiveRefresh } from "@/components/live-refresh";
import { notificationsChannel } from "@/lib/realtime";
import { NOTIFICATION_ICON } from "@/lib/notification-icon";

export default async function NotificationsPage() {
  const user = await requireUser();

  const notifications = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
  if (unreadIds.length > 0) {
    await prisma.notification.updateMany({ where: { id: { in: unreadIds } }, data: { read: true } });
  }

  return (
    <>
      <LiveRefresh channel={notificationsChannel(user.id)} />
      <PageHeader title="Notifications" live />
      {notifications.length === 0 ? (
        <p className="text-sm text-text-muted">Nothing here yet.</p>
      ) : (
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
                <div>
                  <p className={isUnread ? "font-medium text-text" : "text-text"}>{n.message}</p>
                  <p className="mt-1 text-xs text-text-muted">{n.createdAt.toLocaleString()}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
