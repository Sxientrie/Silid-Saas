// /Silid/packages/auth/test/attack.provisionStaffEdge.test.ts
// PHASE 03 ATTACK BATTERY — black-box attacks on the deployed
// `provision-staff` Edge Function (the only server provisioning path).
// Attacks acceptance inputs 4, 6 and 8 plus the recorded surface
// "role-guard bypass on provisioning": anonymous calls, non-staff
// callers, cashier callers, cross-organization provisioning attempts,
// self-promotion to platform_admin, and malformed claim shapes on the
// provisioned identities. Runs against the LIVE linked project; skips
// with a logged reason when credentials are absent.

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
const ORG_A = randomUUID();
const ORG_B = randomUUID();
const BR_A1 = randomUUID();
const BR_B1 = randomUUID();

let admin: ReturnType<typeof adminClient> | null = null;
const residue = new Residue();

const adminA = {
  email: `attack-edge-adm-a-${run}@attack.invalid`,
  password: `attack-${run}-a-pw`,
  id: '',
  token: '',
};
const cashA1 = {
  email: `attack-edge-csh-a1-${run}@attack.invalid`,
  password: `attack-${run}-c-pw`,
  id: '',
  token: '',
};
const attacker = {
  email: `attack-edge-attacker-${run}@attack.invalid`,
  password: `attack-${run}-x-pw`,
  id: '',
  token: '',
};
const operator = { token: '' };

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

