/**
 * Deliberately Prisma-free — safe to import from any Playwright-loaded
 * file (global-setup/teardown, spec files). The generated Prisma client
 * is ESM-only (import.meta.url etc.) and Playwright's Node-side loader
 * can't execute that directly; see db-cli.ts + run-db.ts for how DB
 * access actually happens (a tsx subprocess, the one runtime in this
 * project that's proven to load it correctly).
 */
export const E2E_PREFIX = "e2e-";
export const E2E_PASSWORD = "e2e-test-password-123";

export const E2E_USERS = {
  professor: { email: "e2e-prof@e2e.test", name: "E2E Professor" },
  ta1: { email: "e2e-ta1@e2e.test", name: "E2E TaOne", taType: "FIVE_HOUR" as const, isSenior: false },
  ta2: { email: "e2e-ta2@e2e.test", name: "E2E TaTwo", taType: "TEN_HOUR" as const, isSenior: true },
  ta3: { email: "e2e-ta3@e2e.test", name: "E2E TaThree", taType: "FIVE_HOUR" as const, isSenior: false },
};
