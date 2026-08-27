import type { ReactNode } from "react";
import type { Role } from "@/generated/prisma/client";
import { Sidebar } from "./sidebar";
import { AllHandsBanner } from "./all-hands-banner";

export function AppShell({
  name,
  role,
  unreadBadge,
  children,
}: {
  name: string;
  role: Role;
  unreadBadge: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <Sidebar name={name} role={role} unreadBadge={unreadBadge} />
      <main className="flex-1 overflow-x-auto px-10 py-8">
        <AllHandsBanner />
        {children}
      </main>
    </div>
  );
}

export function PageHeader({
  title,
  action,
  live,
}: {
  title: string;
  action?: ReactNode;
  live?: boolean;
}) {
  return (
    <div className="mb-8 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">{title}</h1>
        {live && (
          <span className="flex items-center gap-1.5 rounded-full border border-border-strong px-2.5 py-1 text-xs text-text-muted">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
            </span>
            Live
          </span>
        )}
      </div>
      {action}
    </div>
  );
}
