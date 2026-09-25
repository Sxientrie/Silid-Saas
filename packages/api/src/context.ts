/**
 * The tRPC context (Layer 1 wiring). The host application resolves the
 * caller's access token from its session and passes it here; the context
 * factory VERIFIES the token server-side (supabase.auth.getClaims — the
 * JWT-signature-validated path; getSession() is not safe for server
 * guarding, per the Phase 03 research record) and derives the caller's
 * scope claims through @silid/auth's app_metadata readers. The data client
 * runs as the caller, so Row-Level Security governs every query.
 */
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { readAppClaims, type AppClaims } from "@silid/auth";
import { createSilidDataClient, type SilidDataClient } from "./data-client";

export interface Caller {
  /** The Supabase Auth user id, from the VERIFIED token's `sub` claim. */
  userId: string;
  /** The app_metadata claim shape (role, org_id, branch_id). */
  claims: AppClaims;
}

export interface TrpcContext {
  /** Null when the request carries no verified session. */
  caller: Caller | null;
  /** Null alongside a null caller; otherwise the as-caller data port. */
  data: SilidDataClient | null;
}

export interface CreateTrpcContextOptions {
  supabaseUrl: string;
  publishableKey: string;
  /** The caller's Supabase access token, resolved by the host app. */
  accessToken: string | null;
}

export async function createTrpcContext(options: CreateTrpcContextOptions): Promise<TrpcContext> {
  const anonymous: TrpcContext = { caller: null, data: null };
  if (options.accessToken === null || options.accessToken === "") {
    return anonymous;
  }

  const authClient = createSupabaseClient(options.supabaseUrl, options.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await authClient.auth.getClaims(options.accessToken);
  if (error !== null || data === null) {
    return anonymous;
  }
  const claims = readAppClaims(data.claims);
  if (claims === null) {
    return anonymous;
  }
  const sub = (data.claims as Record<string, unknown>).sub;
  if (typeof sub !== "string") {
    return anonymous;
  }

  const asCaller = createSupabaseClient(options.supabaseUrl, options.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${options.accessToken}` } },
  });

  return {
    caller: { userId: sub, claims },
    data: createSilidDataClient(asCaller),
  };
}
