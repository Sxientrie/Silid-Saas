import { harnessDouble } from "@/lib/harness/instance";

/**
 * HARNESS-ONLY. The mutation target the offline write contract is proven
 * against (roadmap 05 Deliverable 6).
 *
 * The route is deliberately thin: it parses nothing itself and decides
 * nothing itself. The double owns the ledger, the strict envelope schema, the
 * key coalescence, and the server's clock, so the same behaviour is asserted
 * by unit tests and observed over HTTP without a second implementation that
 * could disagree with the first.
 */

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    // Unparseable bytes are a bad request, not an outage: a desk that sent
    // this has a bug, and replaying it would send it again forever.
    return Response.json(
      { error: "Harness write body was not JSON.", code: "harness_bad_body" },
      { status: 400 },
    );
  }

  const outcome = harnessDouble.accept(body);
  return Response.json(outcome.body, { status: outcome.status });
}
