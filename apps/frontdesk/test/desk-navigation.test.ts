import { describe, expect, it } from "vitest";
import { navItemsFor, canOpenSurface } from "../src/lib/desk-navigation";
import type { AppClaims } from "@silid/auth";

/**
 * Deliverable 5 — role-aware navigation and route guards. The navigation a
 * role sees and the surfaces the proxy lets it through are the same
 * decision, read from one list: a link the guard would refuse is not a link
 * the desk should be able to click (spec/authentication.md §3, Layer 2).
 */

const cashier: AppClaims = { role: "cashier", org_id: "org-1", branch_id: "branch-1" };
const orgAdmin: AppClaims = { role: "org_admin", org_id: "org-1", branch_id: null };
const platformAdmin: AppClaims = { role: "platform_admin", org_id: null, branch_id: null };

describe("role-aware desk navigation", () => {
  it("gives a cashier the desk surfaces and no org surface", () => {
    const hrefs = navItemsFor(cashier).map((item) => item.href);

    expect(hrefs).toContain("/");
    expect(hrefs).not.toContain("/organization");
  });

  it("gives an org admin the org surface alongside the desk", () => {
    const hrefs = navItemsFor(orgAdmin).map((item) => item.href);

    expect(hrefs).toContain("/");
    expect(hrefs).toContain("/organization");
  });

  it("gives a platform operator no desk surface at all", () => {
    // The operator role has no branch to operate a desk for, and the
    // Frontdesk is not its home; a nav with a dead Desk link would be a lie.
    expect(navItemsFor(platformAdmin)).toEqual([]);
  });

  it("gives a signed-out visitor nothing", () => {
    expect(navItemsFor(null)).toEqual([]);
  });

  it("refuses the org surface to a cashier", () => {
    expect(canOpenSurface("/organization", cashier)).toBe(false);
    expect(canOpenSurface("/organization", orgAdmin)).toBe(true);
  });

  it("refuses the whole desk to a platform operator", () => {
    expect(canOpenSurface("/", platformAdmin)).toBe(false);
    expect(canOpenSurface("/", cashier)).toBe(true);
  });

  it("refuses every surface without claims", () => {
    expect(canOpenSurface("/", null)).toBe(false);
  });
});
