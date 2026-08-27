import type { LucideIcon } from "lucide-react";
import { CalendarClock, CalendarRange, LayoutDashboard, Megaphone } from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

// Genuinely shared — professors manage the same schedule/lecture-help
// data UTAs see, so both roles read/write these.
export const SHARED_NAV_ITEMS: NavItem[] = [
  { label: "Your Office Hours Schedule", href: "/uta/schedule", icon: CalendarRange },
  { label: "Lecture Help Schedule", href: "/uta/lecture-help", icon: Megaphone },
];

// TA-only: professors don't work office hours themselves, so they have
// no availability of their own to submit.
export const AVAILABILITY_NAV_ITEM: NavItem = {
  label: "Your Availability",
  href: "/uta/availability",
  icon: CalendarClock,
};

export const PROFESSOR_NAV_ITEM: NavItem = {
  label: "Dashboard",
  href: "/professor",
  icon: LayoutDashboard,
};
