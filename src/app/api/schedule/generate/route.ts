import { NextResponse, type NextRequest } from "next/server";
import { runScheduleGeneration } from "@/lib/scheduling/run-generation";

/**
 * §8: "pg_cron job (Thursday 5:00 PM): triggers an API route
 * /api/schedule/generate ... Runs the algorithm, creates the Week + Shift
 * rows in DRAFT, sends a notification to the professor."
 *
 * This has no Supabase session to check (pg_cron calls it directly, not
 * on behalf of a logged-in user — see proxy.ts's matcher, which excludes
 * /api entirely), so it authenticates via a shared secret instead. Set
 * CRON_SECRET and have the caller send it as `Authorization: Bearer
 * <secret>`. The professor's "Generate schedule" button (Phase 7) is the
 * human-triggered equivalent and goes through requireRole instead — see
 * src/lib/scheduling/run-generation.ts for the shared logic both call.
 */
export async function POST(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 500 });
  }

  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (provided !== expected) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const result = await runScheduleGeneration();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("Scheduled generation failed:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Generation failed." },
      { status: 500 },
    );
  }
}
