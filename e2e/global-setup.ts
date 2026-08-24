import { runDb } from "./run-db";

/** Runs once before the whole suite (playwright.config.ts `globalSetup`).
 * Creates a small, dedicated set of e2e-only accounts — see constants.ts
 * for why these are namespaced separately from the shared seed accounts. */
export default async function globalSetup() {
  runDb("seed-users");
}
