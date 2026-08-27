import type { ReactNode } from "react";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell/app-shell";
import { NotificationToast } from "@/components/app-shell/notification-toast";
import { notificationsChannel } from "@/lib/realtime";

export default async function AppLayout({ children }: { children: ReactNode }) {
  // The one thing that genuinely must block: we can't render any
  // protected content (including the shell) before knowing who this is.
  const user = await requireUser();

  return (
    <>
      <NotificationToast channel={notificationsChannel(user.id)} />
      <AppShell
        name={user.name}
        role={user.role}
        unreadBadge={
          // Not needed to paint the shell — stream it in separately so
          // the sidebar/nav never waits on a notification count query.
          <Suspense fallback={null}>
            <UnreadBadge userId={user.id} />
          </Suspense>
        }
      >
        {children}
      </AppShell>
    </>
  );
}

async function UnreadBadge({ userId }: { userId: string }) {
  const unreadCount = await prisma.notification.count({ where: { userId, read: false } });
  if (unreadCount === 0) return null;
  return (
    <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-soft-text">
      {unreadCount}
    </span>
  );
}
