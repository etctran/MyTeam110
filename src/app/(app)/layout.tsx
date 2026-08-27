import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell/app-shell";
import { NotificationToast } from "@/components/app-shell/notification-toast";
import { notificationsChannel } from "@/lib/realtime";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const unreadCount = await prisma.notification.count({ where: { userId: user.id, read: false } });

  return (
    <>
      <NotificationToast channel={notificationsChannel(user.id)} />
      <AppShell name={user.name} role={user.role} unreadCount={unreadCount}>
        {children}
      </AppShell>
    </>
  );
}
