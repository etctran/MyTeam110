/**
 * Seeds the local DB with a handful of test users per §9 build order:
 * a couple professors, a mix of 5-hour/10-hour TAs, a few marked senior.
 *
 * For each user this creates BOTH a Supabase Auth user (so you can log
 * in) and the matching Prisma `User` row (joined by email) — see the
 * Phase 1–2 design note on why role lives in Supabase `app_metadata`.
 *
 * Run with: pnpm db:seed
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { PrismaClient, type Role, type TaType } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createAdminClient } from "../src/lib/supabase/admin";

// DIRECT_URL (session pooler / direct connection) when set — see
// prisma.config.ts — falls back to DATABASE_URL for local dev.
const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });
const supabaseAdmin = createAdminClient();

const TEST_PASSWORD = process.env.SEED_TEST_PASSWORD ?? "password123";

type SeedUser = {
  name: string;
  email: string;
  role: Role;
  taType?: TaType;
  isSenior?: boolean;
  weeklyQuota?: number;
};

// FIVE_HOUR = 4 hrs/week, TEN_HOUR = 8 hrs/week, per §3.
const QUOTA_BY_TA_TYPE: Record<TaType, number> = {
  FIVE_HOUR: 4,
  TEN_HOUR: 8,
};

const SEED_USERS: SeedUser[] = [
  { name: "Priya Nair", email: "prof1@test.dev", role: "PROFESSOR" },
  { name: "David Kim", email: "prof2@test.dev", role: "PROFESSOR" },

  { name: "Alex Chen", email: "ta1@test.dev", role: "UTA", taType: "FIVE_HOUR", isSenior: false },
  { name: "Jordan Lee", email: "ta2@test.dev", role: "UTA", taType: "FIVE_HOUR", isSenior: false },
  { name: "Sam Ortiz", email: "ta3@test.dev", role: "UTA", taType: "FIVE_HOUR", isSenior: true },
  { name: "Morgan Patel", email: "ta4@test.dev", role: "UTA", taType: "TEN_HOUR", isSenior: false },
  { name: "Taylor Brooks", email: "ta5@test.dev", role: "UTA", taType: "TEN_HOUR", isSenior: true },
  { name: "Riley Zhang", email: "ta6@test.dev", role: "UTA", taType: "TEN_HOUR", isSenior: true },
];

async function findAuthUserByEmail(email: string) {
  // Local dev seed set is small; listUsers() default page covers it.
  const { data, error } = await supabaseAdmin.auth.admin.listUsers();
  if (error) throw error;
  return data.users.find((u) => u.email === email) ?? null;
}

async function upsertAuthUser(seedUser: SeedUser) {
  const existing = await findAuthUserByEmail(seedUser.email);

  if (existing) {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(existing.id, {
      app_metadata: { role: seedUser.role },
    });
    if (error) throw error;
    return existing.id;
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: seedUser.email,
    password: TEST_PASSWORD,
    email_confirm: true,
    app_metadata: { role: seedUser.role },
  });
  if (error) throw error;
  return data.user.id;
}

async function main() {
  for (const seedUser of SEED_USERS) {
    await upsertAuthUser(seedUser);

    const weeklyQuota =
      seedUser.weeklyQuota ?? (seedUser.taType ? QUOTA_BY_TA_TYPE[seedUser.taType] : null);

    await prisma.user.upsert({
      where: { email: seedUser.email },
      update: {
        name: seedUser.name,
        role: seedUser.role,
        taType: seedUser.taType ?? null,
        isSenior: seedUser.isSenior ?? false,
        weeklyQuota,
      },
      create: {
        name: seedUser.name,
        email: seedUser.email,
        role: seedUser.role,
        taType: seedUser.taType ?? null,
        isSenior: seedUser.isSenior ?? false,
        weeklyQuota,
        hireDate: new Date(),
      },
    });

    console.log(`seeded ${seedUser.role.padEnd(9)} ${seedUser.email}`);
  }

  console.log(`\nAll seeded accounts use password: ${TEST_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
