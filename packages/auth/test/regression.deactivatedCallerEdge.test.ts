// /Silid/packages/auth/test/regression.deactivatedCallerEdge.test.ts
// PHASE 03 CORRECTIVE PASS 2 — regression for review finding M1: a
// deactivated org_admin must not retain provisioning power through the
// deployed `provision-staff` Edge Function. The function authorizes from
// the caller's current auth record and writes with the elevated
// credentials, so the database's claims↔profile binding
// (app.claims_match_profile) never applied on this path; the guard now
// required here mirrors that binding. Two attack variants: the
// still-unexpired pre-deactivation token (refused by the auth server's
// session check today — 401 — and by the function's own guard otherwise)
// and the fresh sign-in after deactivation whose claims are still
// org_admin (only the function's own guard can refuse this one — 403).
//
// Fixtures are provisioned through the trusted admin API
// (attack.helpers patterns); deactivation goes through the sanctioned
// path (a platform operator calling the public deactivate_staff RPC).
// Runs against the LIVE linked project and the DEPLOYED function; skips
// with a logged reason when credentials are absent. Every fixture is
// Residue-tracked; audit rows land in the documented CLI sweep (the
// run logs its audit target ids).

import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  adminClient,
  anonClient,
  decodeJwtPayload,
  describeLive,
  edgeFunction,
  loadAttackEnv,
  provisionStaffFixture,
  Residue,
  runId,
  signIn,
  type AttackEnv,
} from './attack.helpers';

const { env, missing } = loadAttackEnv();
const run = runId();

// Run-scoped fixture ids: unique per run, so a rerun never collides with
// rows a previous run could not delete (audit_log is append-only for the
// service role too). Names keep the ATTACK- prefix the CLI sweep targets.
const ORG_L = randomUUID();
const BR_L1 = randomUUID();

let admin: ReturnType<typeof adminClient> | null = null;
const residue = new Residue();

const adminLive = {
  email: `attack-liveness-adm-live-${run}@attack.invalid`,
  password: `attack-${run}-live-pw`,
  id: '',
  token: '',
};
const adminDead = {
  email: `attack-liveness-adm-dead-${run}@attack.invalid`,
  password: `attack-${run}-dead-pw`,
  id: '',
  token: '',
};
// a trusted-fixture identity whose app_metadata claims VIOLATE the
// platform claim shape (role platform_admin with org scope set). No
// staff row — the platform tier requires none (spec/data-model.md §1).
const malformedPlatform = {
  email: `attack-liveness-badshape-${run}@attack.invalid`,
  password: `attack-${run}-shape-pw`,
  id: '',
  token: '',
};

// every email the function might have provisioned during the probes
const victimEmails: string[] = [];

async function findUserByEmail(email: string): Promise<{ id: string } | null> {
  if (!admin) return null;
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 500 });
  if (error) return null;
  const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  return hit ? { id: hit.id } : null;
}

async function sweepVictims(): Promise<string[]> {
  const deleted: string[] = [];
  for (const email of victimEmails) {
    const hit = await findUserByEmail(email);
    if (hit && admin) {
      // audit rows referencing this id are append-only for the service role
      // too — the CLI sweep handles them; delete the mutable fixture rows
      await admin.schema('public').from('staff').delete().eq('email', email);
      await admin.auth.admin.deleteUser(hit.id);
      deleted.push(email);
    }
  }
  return deleted;
}

