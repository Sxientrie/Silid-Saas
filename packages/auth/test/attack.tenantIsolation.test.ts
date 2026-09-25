// /Silid/packages/auth/test/attack.tenantIsolation.test.ts
// PHASE 03 ATTACK BATTERY — cross-organization reach and token survival
// through the CLIENT API path (PostgREST with user tokens). Attacks
// acceptance inputs 2, 3, 5 and 7: organization status is platform-managed,
// branch structure stays in-tenant, a provisioned org administrator sees
// and manages only their own organization through the database path, and
// deactivation ends access while a token is still in hand. Runs against
// the LIVE linked project; skips with a logged reason when credentials
// are absent.

import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  adminClient,
  anonClient,
  describeLive,
  loadAttackEnv,
  provisionStaffFixture,
  Residue,
  rest,
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
const BR_A2 = randomUUID();
const BR_B1 = randomUUID();
const AUDIT_A = randomUUID();
const AUDIT_B = randomUUID();

let admin: ReturnType<typeof adminClient> | null = null;
const residue = new Residue();

const adminA = {
  email: `attack-iso-adm-a-${run}@attack.invalid`,
  password: `attack-${run}-a-pw`,
  id: '',
  token: '',
};
const cashA1 = {
  email: `attack-iso-csh-a1-${run}@attack.invalid`,
  password: `attack-${run}-c-pw`,
  id: '',
  token: '',
  refreshToken: '',
};
const adminB = {
  email: `attack-iso-adm-b-${run}@attack.invalid`,
  password: `attack-${run}-b-pw`,
  id: '',
  token: '',
};

