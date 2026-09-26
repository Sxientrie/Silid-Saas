import { describe, expect, it } from "vitest";
import { mapStaffIdentifier } from "../src/lib/staff-identifier";

/**
 * Deliverable 5 — login. The bare-identifier mapping is presentation
 * ergonomics carried over from the legacy (vault-19): a cashier types the
 * short identifier they know, and the screen maps it to the account's email
 * before the standard Supabase password sign-in. It decides nothing — no
 * role, no scope, no claim comes from this string.
 */
describe("the bare staff identifier mapping", () => {
  it("expands a bare identifier onto the deployment's staff domain", () => {
    const mapped = mapStaffIdentifier("m.reyes", "silid.example");

    expect(mapped).toEqual({ ok: true, email: "m.reyes@silid.example", expanded: true });
  });

  it("passes an address-shaped identifier through untouched", () => {
    // Nothing to expand: the identifier is already the account's email, and
    // rewriting it would be the mapping deciding something it must not.
    const mapped = mapStaffIdentifier("m.reyes@silid.example", "silid.example");

    expect(mapped).toEqual({ ok: true, email: "m.reyes@silid.example", expanded: false });
  });

  it("trims what the cashier typed", () => {
    expect(mapStaffIdentifier("  m.reyes  ", "silid.example")).toEqual({
      ok: true,
      email: "m.reyes@silid.example",
      expanded: true,
    });
  });

  it("lowercases the domain so a mistyped case cannot invent a second account", () => {
    expect(mapStaffIdentifier("m.reyes", "Silid.Example")).toEqual({
      ok: true,
      email: "m.reyes@silid.example",
      expanded: true,
    });
  });

  it("refuses an empty identifier instead of guessing", () => {
    const mapped = mapStaffIdentifier("   ", "silid.example");

    expect(mapped.ok).toBe(false);
    if (mapped.ok) throw new Error("unreachable");
    expect(mapped.reason).toContain("identifier");
  });

  it("refuses a bare identifier when the deployment has no staff domain", () => {
    // Guessing a domain would either fail at the server or, worse, sign
    // someone in against an account they did not mean to use.
    const mapped = mapStaffIdentifier("m.reyes", null);

    expect(mapped.ok).toBe(false);
    if (mapped.ok) throw new Error("unreachable");
    expect(mapped.reason).toContain("full email address");
  });

  it("refuses a bare identifier when the configured domain is blank", () => {
    expect(mapStaffIdentifier("m.reyes", "   ").ok).toBe(false);
  });

  it("refuses an identifier that already carries an @ with nothing after it", () => {
    // "m.reyes@" is a typo, not a bare identifier; expanding it would
    // produce a domain-shaped string that is definitely not an account.
    expect(mapStaffIdentifier("m.reyes@", "silid.example").ok).toBe(false);
  });
});
