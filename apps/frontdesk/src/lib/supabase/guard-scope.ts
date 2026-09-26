/**
 * Which paths the Frontdesk's session guard governs, as a pure decision.
 *
 * It lives apart from `proxy.ts` for one reason: this is a decision table, and
 * a decision table that can only be exercised by standing up a server is a
 * decision table nobody tests. The proxy owns the cookie plumbing; this owns
 * the question "is this path guarded at all".
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
 * Both the redirect and the 403 ask this, so a path outside the guard is
 * genuinely outside it — a signed-in cashier opening the harness must not be
 * refused for holding no desk surface.
 */
export function requiresSession(pathname: string): boolean {
  const isSignin = pathname === "/signin" || pathname.startsWith("/signin/");
  const isHarness = pathname === HARNESS_PREFIX || pathname.startsWith(`${HARNESS_PREFIX}/`);
  return !isSignin && !isHarness;
}
