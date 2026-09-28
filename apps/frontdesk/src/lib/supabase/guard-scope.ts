/**
 * Which paths the Frontdesk's session guard governs, as a pure decision.
 *
 * It lives apart from `proxy.ts` for one reason: this is a decision table, and
 * a decision table that can only be exercised by standing up a server is a
 * decision table nobody tests.
 */

/**
 * HARNESS-ONLY. The offline proof has to run on a desk with no session and no
 * reachable server: queueing a write needs no identity, and the whole point of
 * the battery is the outage (roadmap 05 Deliverable 6). The exemption is a
 * path prefix, not a flag, so the only things standing outside the guard are
 * the harness and its four routes. Deleting this prefix retires the exemption
 * with it.
 */
export const HARNESS_PREFIX = "/harness";

/**
 * The API surface is exempt from the PAGE guard, not from authorization: the
 * tRPC endpoint verifies the caller's token inside its own context (Layer 1,
 * spec/multi-tenancy.md §3), and the health probe is the reachability
 * authority with no data in it (spec/offline-sync.md §5). A page-style
 * redirect or 403 on these fetches would corrupt the transport's failure
 * classification — a guarded redirect is not a server refusal — so endpoints
 * authenticate at the procedure layer and stay outside the page guard.
 */
export const API_PREFIX = "/api";

/**
 * Both the redirect and the 403 ask this, so a path outside the guard is
 * genuinely outside it — a signed-in cashier opening the harness must not be
 * refused for holding no desk surface.
 */
export function requiresSession(pathname: string): boolean {
  const isSignin = pathname === "/signin" || pathname.startsWith("/signin/");
  const isHarness = pathname === HARNESS_PREFIX || pathname.startsWith(`${HARNESS_PREFIX}/`);
  const isApi = pathname === API_PREFIX || pathname.startsWith(`${API_PREFIX}/`);
  return !isSignin && !isHarness && !isApi;
}
