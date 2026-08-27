"use client";

import { useTransition } from "react";
import { X } from "lucide-react";
import { dismissNotification } from "./actions";

export function DismissButton({ notificationId }: { notificationId: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => startTransition(() => dismissNotification(notificationId))}
      className="shrink-0 rounded-full p-1 text-text-muted transition-colors hover:bg-bg-pill-hover hover:text-text disabled:opacity-50"
      aria-label="Dismiss notification"
    >
      <X size={14} />
    </button>
  );
}
