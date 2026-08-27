"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, LogOut, UserRound } from "lucide-react";
import { logout } from "@/app/login/actions";
import { AVAILABILITY_NAV_ITEM, PROFESSOR_NAV_ITEM, SHARED_NAV_ITEMS } from "@/lib/nav";
import type { Role } from "@/generated/prisma/client";

export function Sidebar({
  name,
  role,
  unreadCount,
}: {
  name: string;
  role: Role;
  unreadCount: number;
}) {
  const pathname = usePathname();
  const items =
    role === "PROFESSOR"
      ? [PROFESSOR_NAV_ITEM, ...SHARED_NAV_ITEMS]
      : [AVAILABILITY_NAV_ITEM, ...SHARED_NAV_ITEMS];

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-border bg-bg-sidebar px-4 py-5">
      <Link href="/" className="flex items-baseline px-2 pb-6">
        <span className="text-lg font-extrabold tracking-tight">MyTeam</span>
        <span className="text-lg font-extrabold tracking-tight text-accent">110</span>
      </Link>

      <nav className="flex flex-1 flex-col gap-1">
        {items.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link key={item.href} href={item.href} className="nav-link" data-active={active}>
              <Icon size={18} strokeWidth={2} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <Link
        href="/notifications"
        className="nav-link justify-between"
        data-active={pathname === "/notifications"}
      >
        <span className="flex items-center gap-2.5">
          <Bell size={18} strokeWidth={2} />
          Notifications
        </span>
        {unreadCount > 0 && (
          <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-soft-text">
            {unreadCount}
          </span>
        )}
      </Link>

      <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
        <Link
          href="/profile"
          className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1 hover:bg-bg-pill-hover"
          title="Profile"
        >
          <UserRound size={18} className="shrink-0 text-text-muted" />
          <span className="truncate text-sm font-medium">{name}</span>
        </Link>
        <form action={logout}>
          <button
            type="submit"
            aria-label="Sign out"
            title="Sign out"
            className="rounded-full p-2 text-text-muted transition-colors hover:bg-bg-pill-hover hover:text-text"
          >
            <LogOut size={17} />
          </button>
        </form>
      </div>
    </aside>
  );
}
