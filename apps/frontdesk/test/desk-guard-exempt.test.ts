import { describe, expect, it } from "vitest";
import { requiresSession } from "../src/lib/supabase/guard-scope";

/**
 * Deliverable 5 — the guard's exemption set, isolated from the proxy's
 * cookie plumbing so it can be asserted as a decision.
 *
 * The exemption is the riskiest line in the guard: too wide and the desk's
 * own surfaces fall out of Layer 2, too narrow and the offline proof needs a
 * session it must not have (roadmap 05 Deliverable 6). Both failure modes are
 * cheap to state and easy to get wrong, so both are stated here.
 */

describe("which frontdesk paths the session guard covers", () => {
  it("guards the desk itself", () => {
    expect(requiresSession("/")).toBe(true);
  });

  it("guards the org surface", () => {
    expect(requiresSession("/organization")).toBe(true);
  });

  it("leaves the sign-in page alone, or it could never be reached", () => {
    expect(requiresSession("/signin")).toBe(false);
  });

  it("stands aside for the harness and its routes", () => {
    expect(requiresSession("/harness")).toBe(false);
    expect(requiresSession("/harness/health")).toBe(false);
    expect(requiresSession("/harness/write")).toBe(false);
  });

  it("does not extend the exemption to a path that merely looks like it", () => {
    // "/harnessing" is a different route, and a prefix match on the string
    // "harness" would quietly exempt it.
    expect(requiresSession("/harnessing")).toBe(true);
    expect(requiresSession("/harness-admin")).toBe(true);
  });

  it("guards anything else that is not the harness", () => {
    expect(requiresSession("/organization/settings")).toBe(true);
  });
});
