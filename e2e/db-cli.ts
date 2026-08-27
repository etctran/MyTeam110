/**
 * All e2e DB access funnels through this one script, run via `tsx` as a
 * subprocess (see run-db.ts) — never imported directly by anything
 * Playwright's own Node-side loader executes. Usage:
 *   npx tsx e2e/db-cli.ts <command> '<json-args>'
 * Prints one line of JSON to stdout: the command's result.
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
import { WebSocket } from "ws";
if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;
}
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createClient } from "@supabase/supabase-js";
import { E2E_PREFIX, E2E_USERS, E2E_PASSWORD } from "./constants";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function upsertAuthUser(email: string, role: "PROFESSOR" | "UTA") {
  const { data: existing } = await admin.auth.admin.listUsers();
  const found = existing.users.find((u) => u.email === email);
  if (found) return found.id;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: E2E_PASSWORD,
    email_confirm: true,
    app_metadata: { role },
  });
  if (error || !data.user) throw error ?? new Error(`Failed to create ${email}`);
  return data.user.id;
}

async function seedUsers() {
  await upsertAuthUser(E2E_USERS.professor.email, "PROFESSOR");
  await prisma.user.upsert({
    where: { email: E2E_USERS.professor.email },
    update: {},
    create: { name: E2E_USERS.professor.name, email: E2E_USERS.professor.email, role: "PROFESSOR" },
  });

  for (const key of ["ta1", "ta2", "ta3"] as const) {
    const ta = E2E_USERS[key];
    await upsertAuthUser(ta.email, "UTA");
    await prisma.user.upsert({
      where: { email: ta.email },
      update: {},
      create: {
        name: ta.name,
        email: ta.email,
        role: "UTA",
        taType: ta.taType,
        isReturning: ta.isReturning,
        weeklyQuota: ta.taType === "TEN_HOUR" ? 8 : 4,
      },
    });
  }
  return { ok: true };
}

async function teardownUsers() {
  const users = await prisma.user.findMany({ where: { email: { startsWith: E2E_PREFIX } } });
  const userIds = users.map((u) => u.id);

  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.swapRequest.deleteMany({
    where: { OR: [{ requesterId: { in: userIds } }, { targetId: { in: userIds } }] },
  });
  await prisma.shiftAssignment.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.lectureHelpSignup.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.availability.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.lectureHelpSlot.deleteMany({ where: { courseInfo: { startsWith: E2E_PREFIX } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });

  const { data } = await admin.auth.admin.listUsers();
  for (const authUser of data.users) {
    if (authUser.email?.startsWith(E2E_PREFIX)) {
      await admin.auth.admin.deleteUser(authUser.id);
    }
  }
  return { ok: true };
}

async function setAvailability(args: { email: string; dayOfWeek: number; startTime: string; endTime: string }) {
  const user = await prisma.user.findUniqueOrThrow({ where: { email: args.email } });
  await prisma.availability.deleteMany({ where: { userId: user.id, dayOfWeek: args.dayOfWeek } });
  await prisma.availability.create({
    data: { userId: user.id, dayOfWeek: args.dayOfWeek, startTime: args.startTime, endTime: args.endTime },
  });
  return { ok: true };
}

async function clearAvailability(args: { email: string; dayOfWeek?: number }) {
  const user = await prisma.user.findUniqueOrThrow({ where: { email: args.email } });
  await prisma.availability.deleteMany({
    where: { userId: user.id, ...(args.dayOfWeek != null ? { dayOfWeek: args.dayOfWeek } : {}) },
  });
  return { ok: true };
}

async function getAvailability(args: { email: string }) {
  const user = await prisma.user.findUniqueOrThrow({ where: { email: args.email } });
  const rows = await prisma.availability.findMany({ where: { userId: user.id } });
  return rows.map((r) => ({ dayOfWeek: r.dayOfWeek, startTime: r.startTime, endTime: r.endTime }));
}

async function cleanupShifts(args: { dayOfWeek: number; startTimes: string[] }) {
  const shifts = await prisma.shift.findMany({
    where: { dayOfWeek: args.dayOfWeek, startTime: { in: args.startTimes } },
  });
  const shiftIds = shifts.map((s) => s.id);
  await prisma.shiftAssignment.deleteMany({ where: { shiftId: { in: shiftIds } } });
  await prisma.shift.deleteMany({ where: { id: { in: shiftIds } } });
  return { ok: true };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic CLI dispatch table; each handler's real param type is enforced at its own definition above.
const COMMANDS: Record<string, (args: any) => Promise<unknown>> = {
  "seed-users": seedUsers,
  "teardown-users": teardownUsers,
  "set-availability": setAvailability,
  "clear-availability": clearAvailability,
  "get-availability": getAvailability,
  "cleanup-shifts": cleanupShifts,
};

async function main() {
  const [, , command, argJson] = process.argv;
  const handler = COMMANDS[command];
  if (!handler) throw new Error(`Unknown db-cli command: ${command}`);
  const args = argJson ? JSON.parse(argJson) : {};
  const result = await handler(args);
  console.log(JSON.stringify(result ?? null));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
