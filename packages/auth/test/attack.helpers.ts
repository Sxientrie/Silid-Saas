// /Silid/packages/auth/test/attack.helpers.ts
// Shared machinery for the Phase 03 attack battery (files named attack.*).
// Loads credentials from the gitignored /Silid/.env.local WITHOUT printing
// secret values, exposes thin PostgREST / GoTrue / admin-API helpers, and
// tracks every created fixture so cleanup can verify zero residue.
//
// These tests exist to make the Phase 03 claims FAIL. They run against the
// LIVE linked project; if required credentials are absent they skip with a
// logged reason rather than passing vacuously.
//
// RESIDUE DISCIPLINE: every fixture is tracked and deleted afterAll, and
// every fixture name/email carries the ATTACK- / attack- prefixes that only
// this battery uses. audit_log is append-only for the service role as well
// (by design), so rows this battery caused there (client-path appends, the
// deactivation RPC, function provisioning) are swept afterwards by running
// the following sweep as the CLI's postgres role:
//
//   delete from public.audit_log where target_id in (select id from public.staff where email like 'attack-%');
//   delete from public.audit_log where actor_id in (select id from auth.users where email like 'attack-%');
//   delete from public.audit_log where org_id in (select id from public.organizations where name like 'ATTACK-%');
//   delete from public.audit_log where action like 'attack_%';
//   delete from public.staff where email like 'attack-%';
//   delete from public.branches where name like 'ATTACK-%';
//   delete from public.organizations where name like 'ATTACK-%';
//   delete from auth.users where email like 'attack-%';
//
// Second stage: the provisioning function writes provision_staff audit rows
// whose actor is the real operator and whose target is a (now deleted)
// battery user — those survive the pattern sweep. Each suite therefore logs
// its "audit target ids for CLI sweep" after cleanup; delete
// public.audit_log rows whose target_id appears in those logs.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, type SuiteFactory } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface AttackEnv {
  url: string;
  publishableKey: string;
  serviceRoleKey: string;
  operatorEmail?: string;
  operatorPassword?: string;
}