describeLive('regression: deactivated caller cannot invoke provision-staff (finding M1)', missing, () => {
  beforeAll(async () => {
    const e = env as AttackEnv;
    admin = adminClient(e);

    const { error: orgError } = await admin
      .schema('public')
      .from('organizations')
      .insert({ id: ORG_L, name: `ATTACK-LIVENESS-${ORG_L.slice(-4).toUpperCase()}-${run}` });
    if (orgError) throw new Error(`org fixture failed: ${orgError.message}`);
    residue.trackOrg(ORG_L);
    const { error: brError } = await admin
      .schema('public')
      .from('branches')
      .insert({ id: BR_L1, org_id: ORG_L, name: 'ATTACK-LIVENESS-BR-L1' });
    if (brError) throw new Error(`branch fixture failed: ${brError.message}`);
    residue.trackBranch(BR_L1);

    // two org_admins in the same org through the trusted admin API
    const live = await provisionStaffFixture(admin, residue, {
      email: adminLive.email, password: adminLive.password, displayName: 'Liveness Admin Live',
      role: 'org_admin', orgId: ORG_L,
    });
    adminLive.id = live.userId;
    const dead = await provisionStaffFixture(admin, residue, {
      email: adminDead.email, password: adminDead.password, displayName: 'Liveness Admin Dead',
      role: 'org_admin', orgId: ORG_L,
    });
    adminDead.id = dead.userId;

    // both sign in BEFORE the deactivation — adminDead's access token must
    // remain UNEXPIRED and unused past the deactivation (the finding's
    // exact scenario: token still in hand)
    for (const who of [adminLive, adminDead]) {
      const res = await signIn(e, who.email, who.password);
      if (res.status !== 200) throw new Error(`sign-in fixture failed for ${who.email}`);
      who.token = String(res.json.access_token);
    }

    // the malformed platform-shape caller (trusted fixture path; the
    // claims under test are written server-side exactly like any
    // provisioning path writes them)
    const { data: badCreated, error: badError } = await admin.auth.admin.createUser({
      email: malformedPlatform.email,
      password: malformedPlatform.password,
      email_confirm: true,
      app_metadata: { role: 'platform_admin', org_id: ORG_L, branch_id: null },
    });
    if (badError || !badCreated.user) throw new Error(`malformed-platform fixture failed: ${badError?.message ?? 'no user'}`);
    malformedPlatform.id = badCreated.user.id;
    residue.trackUser(malformedPlatform.id, malformedPlatform.email);
    const badSignin = await signIn(e, malformedPlatform.email, malformedPlatform.password);
    expect(badSignin.status).toBe(200);
    malformedPlatform.token = String(badSignin.json.access_token);

    // DEACTIVATION through the sanctioned path: the platform operator
    // calls the public deactivate_staff RPC (app.deactivate_staff —
    // revokes sessions first, flips the profile inactive, writes the
    // audit row). The access token issued above stays valid until
    // expiry — exactly the window the guard must close.
    const operator = anonClient(e);
    const opSignin = await operator.auth.signInWithPassword({
      email: e.operatorEmail ?? '',
      password: e.operatorPassword ?? '',
    });
    if (opSignin.error) throw new Error(`operator sign-in failed: ${opSignin.error.message}`);
    const rpc = await operator.rpc('deactivate_staff', { p_target_user_id: adminDead.id });
    if (rpc.error) throw new Error(`sanctioned deactivation failed: ${rpc.error.message}`);
  }, 180_000);

  afterAll(async () => {
    const e = env as AttackEnv | null;
    if (!e || !admin) return;
    const swept = await sweepVictims();
    if (swept.length > 0) console.warn(`[regression.deactivatedCallerEdge] swept function-provisioned victims: ${swept.join(', ')}`);
    const { leftovers, auditTargetIds } = await residue.cleanup(admin);
    const total = Object.values(leftovers).reduce((a, b) => a + b, 0);
    if (total > 0) console.warn(`[regression.deactivatedCallerEdge] CLEANUP LEFTOVERS: ${JSON.stringify(leftovers)}`);
    else console.log('[regression.deactivatedCallerEdge] cleanup verified: zero residue (audit rows, if any, swept via CLI)');
    if (auditTargetIds.length > 0) {
      console.log(`[regression.deactivatedCallerEdge] audit target ids for CLI sweep: ${auditTargetIds.join(', ')}`);
    }
  }, 180_000);

  it('attack (finding M1): a DEACTIVATED org_admin with the still-unexpired pre-deactivation token cannot provision through the deployed function', async () => {
    const e = env as AttackEnv;
    const victim = `attack-liveness-victim1-${run}@attack.invalid`;
    victimEmails.push(victim);
    // a fully valid request INSIDE the deactivated caller's own org —
    // the exact call the pre-guard authorization logic would execute
    const res = await edgeFunction(e, 'provision-staff', {
      token: adminDead.token,
      body: { email: victim, password: `victim-${run}-pw`, display_name: 'Deactivated Caller Victim', role: 'cashier', org_id: ORG_L, branch_id: BR_L1 },
    });
    console.log(`[regression] provision-staff as DEACTIVATED org_admin (stale token) -> ${res.status} ${res.text.slice(0, 160)}`);
    // The invariant: the deactivated caller is refused and provisions
    // nothing. Verified live behavior (probe, 2026-09-25): the auth
    // server's /user endpoint rejects the revoked-session token itself
    // ("Auth session missing!"), so the deployed function answers 401
    // before its own guard is reached; if the auth server ever stops
    // session-checking, the function's OWN liveness guard answers 403.
    // Both are refusals; neither may provision.
    expect([401, 403]).toContain(res.status);
    // nothing landed: no auth user, no staff row
    expect(await findUserByEmail(victim)).toBeNull();
    const { data: victimStaff } = await admin!.schema('public').from('staff').select('id').eq('email', victim);
    expect(victimStaff ?? []).toEqual([]);
  }, 90_000);

  it('attack (finding M1): a DEACTIVATED org_admin who signs in again — fresh valid token, stale org_admin claims — cannot provision (the caller-liveness guard)', async () => {
    const e = env as AttackEnv;
    const victim = `attack-liveness-victim3-${run}@attack.invalid`;
    victimEmails.push(victim);
    // Deactivation revokes sessions but never syncs app_metadata: the
    // current auth record still says role=org_admin / org=ORG_L, so a
    // fresh sign-in yields a perfectly VALID token whose caller passes
    // JWT validation and role resolution. The ONLY thing that can refuse
    // this caller is the staff-profile liveness guard (the function
    // writes with the elevated credentials, so the database's
    // claims↔profile binding never applies on this path).
    const resignin = await signIn(e, adminDead.email, adminDead.password);
    expect(resignin.status).toBe(200);
    const freshToken = String(resignin.json.access_token);
    const claims = decodeJwtPayload(freshToken);
    const appMeta = (claims.app_metadata ?? {}) as Record<string, unknown>;
    expect(appMeta.role).toBe('org_admin'); // the stale claim the guard must not trust alone
    expect(appMeta.org_id).toBe(ORG_L);

    const res = await edgeFunction(e, 'provision-staff', {
      token: freshToken,
      body: { email: victim, password: `victim-${run}-pw`, display_name: 'Resigned Deactivated Victim', role: 'cashier', org_id: ORG_L, branch_id: BR_L1 },
    });
    console.log(`[regression] provision-staff as DEACTIVATED org_admin (fresh token) -> ${res.status} ${res.text.slice(0, 160)}`);
    expect(res.status).toBe(403);
    expect(await findUserByEmail(victim)).toBeNull();
    const { data: victimStaff } = await admin!.schema('public').from('staff').select('id').eq('email', victim);
    expect(victimStaff ?? []).toEqual([]);
  }, 90_000);

  it('control: an ACTIVE org_admin still provisions its own-org cashier through the deployed function (the guard does not weaken the matrix)', async () => {
    const e = env as AttackEnv;
    const victim = `attack-liveness-ok1-${run}@attack.invalid`;
    victimEmails.push(victim);
    const res = await edgeFunction(e, 'provision-staff', {
      token: adminLive.token,
      body: { email: victim, password: `ok-${run}-pw`, display_name: 'Liveness Control Cashier', role: 'cashier', org_id: ORG_L, branch_id: BR_L1 },
    });
    console.log(`[regression] provision-staff as ACTIVE org_admin -> ${res.status} ${res.text.slice(0, 160)}`);
    expect(res.status).toBe(200);
    if (res.status !== 200) return;
    const created = await findUserByEmail(victim);
    expect(created).not.toBeNull();
    if (!created) return;
    residue.trackUser(created.id, victim);
    // response leaks nothing sensitive
    expect(res.text).not.toContain(`ok-${run}-pw`);
    expect(res.text).not.toContain(e.serviceRoleKey);
    // the provisioned cashier carries the exact §2 claim shape
    const signin = await signIn(e, victim, `ok-${run}-pw`);
    expect(signin.status).toBe(200);
    const claims = decodeJwtPayload(String(signin.json.access_token));
    const appMeta = (claims.app_metadata ?? {}) as Record<string, unknown>;
    expect(appMeta.role).toBe('cashier');
    expect(appMeta.org_id).toBe(ORG_L);
    expect(appMeta.branch_id).toBe(BR_L1);
  }, 90_000);

  it('attack (finding M1): a platform_admin caller whose claims violate the platform claim shape (org scope set) is refused', async () => {
    const e = env as AttackEnv;
    const victim = `attack-liveness-victim2-${run}@attack.invalid`;
    victimEmails.push(victim);
    // platform tier may only provision org_admins — with the claim shape
    // enforced, this caller must never get past caller liveness at all
    const res = await edgeFunction(e, 'provision-staff', {
      token: malformedPlatform.token,
      body: { email: victim, password: `victim-${run}-pw`, display_name: 'Bad Shape Victim', role: 'org_admin', org_id: ORG_L },
    });
    console.log(`[regression] provision-staff as malformed-shape platform caller -> ${res.status} ${res.text.slice(0, 160)}`);
    expect(res.status).toBe(403);
    expect(await findUserByEmail(victim)).toBeNull();
  }, 90_000);
});
