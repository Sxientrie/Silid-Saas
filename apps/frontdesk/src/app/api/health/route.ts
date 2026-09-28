/**
 * The desk's reachability probe endpoint (spec/offline-sync.md §5:
 * `navigator.onLine` alone lies). A HEAD here answers with the status line
 * alone — a cached 200 would make a dead branch look connected, which is the
 * one answer this endpoint must never give.
 */
export function GET(): Response {
  return Response.json({ ok: true }, { status: 200 });
}

export function HEAD(): Response {
  return new Response(null, { status: 200 });
}
