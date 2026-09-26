import { harnessDouble } from "@/lib/harness/instance";

/**
 * HARNESS-ONLY. The server's view of what it accepted, in arrival order.
 *
 * Reading it is how an E2E clip proves the ordered, exactly-once replay
 * without trusting the desk's own report. `?run=` scopes the view to one
 * test's actions so a shared server does not show one test another test's
 * rows, and DELETE resets the ledger between runs — a double whose state
 * outlives the assertion about it proves nothing.
 */
export function GET(request: Request): Response {
  const run = new URL(request.url).searchParams.get("run");
  return Response.json(
    { rows: harnessDouble.acceptLog(run ?? undefined) },
    { status: 200, headers: { "cache-control": "no-store" } },
  );
}

export function DELETE(): Response {
  harnessDouble.clear();
  return new Response(null, { status: 204 });
}
