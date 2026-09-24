import { describe, expect, it } from "vitest";
import {
  APP_ROLES,
  claimsFromSession,
  claimsFromUser,
  parseAppClaims,
  readAppClaims,
} from "../src/index.js";

const ORG_A = "11111111-1111-4111-8111-111111111111";
const BRANCH_1 = "22222222-2222-4222-8222-222222222222";

describe("app_metadata claim readers (spec/authentication.md §2)", () => {
  it("exposes exactly the three ROLES BY TIER identifiers", () => {
    expect([...APP_ROLES]).toEqual(["platform_admin", "org_admin", "cashier"]);
  });

  it("accepts a cashier carrying both org_id and branch_id", () => {
    const claims = readAppClaims({
      app_metadata: { role: "cashier", org_id: ORG_A, branch_id: BRANCH_1 },
    });
    expect(claims).toEqual({
      role: "cashier",
      org_id: ORG_A,
      branch_id: BRANCH_1,
    });
  });

  it("accepts an org_admin with branch_id null", () => {
    const claims = readAppClaims({
      app_metadata: { role: "org_admin", org_id: ORG_A, branch_id: null },
    });
    expect(claims).toEqual({
      role: "org_admin",
      org_id: ORG_A,
      branch_id: null,
    });
  });

  it("accepts a platform_admin with null org_id and branch_id", () => {
    const claims = readAppClaims({
      app_metadata: { role: "platform_admin", org_id: null, branch_id: null },
    });
    expect(claims).toEqual({
      role: "platform_admin",
      org_id: null,
      branch_id: null,
    });
  });

  it("normalizes absent claim keys to null for the platform role", () => {
    const claims = readAppClaims({ app_metadata: { role: "platform_admin" } });
    expect(claims).toEqual({
      role: "platform_admin",
      org_id: null,
      branch_id: null,
    });
  });

  it("rejects an org_admin whose branch_id is set", () => {
    expect(
      readAppClaims({
        app_metadata: { role: "org_admin", org_id: ORG_A, branch_id: BRANCH_1 },
      }),
    ).toBeNull();
  });

  it("rejects a cashier missing its branch", () => {
    expect(
      readAppClaims({ app_metadata: { role: "cashier", org_id: ORG_A } }),
    ).toBeNull();
  });

  it("rejects a platform_admin carrying tenant scope", () => {
    expect(
      readAppClaims({
        app_metadata: { role: "platform_admin", org_id: ORG_A, branch_id: null },
      }),
    ).toBeNull();
  });

  it("rejects unknown and missing roles", () => {
    expect(
      readAppClaims({ app_metadata: { role: "admin", org_id: ORG_A, branch_id: null } }),
    ).toBeNull();
    expect(readAppClaims({ app_metadata: {} })).toBeNull();
    expect(readAppClaims({})).toBeNull();
    expect(readAppClaims(null)).toBeNull();
  });

  it("rejects non-uuid scope values", () => {
    expect(
      readAppClaims({
        app_metadata: { role: "cashier", org_id: "org-a", branch_id: BRANCH_1 },
      }),
    ).toBeNull();
  });

  it("reads authorization claims from app_metadata only — a forged user_metadata role is ignored", () => {
    const forged = {
      user_metadata: { role: "platform_admin", org_id: null, branch_id: null },
      app_metadata: { role: "cashier", org_id: ORG_A, branch_id: BRANCH_1 },
    };
    expect(claimsFromUser(forged)).toEqual({
      role: "cashier",
      org_id: ORG_A,
      branch_id: BRANCH_1,
    });
  });

  it("claimsFromUser and claimsFromSession read the same app_metadata shape", () => {
    const user = { app_metadata: { role: "org_admin", org_id: ORG_A, branch_id: null } };
    expect(claimsFromUser(user)).toEqual(claimsFromSession({ user }));
    expect(claimsFromSession(null)).toBeNull();
    expect(claimsFromSession({})).toBeNull();
  });

  it("parseAppClaims throws on invalid input while readAppClaims returns null", () => {
    expect(() => parseAppClaims({ app_metadata: { role: "nope" } })).toThrow();
    expect(readAppClaims({ app_metadata: { role: "nope" } })).toBeNull();
  });
});
