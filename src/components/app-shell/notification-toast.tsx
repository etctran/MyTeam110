"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { NOTIFICATION_ICON } from "@/lib/notification-icon";
import { getLatestNotification } from "./notification-toast-actions";

type Toast = { id: string; type: string; message: string };

/**
 * Mounted once in the (app) layout, so it's present on every page — not
 * just /notifications. Reacts to the same broadcast() pings the sidebar
 * badge and the Notifications page's own LiveRefresh already listen for;
 * this one additionally surfaces a dismissable banner wherever the user
 * currently is, and refreshes the route so the sidebar's unread count
 * stays live too.
 */
export function NotificationToast({ channel }: { channel: string }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const realtimeChannel = supabase
      .channel(channel)
      .on("broadcast", { event: "update" }, () => {
        router.refresh();
        getLatestNotification().then((n) => {
          if (!n) return;
          setToast(n);
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          timeoutRef.current = setTimeout(() => setToast(null), 6000);
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(realtimeChannel);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [channel, router]);

  if (!toast) return null;

  const Icon = NOTIFICATION_ICON[toast.type] ?? NOTIFICATION_ICON.default;

  return (
    <div className="announcement-card fixed right-6 top-6 z-50 flex max-w-sm items-start gap-3 p-4 text-sm shadow-lg">
      <Icon size={18} className="mt-0.5 shrink-0 text-accent" strokeWidth={2} />
      <p className="flex-1 text-text">{toast.message}</p>
      <button
        type="button"
        onClick={() => setToast(null)}
        className="shrink-0 rounded-full p-1 text-text-muted transition-colors hover:bg-bg-pill-hover hover:text-text"
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
}
