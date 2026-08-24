import { requireUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app-shell/app-shell";

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
      <PageHeader title="Notifications" />
      {notifications.length === 0 ? (
        <p className="text-sm text-text-muted">Nothing here yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={"panel-card p-3 text-sm " + (unreadIds.includes(n.id) ? "border-accent" : "")}
            >
              <p>{n.message}</p>
              <p className="mt-1 text-xs text-text-muted">{n.createdAt.toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
