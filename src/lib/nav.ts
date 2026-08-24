import type { LucideIcon } from "lucide-react";
import { CalendarClock, CalendarRange, LayoutDashboard, Megaphone } from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

// The 3 shared tabs from §5 — visible to both roles, since professors read
///manage the same data UTAs see. "Dashboard" is appended for professors only.
export const SHARED_NAV_ITEMS: NavItem[] = [
  { label: "Your Availability", href: "/uta/availability", icon: CalendarClock },
  { label: "Your Office Hours Schedule", href: "/uta/schedule", icon: CalendarRange },
  { label: "Lecture Help Schedule", href: "/uta/lecture-help", icon: Megaphone },
];

export const PROFESSOR_NAV_ITEM: NavItem = {
  label: "Dashboard",
  href: "/professor",
  icon: LayoutDashboard,
};