describeLive('attack: cross-organization reach and token survival (claims 2, 3, 5, 7)', missing, () => {
  beforeAll(async () => {
    const e = env as AttackEnv;
    admin = adminClient(e);

    // fixtures through the trusted path (they are NOT the claims under test)
    for (const org of [ORG_A, ORG_B]) {
      const { error } = await admin
        .schema('public')
        .from('organizations')
        .insert({ id: org, name: `ATTACK-ISO-${org.slice(-4).toUpperCase()}-${run}` });
      if (error) throw new Error(`org fixture failed: ${error.message}`);
      residue.trackOrg(org);
    }
    for (const [id, org] of [
      [BR_A1, ORG_A],
      [BR_A2, ORG_A],
      [BR_B1, ORG_B],
    ] as const) {
      const { error } = await admin
        .schema('public')
        .from('branches')
        .insert({ id, org_id: org, name: `ATTACK-ISO-BR-${id.slice(-4).toUpperCase()}` });
      if (error) throw new Error(`branch fixture failed: ${error.message}`);
      residue.trackBranch(id);
    }
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
    const b = await provisionStaffFixture(admin, residue, {
      email: adminB.email, password: adminB.password, displayName: 'Attack Admin B',
      role: 'org_admin', orgId: ORG_B,
    });
    adminB.id = b.userId;

    // sign in the three tenant identities
    for (const who of [adminA, cashA1, adminB]) {
      const res = await signIn(e, who.email, who.password);
      if (res.status !== 200) throw new Error(`sign-in fixture failed for ${who.email}: ${JSON.stringify(res.json).slice(0, 200)}`);
      who.token = String(res.json.access_token);
      if (who === cashA1) cashA1.refreshToken = String(res.json.refresh_token);
    }

    // audit rows seeded through the LEGITIMATE client path (each org admin
    // appends into its own org — the only append direction the policy allows;
    // the seal trigger rewrites actor/org from the caller's claims)
    const clientA = anonClient(e);
    const { error: authAError } = await clientA.auth.signInWithPassword({ email: adminA.email, password: adminA.password });
    if (authAError) throw new Error(`sign-in failed for audit append A: ${authAError.message}`);
    const { error: auditAError } = await clientA.schema('public').from('audit_log').insert({
      id: AUDIT_A, action: 'attack_fixture_a', target_table: 'staff', target_id: adminA.id,
    });
    if (auditAError) throw new Error(`audit append (org A) failed: ${auditAError.message}`);
    residue.trackAudit(AUDIT_A);

    const clientB = anonClient(e);
    const { error: authBError } = await clientB.auth.signInWithPassword({ email: adminB.email, password: adminB.password });
    if (authBError) throw new Error(`sign-in failed for audit append B: ${authBError.message}`);
    const { error: auditBError } = await clientB.schema('public').from('audit_log').insert({
      id: AUDIT_B, action: 'attack_fixture_b', target_table: 'staff', target_id: adminB.id,
    });
    if (auditBError) throw new Error(`audit append (org B) failed: ${auditBError.message}`);
    residue.trackAudit(AUDIT_B);
  }, 180_000);

  afterAll(async () => {
    const e = env as AttackEnv | null;
    if (!e || !admin) return;
    const { leftovers, auditTargetIds } = await residue.cleanup(admin);
    const total = Object.values(leftovers).reduce((a, b) => a + b, 0);
    if (total > 0) console.warn(`[attack.tenantIsolation] CLEANUP LEFTOVERS: ${JSON.stringify(leftovers)}`);
    else console.log('[attack.tenantIsolation] cleanup verified: zero residue (audit rows, if any, swept via CLI)');
    if (auditTargetIds.length > 0) {
      console.log(`[attack.tenantIsolation] audit target ids for CLI sweep: ${auditTargetIds.join(', ')}`);
    }
  }, 180_000);

  // --------------------------------------------------------- org A admin: reads
  it('attack: org_admin A sees exactly its own organization — org B invisible even by exact id', async () => {
    const e = env as AttackEnv;
    const all = await rest(e, adminA.token, 'GET', 'organizations?select=*');
    expect(all.status).toBe(200);
    expect(all.json).toHaveLength(1);
    expect((all.json as Array<Record<string, unknown>>)[0].id).toBe(ORG_A);

    const byId = await rest(e, adminA.token, 'GET', `organizations?id=eq.${ORG_B}&select=*`);
    expect(byId.json).toEqual([]);
  }, 60_000);

  it('attack: org_admin A sees both sibling branches of its own org but zero branches of org B', async () => {
    const e = env as AttackEnv;
    const all = await rest(e, adminA.token, 'GET', 'branches?select=id,org_id');
    expect(all.status).toBe(200);
    const ids = (all.json as Array<Record<string, unknown>>).map((r) => r.id).sort();
    expect(ids).toEqual([BR_A1, BR_A2].sort());
  }, 60_000);

  it('attack: org_admin A reads zero staff rows of org B, even by exact id', async () => {
    const e = env as AttackEnv;
    const all = await rest(e, adminA.token, 'GET', 'staff?select=id,org_id');
    expect(all.status).toBe(200);
    const orgs = new Set((all.json as Array<Record<string, unknown>>).map((r) => r.org_id));
    expect(orgs).toEqual(new Set([ORG_A]));
    const byId = await rest(e, adminA.token, 'GET', `staff?id=eq.${adminB.id}&select=*`);
    expect(byId.json).toEqual([]);
  }, 60_000);

  it('attack: org_admin A reads zero audit rows of org B (cross-tenant audit review refused)', async () => {
    const e = env as AttackEnv;
    const all = await rest(e, adminA.token, 'GET', 'audit_log?select=id,org_id');
    expect(all.status).toBe(200);
    const rows = all.json as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0].org_id).toBe(ORG_A);
  }, 60_000);

  // --------------------------------------------------------- org A admin: writes
  it('attack: org_admin A cannot add a branch naming org B as target (tenant ids from clients never accepted)', async () => {
    const e = env as AttackEnv;
    const res = await rest(e, adminA.token, 'POST', 'branches', {
      org_id: ORG_B,
      name: `ATTACK-HIJACKED-BR-${run}`,
    });
    console.log(`[attack] POST /branches targeting org B as org_admin A -> ${res.status} ${res.text.slice(0, 160)}`);
    expect(res.status).toBe(403);
    const { data } = await admin!.schema('public').from('branches').select('id').eq('org_id', ORG_B);
    expect((data ?? []).map((r) => r.id)).toEqual([BR_B1]);
  }, 60_000);

  it('attack: org_admin A cannot insert a staff row into org B', async () => {
    const e = env as AttackEnv;
    const res = await rest(e, adminA.token, 'POST', 'staff', {
      id: 'a77ccc99-0000-4000-8000-0000000000a9',
      org_id: ORG_B,
      email: `attack-smuggled-${run}@attack.invalid`,
      role: 'cashier',
      display_name: 'Smuggled Row',
    });
    expect(res.status).toBe(403);
  }, 60_000);

  it('attack: org_admin A cannot set organization status — not on org B, not even on its own (claim 2)', async () => {
    const e = env as AttackEnv;
    const onB = await rest(e, adminA.token, 'PATCH', `organizations?id=eq.${ORG_B}`, { status: 'suspended' });
    console.log(`[attack] PATCH org B status as org_admin A -> ${onB.status}`);
    expect([200, 204]).toContain(onB.status);
    const { data: b } = await admin!.schema('public').from('organizations').select('status').eq('id', ORG_B).single();
    expect(b?.status).toBe('active');

    const onA = await rest(e, adminA.token, 'PATCH', `organizations?id=eq.${ORG_A}`, { status: 'suspended' });
    expect([200, 204]).toContain(onA.status);
    const { data: a } = await admin!.schema('public').from('organizations').select('status').eq('id', ORG_A).single();
    expect(a?.status).toBe('active');
  }, 60_000);

  it('attack: org_admin A cannot deactivate org B staff — direct PATCH and the sanctioned RPC both refuse', async () => {
    const e = env as AttackEnv;
    const patch = await rest(e, adminA.token, 'PATCH', `staff?id=eq.${adminB.id}`, { is_active: false });
    expect([200, 204]).toContain(patch.status);
    const { data: b } = await admin!.schema('public').from('staff').select('is_active').eq('id', adminB.id).single();
    expect(b?.is_active).toBe(true);

    const client = anonClient(e);
    await client.auth.signInWithPassword({ email: adminA.email, password: adminA.password });
    const rpc = await client.rpc('deactivate_staff', { p_target_user_id: adminB.id });
    console.log(`[attack] rpc deactivate_staff(org B admin) as org_admin A -> error: ${rpc.error?.message ?? 'none'}`);
    expect(rpc.error).not.toBeNull();
  }, 60_000);

  // --------------------------------------------------------- cashier: sibling isolation (still ACTIVE here)
  it('attack: cashier sees only its own branch row — sibling branch of the same org is invisible', async () => {
    const e = env as AttackEnv;
    const all = await rest(e, cashA1.token, 'GET', 'branches?select=id,org_id');
    expect(all.status).toBe(200);
    const ids = (all.json as Array<Record<string, unknown>>).map((r) => r.id);
    expect(ids).toEqual([BR_A1]);
  }, 60_000);

  it('attack: cashier sees only its own staff row and zero audit rows', async () => {
    const e = env as AttackEnv;
    const staff = await rest(e, cashA1.token, 'GET', 'staff?select=id');
    expect(staff.json).toEqual([{ id: cashA1.id }]);
    const audit = await rest(e, cashA1.token, 'GET', 'audit_log?select=id');
    expect(audit.json).toEqual([]);
  }, 60_000);

  it('attack: cashier cannot add branches or provision staff, even inside its own org', async () => {
    const e = env as AttackEnv;
    const branch = await rest(e, cashA1.token, 'POST', 'branches', { org_id: ORG_A, name: `ATTACK-CSH-BR-${run}` });
    expect(branch.status).toBe(403);
    const staffRow = await rest(e, cashA1.token, 'POST', 'staff', {
      id: 'a77ccc98-0000-4000-8000-0000000000a8',
      org_id: ORG_A,
      email: `attack-csh-provisioned-${run}@attack.invalid`,
      role: 'cashier',
      display_name: 'Cashier Smuggled Row',
    });
    expect(staffRow.status).toBe(403);
  }, 60_000);

  // --------------------------------------------------------- deactivation (claim 7)
  it('attack: the sanctioned path works — org_admin A deactivates its own cashier, and the STILL-VALID token stops acting', async () => {
    const e = env as AttackEnv;
    const client = anonClient(e);
    await client.auth.signInWithPassword({ email: adminA.email, password: adminA.password });
    const rpc = await client.rpc('deactivate_staff', { p_target_user_id: cashA1.id });
    expect(rpc.error).toBeNull();

    // the cashier's pre-deactivation token is still unexpired — and must act on zero rows
    const branches = await rest(e, cashA1.token, 'GET', 'branches?select=id');
    expect(branches.json).toEqual([]);
    const staff = await rest(e, cashA1.token, 'GET', 'staff?select=id');
    expect(staff.json).toEqual([]);
    const orgs = await rest(e, cashA1.token, 'GET', 'organizations?select=id');
    expect(orgs.json).toEqual([]);

    // sessions were revoked first: refresh fails
    const refresh = await authRefresh(e, cashA1.refreshToken);
    console.log(`[attack] refresh after deactivation -> ${refresh.status} ${refresh.text.slice(0, 120)}`);
    expect(refresh.status).toBe(400);

    // a fresh sign-in still authenticates (Supabase Auth owns identity) but
    // the inactive profile acts on nothing at the database layer
    const fresh = await signIn(e, cashA1.email, cashA1.password);
    expect(fresh.status).toBe(200);
    const freshToken = String(fresh.json.access_token);
    const branchesFresh = await rest(e, freshToken, 'GET', 'branches?select=id');
    expect(branchesFresh.json).toEqual([]);
  }, 90_000);

  // --------------------------------------------------------- org B admin (reverse direction)
  it('attack: org_admin B symmetrically sees zero rows of org A (organizations, staff, branches)', async () => {
    const e = env as AttackEnv;
    const orgs = await rest(e, adminB.token, 'GET', `organizations?id=eq.${ORG_A}&select=*`);
    expect(orgs.json).toEqual([]);
    const staff = await rest(e, adminB.token, 'GET', 'staff?select=id,org_id');
    const orgSet = new Set((staff.json as Array<Record<string, unknown>>).map((r) => r.org_id));
    expect(orgSet).toEqual(new Set([ORG_B]));
    const branches = await rest(e, adminB.token, 'GET', 'branches?select=id,org_id');
    const branchOrgs = new Set((branches.json as Array<Record<string, unknown>>).map((r) => r.org_id));
    expect(branchOrgs).toEqual(new Set([ORG_B]));
  }, 60_000);

  it('attack: the platform operator still reaches every organization and manages status (claim 2 control)', async () => {
    const e = env as AttackEnv;
    if (!e.operatorEmail || !e.operatorPassword) {
      console.warn('[attack] operator credentials absent — skipping platform control assertions');
      return;
    }
    const op = await signIn(e, e.operatorEmail, e.operatorPassword);
    if (op.status !== 200) {
      console.warn('[attack] operator credentials invalid — skipping platform control assertions');
      return;
    }
    const opToken = String(op.json.access_token);
    const all = await rest(e, opToken, 'GET', 'organizations?select=id');
    const ids = (all.json as Array<Record<string, unknown>>).map((r) => r.id);
    expect(ids).toContain(ORG_A);
    expect(ids).toContain(ORG_B);

    const suspend = await rest(e, opToken, 'PATCH', `organizations?id=eq.${ORG_B}`, { status: 'suspended' });
    expect([200, 204]).toContain(suspend.status);
    const { data: b } = await admin!.schema('public').from('organizations').select('status').eq('id', ORG_B).single();
    expect(b?.status).toBe('suspended');
    // restore
    await rest(e, opToken, 'PATCH', `organizations?id=eq.${ORG_B}`, { status: 'active' });
  }, 60_000);
});

async function authRefresh(env: AttackEnv, refreshToken: string): Promise<{ status: number; text: string }> {
  const res = await fetch(`${env.url}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { apikey: env.publishableKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  return { status: res.status, text: await res.text() };
}
