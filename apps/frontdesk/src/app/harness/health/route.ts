/**
 * HARNESS-ONLY. The reachability probe endpoint
 * (`spec/offline-sync.md` §5: `navigator.onLine` alone lies).
 *
 * The desk's connectivity monitor sends a HEAD here and treats `ok` as the
 * authority. The service worker routes this path NetworkOnly — a cached 200
 * would make a dead branch look connected, which is the one answer this
 * endpoint must never give (see src/app/sw.ts).
 *
 * There is no body to speak of: the status line is the whole answer, which is
 * why HEAD is a first-class export here rather than falling out of GET.
 */

const now = (): string => new Date().toISOString();

export function GET(): Response {
  return Response.json({ ok: true, at: now() }, { status: 200 });
}

export function HEAD(): Response {
  return new Response(null, { status: 200 });
}