describeLive('attack: provision-staff edge function (claims 4, 6, 8)', missing, () => {
  beforeAll(async () => {
    const e = env as AttackEnv;
    admin = adminClient(e);

    for (const org of [ORG_A, ORG_B]) {
      const { error } = await admin
        .schema('public')
        .from('organizations')
        .insert({ id: org, name: `ATTACK-EDGE-${org.slice(-4).toUpperCase()}-${run}` });
      if (error) throw new Error(`org fixture failed: ${error.message}`);
      residue.trackOrg(org);
    }
    const { error: brError } = await admin
      .schema('public')
      .from('branches')
      .insert({ id: BR_A1, org_id: ORG_A, name: 'ATTACK-EDGE-BR-A1' });
    if (brError) throw new Error(`branch fixture failed: ${brError.message}`);
    residue.trackBranch(BR_A1);
    const { error: br2Error } = await admin
      .schema('public')
      .from('branches')
      .insert({ id: BR_B1, org_id: ORG_B, name: 'ATTACK-EDGE-BR-B1' });
    if (br2Error) throw new Error(`branch fixture (B) failed: ${br2Error.message}`);
    residue.trackBranch(BR_B1);

    const a = await provisionStaffFixture(admin, residue, {
      email: adminA.email, password: adminA.password, displayName: 'Attack Admin A',
      role: 'org_admin', orgId: ORG_A,
    });
    adminA.id = a.userId;
    const c = await provisionStaffFixture(admin, residue, {
      email: cashA1.email, password: cashA1.password, displayName: 'Attack Cashier A1',
      role: 'cashier', orgId: ORG_A, branchId: BR_A1,
    });
    cashA1.id = c.userId;

    for (const who of [adminA, cashA1]) {
      const res = await signIn(e, who.email, who.password);
      if (res.status !== 200) throw new Error(`sign-in fixture failed for ${who.email}`);
      who.token = String(res.json.access_token);
    }

    // a plain client identity with NO staff row anywhere (trusted fixture
    // path — the project rate-limits confirmation emails on self-signup;
    // every claim-write attack still goes through the real client paths)
    const { data: attackerCreated, error: attackerError } = await admin.auth.admin.createUser({
      email: attacker.email,
      password: attacker.password,
      email_confirm: true,
    });
    if (attackerError || !attackerCreated.user) throw new Error(`attacker fixture failed: ${attackerError?.message ?? 'no user'}`);
    attacker.id = attackerCreated.user.id;
    const signin = await signIn(e, attacker.email, attacker.password);
    expect(signin.status).toBe(200);
    attacker.token = String(signin.json.access_token);
    residue.trackUser(attacker.id, attacker.email);

    if (e.operatorEmail && e.operatorPassword) {
      const op = await signIn(e, e.operatorEmail, e.operatorPassword);
      operator.token = op.status === 200 ? String(op.json.access_token) : '';
    }
  }, 180_000);

  afterAll(async () => {
    const e = env as AttackEnv | null;
    if (!e || !admin) return;
    const swept = await sweepVictims();
    if (swept.length > 0) console.warn(`[attack.provisionStaffEdge] swept function-provisioned victims: ${swept.join(', ')}`);
    const { leftovers, auditTargetIds } = await residue.cleanup(admin);
    const total = Object.values(leftovers).reduce((a, b) => a + b, 0);
    if (total > 0) console.warn(`[attack.provisionStaffEdge] CLEANUP LEFTOVERS: ${JSON.stringify(leftovers)}`);
    else console.log('[attack.provisionStaffEdge] cleanup verified: zero residue (audit rows, if any, swept via CLI)');
    if (auditTargetIds.length > 0) {
      console.log(`[attack.provisionStaffEdge] audit target ids for CLI sweep: ${auditTargetIds.join(', ')}`);
    }
  }, 180_000);

  it('attack: the function refuses calls with no credential, a bare apikey, and a garbage bearer', async () => {
    const e = env as AttackEnv;
    const none = await edgeFunction(e, 'provision-staff', { token: null, withApikey: false, body: {} });
    expect(none.status).toBe(401);

    const bareKey = await edgeFunction(e, 'provision-staff', { token: null, body: {} });
    expect(bareKey.status).toBe(401);

    const garbage = await edgeFunction(e, 'provision-staff', { bearerKey: 'garbage.token.here', body: {} });
    expect(garbage.status).toBe(401);
  }, 60_000);

  it('attack: an authenticated user with NO staff row cannot provision anyone', async () => {
    const e = env as AttackEnv;
    const victim = `attack-edge-victim1-${run}@attack.invalid`;
    victimEmails.push(victim);
    const res = await edgeFunction(e, 'provision-staff', {
      token: attacker.token,
      body: { email: victim, password: `victim-${run}-pw`, display_name: 'Victim 1', role: 'cashier', org_id: ORG_A },
    });
    console.log(`[attack] provision-staff as no-staff-row user -> ${res.status} ${res.text.slice(0, 160)}`);
    expect(res.status).toBe(403);
    expect(await findUserByEmail(victim)).toBeNull();
  }, 60_000);

  it('attack: a cashier cannot provision anyone (role guard below org tier)', async () => {
    const e = env as AttackEnv;
    const victim = `attack-edge-victim2-${run}@attack.invalid`;
    victimEmails.push(victim);
    const res = await edgeFunction(e, 'provision-staff', {
      token: cashA1.token,
      body: { email: victim, password: `victim-${run}-pw`, display_name: 'Victim 2', role: 'cashier', org_id: ORG_A },
    });
    console.log(`[attack] provision-staff as cashier -> ${res.status} ${res.text.slice(0, 160)}`);
    expect(res.status).toBe(403);
    expect(await findUserByEmail(victim)).toBeNull();
  }, 60_000);

  it('attack: an org_admin cannot provision into ANOTHER organization (cross-tenant provisioning refused)', async () => {
    const e = env as AttackEnv;
    const victim = `attack-edge-victim3-${run}@attack.invalid`;
    victimEmails.push(victim);
    const res = await edgeFunction(e, 'provision-staff', {
      token: adminA.token,
      body: { email: victim, password: `victim-${run}-pw`, display_name: 'Victim 3', role: 'cashier', org_id: ORG_B },
    });
    console.log(`[attack] provision-staff org_admin A -> org B -> ${res.status} ${res.text.slice(0, 200)}`);
    expect(res.status).toBe(403);
    // nothing landed in org B (auth user or staff row)
    expect(await findUserByEmail(victim)).toBeNull();
    const { data: staffB } = await admin!.schema('public').from('staff').select('id').eq('org_id', ORG_B);
    expect(staffB ?? []).toEqual([]);
  }, 60_000);

  it('attack: an org_admin cannot provision a platform_admin role (self-promotion refused)', async () => {
    const e = env as AttackEnv;
    const victim = `attack-edge-victim4-${run}@attack.invalid`;
    victimEmails.push(victim);
    const res = await edgeFunction(e, 'provision-staff', {
      token: adminA.token,
      body: { email: victim, password: `victim-${run}-pw`, display_name: 'Victim 4', role: 'platform_admin', org_id: ORG_A },
    });
    console.log(`[attack] provision-staff role=platform_admin as org_admin -> ${res.status} ${res.text.slice(0, 160)}`);
    expect([400, 403]).toContain(res.status);
    expect(await findUserByEmail(victim)).toBeNull();
  }, 60_000);

  it('attack: the operator cannot provision into a nonexistent organization', async () => {
    const e = env as AttackEnv;
    if (!operator.token) {
      console.warn('[attack] operator credentials absent — skipping operator-path probes');
      return;
    }
    const victim = `attack-edge-victim5-${run}@attack.invalid`;
    victimEmails.push(victim);
    const res = await edgeFunction(e, 'provision-staff', {
      token: operator.token,
      body: {
        email: victim,
        password: `victim-${run}-pw`,
        display_name: 'Victim 5',
        role: 'org_admin',
        org_id: 'a77aaa99-0000-4000-8000-000000000099',
      },
    });
    console.log(`[attack] provision-staff operator -> nonexistent org -> ${res.status} ${res.text.slice(0, 160)}`);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await findUserByEmail(victim)).toBeNull();
  }, 60_000);

  it('attack: operator provisioning mints EXACT spec claim shape and returns nothing sensitive (claim 4 + DoD claim shape)', async () => {
    const e = env as AttackEnv;
    if (!operator.token) {
      console.warn('[attack] operator credentials absent — skipping operator happy-path probe');
      return;
    }
    const victim = `attack-edge-ok1-${run}@attack.invalid`;
    victimEmails.push(victim);
    const res = await edgeFunction(e, 'provision-staff', {
      token: operator.token,
      body: { email: victim, password: `ok-${run}-pw`, display_name: 'Edge Org Admin', role: 'org_admin', org_id: ORG_A },
    });
    console.log(`[attack] provision-staff operator -> own target org -> ${res.status} ${res.text.slice(0, 200)}`);
    expect(res.status).toBe(200);
    if (res.status !== 200) return;

    // the provisioned identity exists with exactly the spec claim shape
    const created = await findUserByEmail(victim);
    expect(created).not.toBeNull();
    if (!created) return;
    residue.trackUser(created.id, victim);

    const { data: userData } = await admin!.auth.admin.getUserById(created.id);
    const appMeta = (userData?.user?.app_metadata ?? {}) as Record<string, unknown>;
    expect(appMeta.role).toBe('org_admin');
    expect(appMeta.org_id).toBe(ORG_A);
    expect(appMeta.branch_id ?? null).toBeNull();

    // response leaks nothing sensitive
    const bodyText = res.text;
    expect(bodyText.toLowerCase()).not.toContain(`ok-${run}-pw`);
    expect(bodyText).not.toContain(e.serviceRoleKey);

    // sign-in works and the fresh JWT carries the same claims
    const signin = await signIn(e, victim, `ok-${run}-pw`);
    expect(signin.status).toBe(200);
    const claims = decodeJwtPayload(String(signin.json.access_token));
    const jwtAppMeta = (claims.app_metadata ?? {}) as Record<string, unknown>;
    expect(jwtAppMeta.role).toBe('org_admin');
    expect(jwtAppMeta.org_id).toBe(ORG_A);
  }, 90_000);

  it('attack: org_admin-provisioned own-org cashier (if supported) must still carry the exact cashier claim shape', async () => {
    const e = env as AttackEnv;
    const victim = `attack-edge-ok2-${run}@attack.invalid`;
    victimEmails.push(victim);
    const res = await edgeFunction(e, 'provision-staff', {
      token: adminA.token,
      body: { email: victim, password: `ok-${run}-pw`, display_name: 'Edge Cashier', role: 'cashier', org_id: ORG_A },
    });
    console.log(`[attack] provision-staff org_admin A -> own org cashier -> ${res.status} ${res.text.slice(0, 200)}`);
    if (res.status !== 200) {
      // refused cashier provisioning entirely — acceptable, record and move on
      expect(await findUserByEmail(victim)).toBeNull();
      return;
    }
    const created = await findUserByEmail(victim);
    expect(created).not.toBeNull();
    if (!created) return;
    residue.trackUser(created.id, victim);
    const { data: userData } = await admin!.auth.admin.getUserById(created.id);
    const appMeta = (userData?.user?.app_metadata ?? {}) as Record<string, unknown>;
    expect(appMeta.role).toBe('cashier');
    expect(appMeta.org_id).toBe(ORG_A);
    // a cashier ALWAYS carries a branch_id per spec/authentication.md §2
    expect(appMeta.branch_id).toBeTruthy();
    expect(appMeta.branch_id).not.toBeNull();
    if (typeof appMeta.branch_id === 'string') {
      const { data: branchRow } = await admin!.schema('public').from('branches').select('org_id').eq('id', appMeta.branch_id).single();
      expect(branchRow?.org_id).toBe(ORG_A);
    }
  }, 90_000);

  it('attack: an org_admin cannot smuggle a SIBLING-ORG branch_id into a cashier payload (tenant identifier from client refused)', async () => {
    const e = env as AttackEnv;
    const victim = `attack-edge-victim6-${run}@attack.invalid`;
    victimEmails.push(victim);
    // claims-consistent org, but the branch belongs to org B
    const res = await edgeFunction(e, 'provision-staff', {
      token: adminA.token,
      body: { email: victim, password: `victim-${run}-pw`, display_name: 'Victim 6', role: 'cashier', org_id: ORG_A, branch_id: BR_B1 },
    });
    console.log(`[attack] provision-staff cashier with cross-org branch_id -> ${res.status} ${res.text.slice(0, 200)}`);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await findUserByEmail(victim)).toBeNull();
    const { data: staffB } = await admin!.schema('public').from('staff').select('id').eq('org_id', ORG_B);
    expect(staffB ?? []).toEqual([]);
  }, 60_000);
});
