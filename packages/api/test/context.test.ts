import { describe, expect, it, vi } from "vitest";
import { createTrpcContext } from "../src/context";

/**
 * The context factory's decision table. The network-backed verification
 * path (a real token against the real Auth server) is exercised by the
 * live contract tests; here the supabase-js module is stubbed so the
 * factory's logic — verified claims produce a caller and an as-caller data
 * client; anything unverifiable produces the anonymous context — is pinned
 * deterministically.
 */
vi.mock("@supabase/supabase-js", () => {
  return {
    createClient: vi.fn((_url: string, _key: string, opts?: Record<string, unknown>) => {
      const state = (globalThis as Record<string, unknown>).__silidMockAuthState as {
        result: { data: unknown; error: unknown };
      };
      const created = (globalThis as Record<string, unknown>).__silidMockClients as Array<Record<string, unknown>>;
      created.push({ opts });
      return {
        auth: { getClaims: vi.fn(async () => state.result) },
        __opts: opts,
      };
    }),
  };
});

type MockState = { result: { data: unknown; error: unknown } };

function setMockState(state: MockState) {
  (globalThis as Record<string, unknown>).__silidMockAuthState = state;
  (globalThis as Record<string, unknown>).__silidMockClients = [];
}

function createdClients(): Array<Record<string, unknown>> {
  return (globalThis as Record<string, unknown>).__silidMockClients as Array<Record<string, unknown>>;
}

const URL = "https://example.supabase.co";
const KEY = "publishable-key";
const TOKEN = "bearer-token";
const USER = "34000000-0000-4000-8000-000000000001";
const ORG = "14000000-0000-4000-8000-000000000001";
const BRANCH = "24000000-0000-4000-8000-000000000001";

const validPayload = {
  sub: USER,
  app_metadata: { role: "cashier", org_id: ORG, branch_id: BRANCH },
};

describe("createTrpcContext", () => {
  it("an absent or empty access token yields the anonymous context", async () => {
    expect(await createTrpcContext({ supabaseUrl: URL, publishableKey: KEY, accessToken: null })).toEqual({
      caller: null,
      data: null,
    });
    expect(await createTrpcContext({ supabaseUrl: URL, publishableKey: KEY, accessToken: "" })).toEqual({
      caller: null,
      data: null,
    });
  });

  it("a verified token yields the caller's claims and an as-caller data client", async () => {
    setMockState({ result: { data: { claims: validPayload }, error: null } });
    const ctx = await createTrpcContext({ supabaseUrl: URL, publishableKey: KEY, accessToken: TOKEN });
    expect(ctx.caller).toEqual({
      userId: USER,
      claims: { role: "cashier", org_id: ORG, branch_id: BRANCH },
    });
    expect(ctx.data).not.toBeNull();
    // two clients were created: the verification client (no session, no
    // caller credentials) and the as-caller client (the caller's JWT as
    // the Bearer credential, so RLS governs every query)
    expect(createdClients()).toHaveLength(2);
    expect(createdClients()[0]).toMatchObject({
      opts: { auth: { persistSession: false, autoRefreshToken: false } },
    });
    expect(createdClients()[1]).toMatchObject({
      opts: {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${TOKEN}` } },
      },
    });
  });

  it("an error together with a payload still yields the anonymous context (fail closed)", async () => {
    setMockState({
      result: { data: { claims: validPayload }, error: { message: "signature check failed" } },
    });
    expect(await createTrpcContext({ supabaseUrl: URL, publishableKey: KEY, accessToken: TOKEN })).toEqual({
      caller: null,
      data: null,
    });
  });

  it("a token that fails verification yields the anonymous context", async () => {
    setMockState({ result: { data: null, error: { message: "invalid claim: session missing" } } });
    expect(await createTrpcContext({ supabaseUrl: URL, publishableKey: KEY, accessToken: TOKEN })).toEqual({
      caller: null,
      data: null,
    });
  });

  it("a verified token without spec-shaped app_metadata yields the anonymous context", async () => {
    setMockState({ result: { data: { claims: { sub: USER, app_metadata: { role: "super_admin" } } }, error: null } });
    expect(await createTrpcContext({ supabaseUrl: URL, publishableKey: KEY, accessToken: TOKEN })).toEqual({
      caller: null,
      data: null,
    });
  });

  it("a verified token with no sub claim yields the anonymous context", async () => {
    setMockState({ result: { data: { claims: { app_metadata: { role: "cashier", org_id: ORG, branch_id: BRANCH } } }, error: null } });
    const ctx = await createTrpcContext({ supabaseUrl: URL, publishableKey: KEY, accessToken: TOKEN });
    expect(ctx.caller).toBeNull();
  });
});
