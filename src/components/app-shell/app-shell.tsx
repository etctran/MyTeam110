import type { ReactNode } from "react";
import type { Role } from "@/generated/prisma/client";
import { Sidebar } from "./sidebar";
import { AllHandsBanner } from "./all-hands-banner";

export function AppShell({
  name,
  role,
  unreadCount,
  children,
}: {
  name: string;
  role: Role;
  unreadCount: number;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <AllHandsBanner />
      <div className="flex flex-1">
        <Sidebar name={name} role={role} unreadCount={unreadCount} />
        <main className="flex-1 overflow-x-auto px-10 py-8">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex items-center justify-between gap-4">
      <h1 className="text-xl font-semibold">{title}</h1>
      {action}
    </div>
  );
}
