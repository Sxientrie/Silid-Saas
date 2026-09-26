import { harnessDouble, HARNESS_ROOMS } from "@/lib/harness/instance";
import { harnessReadSchema } from "@/lib/harness/read";

/**
 * HARNESS-ONLY. The read surface the desk mirrors into Dexie
 * (`spec/offline-sync.md` §1, §5).
 *
 * `servedAt` is sealed here, by the server, and the desk stores it beside the
 * rows it caches. That is what makes a cache hit identifiable: a read served
 * out of the worker's cache still carries the instant the server actually said
 * it, so a stale payload can never masquerade as a fresh one. `acceptedCount`
 * moves whenever this run's ledger takes a write, so "the caches were refreshed
 * after the drain" is an observable fact and not an inference.
 *
 * The response is built through the same schema the desk parses it with, so
 * the two halves of the double cannot drift apart.
 *
 * `run` is required. The double's ledger is one process-wide array, so a
 * global count would couple this route's number to whatever every other test in
 * the run happened to write first; a read belongs to the desk that asked for
 * it, exactly as the accept log is scoped the same way.
 */
export function GET(request: Request): Response {
  const run = new URL(request.url).searchParams.get("run")?.trim() ?? "";
  if (run === "") {
    return Response.json(
      { error: "The harness read needs a run to scope its ledger count.", code: "harness_no_run" },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }

  const body = harnessReadSchema.parse({
    servedAt: new Date().toISOString(),
    acceptedCount: harnessDouble.acceptLog(run).length,
    rooms: HARNESS_ROOMS,
  });

  return Response.json(body, { status: 200, headers: { "cache-control": "no-store" } });
}
