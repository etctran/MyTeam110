import { runDb } from "./run-db";

/** Runs once after the whole suite — sweeps every e2e-owned row (users,
 * their availability/assignments/signups/notifications/swaps, and any
 * lecture-help section tagged with the e2e prefix). Deliberately does
 * NOT do a blanket "delete empty shifts" sweep — an empty shift could
 * just as easily be something the professor legitimately created and
 * hasn't staffed yet in this same local DB. Shifts individual specs
 * create are each spec's own responsibility (see schedule.spec.ts). */
export default async function globalTeardown() {
  runDb("teardown-users");
}
