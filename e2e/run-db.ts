import { execFileSync } from "node:child_process";
import path from "node:path";

/** Runs one db-cli.ts command via a tsx subprocess and returns its parsed
 * JSON result. This file itself has no Prisma import, so it's safe for
 * Playwright's Node-side loader (global-setup/teardown, spec files) to
 * import directly. */
export function runDb<T = unknown>(command: string, args?: Record<string, unknown>): T {
  const scriptPath = path.join(__dirname, "db-cli.ts");
  const output = execFileSync("npx", ["tsx", scriptPath, command, args ? JSON.stringify(args) : ""], {
    cwd: path.join(__dirname, ".."),
    encoding: "utf8",
  });
  const lastLine = output.trim().split("\n").filter(Boolean).pop() ?? "null";
  return JSON.parse(lastLine) as T;
}
