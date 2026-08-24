import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Server-side "something changed, go refetch" ping over Supabase Realtime
 * Broadcast — deliberately not Postgres CDC (`postgres_changes`). This
 * project has no RLS policies (every check lives in the Server Actions),
 * so broadcasting raw row changes would let anyone with the public anon
 * key subscribe straight to the DB and bypass app-level auth entirely.
 * Broadcast carries no row data, just an event name — the client reacts
 * by calling router.refresh(), which re-runs the real, authenticated
 * Server Component query.
 *
 * Best-effort: a failed broadcast never breaks the mutation that
 * triggered it — the acting user's own view already updated via
 * revalidatePath either way, only *other* viewers miss the nudge and
 * see it on their next natural navigation instead.
 */
export async function broadcast(channelName: string, event = "update") {
  try {
    const supabase = createAdminClient();
    const channel = supabase.channel(channelName);

    await new Promise<void>((resolve, reject) => {
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          channel.send({ type: "broadcast", event, payload: {} }).then(() => resolve());
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          reject(new Error(`Realtime channel ${channelName} failed: ${status}`));
        }
      });
    });

    await supabase.removeChannel(channel);
  } catch (err) {
    console.error("Broadcast failed:", err);
  }
}

/** Every viewer's schedule page listens on this one channel — in practice
 * there's only ever one "upcoming week" actively being worked on, so a
 * single global channel is simpler than threading a weekId through every
 * call site for no real benefit. */
export const SCHEDULE_CHANNEL = "schedule-updates";

export function notificationsChannel(userId: string) {
  return `notifications:${userId}`;
}
