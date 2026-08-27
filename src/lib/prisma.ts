import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma 7's generated client has no built-in connection string handling —
// it requires an explicit driver adapter. Reuse a single PrismaClient
// across hot reloads in dev so we don't exhaust the local Postgres pool.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// `pg.Pool` (what PrismaPg wraps) defaults `max` to 10 when unset. On
// Vercel that's 10 real connections to Supabase's transaction pooler
// *per container*, uncapped across however many containers are running —
// Supabase's own guidance is that serverless functions should keep this
// small (often 1) since Supavisor multiplexes many small client pools
// into a much smaller shared backend pool_size (~15-20 on smaller
// tiers): https://supabase.com/docs/guides/troubleshooting/supavisor-faq-YyP5tI
// We use 6, not 1, because page loads intentionally run several queries
// concurrently via Promise.all — 1 would serialize those within a
// single request. The widest actual batch is profile's MyData at 5
// concurrent queries, *plus* one more from (app)/layout.tsx's own
// UnreadBadge query — a sibling Suspense boundary that runs in parallel
// with every page, not after it. 4 undercounted both: it was sized to
// schedule's 4-query batch alone, missing the badge query stacking on
// top of every page (5) and profile's true 5-wide batch (6). Measured
// live: schedule/profile (5-6 concurrent, over the old cap of 4) showed
// a consistent ~800ms connection-wait penalty on every navigation;
// lecture-help/availability (3-2 concurrent, under the cap) never did.
// 6 covers the real peak while still capping each container far below
// the previous unbounded default of 10.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL!, max: 6 });

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
