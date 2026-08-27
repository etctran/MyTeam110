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
// We use 4, not 1, because page loads intentionally run several queries
// concurrently via Promise.all — 1 would serialize those within a
// single request. 4 covers our widest Promise.all batch while still
// capping each container far below the previous unbounded default.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL!, max: 4 });

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
