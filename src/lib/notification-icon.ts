import { ArrowLeftRight, CalendarCheck, CheckCircle2, Megaphone, XCircle, type LucideIcon } from "lucide-react";

export const NOTIFICATION_ICON: Record<string, LucideIcon> & { default: LucideIcon } = {
  SWAP_REQUEST: ArrowLeftRight,
  SWAP_ACCEPTED: CheckCircle2,
  SWAP_DENIED: XCircle,
  ALL_HANDS_REMINDER: Megaphone,
  SCHEDULE_PUBLISHED: CalendarCheck,
  default: Megaphone,
};
