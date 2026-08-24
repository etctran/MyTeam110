import { WebSocket } from "ws";

// supabase-js always spins up a RealtimeClient on construction, which
// requires a global `WebSocket` — stable only from Node 22+. Polyfill it
// for Node 20 server-side contexts (this repo's server/admin clients never
// actually use realtime in the MVP, but construction still needs this).
// Deliberately NOT guarded with "server-only": this also gets imported by
// the standalone seed script (via admin.ts), which runs outside Next's
// bundler where that guard package would throw unconditionally.
if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;
}
