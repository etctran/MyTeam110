"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Mounted (invisibly) on a page that wants to react to broadcast()
 * pings from src/lib/realtime.ts. On every ping it just calls
 * router.refresh() — re-running the page's Server Component query
 * through the normal authenticated path, not trusting anything carried
 * on the socket itself.
 */
export function LiveRefresh({ channel, event = "update" }: { channel: string; event?: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const realtimeChannel = supabase
      .channel(channel)
      .on("broadcast", { event }, () => {
        router.refresh();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(realtimeChannel);
    };
  }, [channel, event, router]);

  return null;
}