function parseDotEnv(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export function loadAttackEnv(): { env: AttackEnv | null; missing: string[] } {
  const vars: Record<string, string> = { ...process.env };
  for (const rel of ['.env.local', '../../.env.local', '../../../.env.local']) {
    try {
      Object.assign(vars, parseDotEnv(readFileSync(resolve(process.cwd(), rel), 'utf8')));
    } catch {
      // candidate location absent; keep going
    }
  }
  const url = vars.NEXT_PUBLIC_SUPABASE_URL ?? vars.SUPABASE_URL;
  const publishableKey = vars.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = vars.SUPABASE_SERVICE_ROLE_KEY;
  const missing: string[] = [];
  if (!url) missing.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!publishableKey) missing.push('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  if (!serviceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (missing.length > 0) return { env: null, missing };
  return {
    env: {
      url: url!.replace(/\/$/, ''),
      publishableKey: publishableKey!,
      serviceRoleKey: serviceRoleKey!,
      operatorEmail: vars.SILID_OPERATOR_EMAIL,
      operatorPassword: vars.SILID_OPERATOR_PASSWORD,
    },
    missing,
  };
}

/** Skippable describe: logs the missing-credential reason and skips. */
export function describeLive(
  name: string,
  missing: string[],
  body: SuiteFactory,
): void {
  if (missing.length > 0) {
    console.warn(`[attack battery] SKIPPING "${name}": missing credentials ${missing.join(', ')} in environment / .env.local`);
    describe.skip(name, body);
    return;
  }
  describe(name, body);
}

// ---------------------------------------------------------------------------
// clients and raw HTTP
// ---------------------------------------------------------------------------

export function anonClient(env: AttackEnv): SupabaseClient {
  return createClient(env.url, env.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function adminClient(env: AttackEnv): SupabaseClient {
  return createClient(env.url, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface RestResult {
  status: number;
  json: unknown;
  text: string;
}

export async function rest(
  env: AttackEnv,
  token: string | null,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<RestResult> {
  const headers: Record<string, string> = {
    apikey: env.publishableKey,
    'Content-Type': 'application/json',
  };
  if (token !== null) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${env.url}/rest/v1/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json, text };
}

export async function authApi(
  env: AttackEnv,
  method: 'GET' | 'POST' | 'PUT',
  path: string,
  opts: { token?: string | null; body?: unknown; bearerKey?: string } = {},
): Promise<RestResult> {
  const headers: Record<string, string> = {
    apikey: env.publishableKey,
    'Content-Type': 'application/json',
  };
  if (opts.bearerKey !== undefined) headers.Authorization = `Bearer ${opts.bearerKey}`;
  else if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const res = await fetch(`${env.url}/auth/v1/${path}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json, text };
}

export async function edgeFunction(
  env: AttackEnv,
  slug: string,
  opts: { token?: string | null; body?: unknown; bearerKey?: string; withApikey?: boolean } = {},
): Promise<RestResult> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.withApikey !== false) headers.apikey = env.publishableKey;
  if (opts.bearerKey !== undefined) headers.Authorization = `Bearer ${opts.bearerKey}`;
  else if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const res = await fetch(`${env.url}/functions/v1/${slug}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(opts.body ?? {}),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json, text };
}

export async function signIn(
  env: AttackEnv,
  email: string,
  password: string,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await authApi(env, 'POST', 'token?grant_type=password', {
    body: { email, password },
  });
  return {
    status: res.status,
    json: (res.json && typeof res.json === 'object' ? (res.json as Record<string, unknown>) : {}),
  };
}

// ---------------------------------------------------------------------------
// JWT decode (no verification needed — the server signed it; we only read it)
// ---------------------------------------------------------------------------

export function decodeJwtPayload(token: string): Record<string, unknown> {
  const part = token.split('.')[1];
  const json = Buffer.from(part, 'base64url').toString('utf8');
  return JSON.parse(json) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// fixtures and residue tracking
// ---------------------------------------------------------------------------

export function runId(): string {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export class Residue {
  private userIds: string[] = [];
  private auditIds: string[] = [];
  private staffIds: string[] = [];
  private branchIds: string[] = [];
  private orgIds: string[] = [];
  private emails: string[] = [];

  trackUser(id: string, email?: string): void {
    if (id) this.userIds.push(id);
    if (email) this.emails.push(email);
  }

  trackAudit(id: string): void {
    if (id) this.auditIds.push(id);
  }

  trackStaff(id: string): void {
    if (id) this.staffIds.push(id);
  }

  trackBranch(id: string): void {
    if (id) this.branchIds.push(id);
  }

  trackOrg(id: string): void {
    if (id) this.orgIds.push(id);
  }

  get auditIdsAll(): string[] {
    return [...this.auditIds];
  }

  /** Deletes everything tracked, deepest-first. Audit rows are NOT deleted
   *  here (service_role deliberately has no DELETE/SELECT on audit_log):
   *  their ids are returned for the CLI sweep so the caller can prove the
   *  final residue count is zero. Returns counts of rows LEFT BEHIND per
   *  kind (0 = fully cleaned). */
  async cleanup(admin: SupabaseClient): Promise<{ leftovers: Record<string, number>; auditTargetIds: string[] }> {
    const leftovers: Record<string, number> = {};

    if (this.staffIds.length > 0) {
      await admin.schema('public').from('staff').delete().in('id', this.staffIds);
      const { data } = await admin.schema('public').from('staff').select('id').in('id', this.staffIds);
      if (data && data.length > 0) leftovers.staff = data.length;
    }
    if (this.branchIds.length > 0) {
      await admin.schema('public').from('branches').delete().in('id', this.branchIds);
      const { data } = await admin.schema('public').from('branches').select('id').in('id', this.branchIds);
      if (data && data.length > 0) leftovers.branches = data.length;
    }
    if (this.orgIds.length > 0) {
      await admin.schema('public').from('organizations').delete().in('id', this.orgIds);
      const { data } = await admin.schema('public').from('organizations').select('id').in('id', this.orgIds);
      if (data && data.length > 0) leftovers.organizations = data.length;
    }
    for (const uid of this.userIds) {
      const { error } = await admin.auth.admin.deleteUser(uid);
      // tolerate a user another cleanup step already removed
      if (error && !/does not exist|not found/i.test(error.message)) {
        leftovers.auth_users = (leftovers.auth_users ?? 0) + 1;
      }
    }

    // rows this run may have caused in audit_log (append-only table; the
    // deactivation RPC and any client-path appends write here)
    const auditTargetIds = [...this.userIds, ...this.auditIds];
    return { leftovers, auditTargetIds };
  }
}

/** Creates an auth user with app_metadata claims (trusted server path) plus
 *  its public.staff row, and tracks both for cleanup. */
export async function provisionStaffFixture(
  admin: SupabaseClient,
  residue: Residue,
  opts: {
    email: string;
    password: string;
    displayName: string;
    role: 'org_admin' | 'cashier';
    orgId: string;
    branchId?: string | null;
  },
): Promise<{ userId: string }> {
  const { data, error } = await admin.auth.admin.createUser({
    email: opts.email,
    password: opts.password,
    email_confirm: true,
    app_metadata: {
      role: opts.role,
      org_id: opts.orgId,
      ...(opts.branchId ? { branch_id: opts.branchId } : {}),
    },
  });
  if (error || !data.user) {
    throw new Error(`fixture provisioning failed for ${opts.email}: ${error?.message ?? 'no user'}`);
  }
  const userId = data.user.id;
  residue.trackUser(userId, opts.email);
  const { error: staffError } = await admin.schema('public').from('staff').insert({
    id: userId,
    org_id: opts.orgId,
    branch_id: opts.branchId ?? null,
    email: opts.email,
    role: opts.role,
    display_name: opts.displayName,
  });
  if (staffError) throw new Error(`fixture staff row failed: ${staffError.message}`);
  residue.trackStaff(userId);
  return { userId };
}
