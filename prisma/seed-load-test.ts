/**
 * One-off: adds ~40 extra TAs with randomized, quota-appropriate
 * availability (a mix of FIVE_HOUR/TEN_HOUR, some returning), then runs
 * the real schedule-generation algorithm — the same code path the
 * professor's "Generate schedule" button calls — so you can see it
 * operate at realistic scale.
 *
 * Not part of the regular seed/unseed pair; purely for exploring the
 * algorithm. Clean up afterward with `pnpm db:unseed && pnpm db:seed`
 * (removes every @test.dev account, including these, then restores the
 * small 8-account demo roster).
 *
 * Run with: pnpm db:seed:loadtest
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { PrismaClient, type TaType } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createAdminClient } from "../src/lib/supabase/admin";
import { OPERATING_DAYS, OPERATING_HOURS, formatTime, type DayOfWeek } from "../src/lib/operating-hours";

// Deliberately NOT importing run-generation.ts directly: it (transitively)
// imports "server-only", which throws outside Next's own bundler (same
// class of issue as e2e/db-cli.ts vs. the generated Prisma client — see
// e2e/README.md). Instead, this hits the real /api/schedule/generate
// route over HTTP, exactly like the Thursday cron job does, so the dev
// server's own process runs the actual generation code.
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });
const supabaseAdmin = createAdminClient();

const TEST_PASSWORD = process.env.SEED_TEST_PASSWORD ?? "password123";
const COUNT = 40;

// Seeded RNG (not Math.random) so re-runs produce the same mix instead
// of a different roster every time you look.
function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(110);

// Distinct-looking names so the schedule grid's per-cell roster reads
// like a real team, not 40 copies of "Load Test N" all sharing one
// first name (the grid only shows first names).
const FIRST_NAMES = [
  "Ava", "Liam", "Maya", "Noah", "Zoe", "Ethan", "Mia", "Owen", "Lily", "Kai",
  "Nora", "Leo", "Ella", "Ezra", "Ruby", "Finn", "Ivy", "Milo", "Luna", "Theo",
  "Iris", "Jonah", "Rhea", "Silas", "June", "Arlo", "Nova", "Remy", "Sage", "Wren",
  "Beau", "Tessa", "Cruz", "Piper", "Axel", "Elena", "Rowan", "Skye", "Cole", "Vera",
];
const LAST_NAMES = [
  "Reyes", "Chen", "Patel", "Nguyen", "Okafor", "Kim", "Ali", "Silva", "Novak", "Haas",
  "Brooks", "Diallo", "Torres", "Meyer", "Osei", "Park", "Rivas", "Lund", "Abara", "Voss",
];

function nameFor(index: number) {
  // Different moduli (40 vs 20) so first/last names vary independently
  // instead of every last name collapsing to the same one across all 40.
  const first = FIRST_NAMES[index % FIRST_NAMES.length];
  const last = LAST_NAMES[index % LAST_NAMES.length];
  return `${first} ${last}`;
}

async function upsertAuthUser(email: string) {
  const { data, error } = await supabaseAdmin.auth.admin.listUsers();
  if (error) throw error;
  const existing = data.users.find((u) => u.email === email);
  if (existing) return existing.id;

  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    app_metadata: { role: "UTA" },
  });
  if (createError || !created.user) throw createError ?? new Error(`Failed to create ${email}`);
  return created.user.id;
}

/** 1-2 contiguous windows on random operating days, sized around the TA's quota. */
async function layDownAvailability(userId: string, weeklyQuota: number, taType: TaType) {
  await prisma.availability.deleteMany({ where: { userId } });

  const days = [...OPERATING_DAYS].sort(() => rand() - 0.5) as DayOfWeek[];
  const windowCount = taType === "TEN_HOUR" ? 2 : rand() < 0.5 ? 2 : 1;
  let remaining = weeklyQuota;

  for (let w = 0; w < windowCount && remaining > 0; w++) {
    const day = days[w % days.length];
    const { start, end } = OPERATING_HOURS[day];
    const span = end - start;
    const length = Math.max(2, Math.min(remaining, Math.floor(span * (0.3 + rand() * 0.4))));
    const latestStart = Math.max(start, end - length);
    const windowStart = start + Math.floor(rand() * Math.max(1, latestStart - start + 1));
    const windowEnd = Math.min(end, windowStart + length);

    await prisma.availability.create({
      data: { userId, dayOfWeek: day, startTime: formatTime(windowStart), endTime: formatTime(windowEnd) },
    });
    remaining -= windowEnd - windowStart;
  }
}

async function main() {
  console.log(`Seeding ${COUNT} load-test TAs...`);

  for (let i = 1; i <= COUNT; i++) {
    const email = `loadtest-${String(i).padStart(2, "0")}@test.dev`;
    const name = nameFor(i - 1);
    const taType: TaType = rand() < 0.5 ? "FIVE_HOUR" : "TEN_HOUR";
    const isReturning = rand() < 0.8; // ~80% of real TAs are returning
    const weeklyQuota = taType === "FIVE_HOUR" ? 4 : 8;

    await upsertAuthUser(email);
    const user = await prisma.user.upsert({
      where: { email },
      update: { name, taType, isReturning, weeklyQuota },
      create: {
        name,
        email,
        role: "UTA",
        taType,
        isReturning,
        weeklyQuota,
        hireDate: new Date(),
      },
    });

    await layDownAvailability(user.id, weeklyQuota, taType);
    console.log(`  ${name.padEnd(16)} ${email}  ${taType.padEnd(9)}  returning=${isReturning}`);
  }

  console.log(`\nTriggering schedule generation via ${APP_URL}/api/schedule/generate...`);
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.log("No CRON_SECRET in .env.local — skipping. Click \"Generate schedule\" on the professor dashboard instead.");
    return;
  }

  try {
    const res = await fetch(`${APP_URL}/api/schedule/generate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
    console.log(
      `Done: ${body.shiftCount} shifts, ${body.needsAttentionCount} need attention, ${body.needsLeadCount} missing a lead.`,
    );
  } catch (err) {
    console.log(
      `Couldn't reach the dev server (${err instanceof Error ? err.message : err}). ` +
        `Start it with \`pnpm dev\` and either re-run this script or click "Generate schedule" on the professor dashboard.`,
    );
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
