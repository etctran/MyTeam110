/**
 * Removes everything created by `prisma/seed.ts` — every Prisma `User`
 * row with an `@test.dev` email, all rows that reference them, and the
 * matching Supabase Auth users. Safe to run any time: it only ever
 * touches the `@test.dev` domain, never real accounts.
 *
 * Run with: pnpm db:unseed
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createAdminClient } from "../src/lib/supabase/admin";

// DIRECT_URL (session pooler / direct connection) when set — see
// prisma.config.ts — falls back to DATABASE_URL for local dev.
const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });
const supabaseAdmin = createAdminClient();

const SEED_EMAIL_SUFFIX = "@test.dev";

async function main() {
  const users = await prisma.user.findMany({
    where: { email: { endsWith: SEED_EMAIL_SUFFIX } },
  });
  const userIds = users.map((u) => u.id);

  if (userIds.length === 0) {
    console.log("No seeded (@test.dev) users found — nothing to remove.");
  } else {
    // Same dependency order as e2e/db-cli.ts's teardownUsers — no
    // cascade deletes are configured, so children go first.
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.swapRequest.deleteMany({
      where: { OR: [{ requesterId: { in: userIds } }, { targetId: { in: userIds } }] },
    });
    await prisma.shiftAssignment.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.lectureHelpSignup.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.availability.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });

    for (const u of users) {
      console.log(`removed Prisma user ${u.email}`);
    }
  }

  const { data, error } = await supabaseAdmin.auth.admin.listUsers();
  if (error) throw error;

  const authUsers = data.users.filter((u) => u.email?.endsWith(SEED_EMAIL_SUFFIX));
  for (const authUser of authUsers) {
    const { error: delError } = await supabaseAdmin.auth.admin.deleteUser(authUser.id);
    if (delError) throw delError;
    console.log(`removed auth user ${authUser.email}`);
  }

  if (userIds.length === 0 && authUsers.length === 0) {
    console.log("Nothing to do — no seeded data or auth users remain.");
  } else {
    console.log("\nAll @test.dev seed data removed.");
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
