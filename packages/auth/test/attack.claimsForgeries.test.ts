// /Silid/packages/auth/test/attack.claimsForgeries.test.ts
// PHASE 03 ATTACK BATTERY — claims forgery through the CLIENT API path.
// Attacks acceptance inputs 6 and 8: "Staff accounts are provisioned only
// through the server path; a client cannot set its own authorization
// claims" and "no authorization decision anywhere trusts user-editable
// metadata". Runs against the LIVE linked project; skips with a logged
// reason when credentials are absent.

import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  adminClient,
  anonClient,
  authApi,
  decodeJwtPayload,
  describeLive,
  loadAttackEnv,
  Residue,
  rest,
  runId,
  signIn,
  type AttackEnv,
} from './attack.helpers';

const { env, missing } = loadAttackEnv();
const run = runId();

// fixture org owned by NOBODY (created by the trusted path purely as a
// target for forged claims to try to reach). Run-scoped id: see
// attack.tenantIsolation.test.ts for the rerun-safety note.
const AF_ORG = randomUUID();
const attackerEmail = `attack-forgery-${run}@attack.invalid`;
const attackerPassword = `attack-${run}-pw`;
const attacker = { id: '', token: '' };

let admin: ReturnType<typeof adminClient> | null = null;
const residue = new Residue();

describeLive('attack: client-path claim forgery (claims 6 + 8)', missing, () => {
  beforeAll(async () => {
    const e = env as AttackEnv;
    admin = adminClient(e);

    // target org via the trusted path
    const { error: orgError } = await admin
      .schema('public')
      .from('organizations')
      .insert({ id: AF_ORG, name: `ATTACK-FORGERY-ORG-${run}` });
    if (orgError) throw new Error(`org fixture failed: ${orgError.message}`);
    residue.trackOrg(AF_ORG);

    // the attacker identity itself: a plain user with NO claims anywhere.
    // Created through the trusted fixture path because the project
    // rate-limits confirmation emails on self-signup; every CLAIM-WRITE
    // attack below still goes through the real client paths.
    const { data, error } = await admin.auth.admin.createUser({
      email: attackerEmail,
      password: attackerPassword,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`attacker fixture failed: ${error?.message ?? 'no user'}`);
    attacker.id = data.user.id;
    residue.trackUser(attacker.id, attackerEmail);

    const signin = await signIn(e, attackerEmail, attackerPassword);
    expect(signin.status).toBe(200);
    attacker.token = String(signin.json.access_token);
  }, 90_000);

  afterAll(async () => {
    const e = env as AttackEnv | null;
    if (!e || !admin) return;
    const { leftovers, auditTargetIds } = await residue.cleanup(admin);
    const total = Object.values(leftovers).reduce((a, b) => a + b, 0);
    if (total > 0) console.warn(`[attack.claimsForgeries] CLEANUP LEFTOVERS: ${JSON.stringify(leftovers)}`);
    else console.log('[attack.claimsForgeries] cleanup verified: zero residue (audit rows, if any, swept via CLI)');
    if (auditTargetIds.length > 0) {
      console.log(`[attack.claimsForgeries] audit target ids for CLI sweep: ${auditTargetIds.join(', ')}`);
    }
  }, 90_000);

  it('attack: the real /auth/v1/signup endpoint cannot mint app_metadata claims', async (ctx) => {
    const e = env as AttackEnv;
    // a genuine client signup planting role/org in BOTH user_metadata and
    // (the forbidden attempt) a top-level app_metadata field
    const signup = await authApi(e, 'POST', 'signup', {
      body: {
        email: `attack-signup-${run}@attack.invalid`,
        password: `attack-${run}-pw`,
        data: { role: 'platform_admin', org_id: AF_ORG },
        app_metadata: { role: 'platform_admin', org_id: AF_ORG },
      },
    });
    const body = (signup.json && typeof signup.json === 'object' ? signup.json : {}) as Record<string, unknown>;
    console.log(`[attack] signup -> ${signup.status} ${signup.text.slice(0, 160)}`);

    if (signup.status !== 200) {
      // the project rate-limits confirmation emails; the attack is real but
      // currently unexecutable — skip THIS assertion with the reason, never
      // pass it vacuously
      console.warn(`[attack] signup attack skipped: ${signup.text.slice(0, 120)}`);
      ctx.skip();
    }

    const userObj = (body.user ?? {}) as Record<string, unknown>;
    const userId = String(userObj.id ?? '');
    expect(userId).not.toBe('');
    const sessionObj = (body.session ?? null) as Record<string, unknown> | null;
    const token =
      sessionObj && typeof sessionObj.access_token === 'string'
        ? (sessionObj.access_token as string)
        : null;

    if (token) {
      const claims = decodeJwtPayload(token);
      const appMeta = (claims.app_metadata ?? {}) as Record<string, unknown>;
      expect(appMeta.role).toBeUndefined();
      expect(appMeta.org_id).toBeUndefined();
      const userMeta = (claims.user_metadata ?? {}) as Record<string, unknown>;
      expect(userMeta.role).toBe('platform_admin');
    }

    // the server-side record agrees
    const { data } = await admin!.auth.admin.getUserById(userId);
    const appMetaDb = (data?.user?.app_metadata ?? {}) as Record<string, unknown>;
    expect(appMetaDb.role).toBeUndefined();
    expect(appMetaDb.org_id).toBeUndefined();

    // cleanup for this throwaway signup
    residue.trackUser(userId);
  }, 90_000);

  it('attack: the no-claims identity reads zero organizations, branches, staff, and audit rows', async () => {
    const e = env as AttackEnv;
    for (const table of ['organizations', 'branches', 'staff', 'audit_log']) {
      const res = await rest(e, attacker.token, 'GET', `${table}?select=*`);
      expect(res.status).toBe(200);
      expect(res.json).toEqual([]);
    }
  }, 60_000);

  it('attack: the no-claims identity cannot reach the fixture org even by exact id', async () => {
    const e = env as AttackEnv;
    const res = await rest(e, attacker.token, 'GET', `organizations?id=eq.${AF_ORG}&select=*`);
    expect(res.status).toBe(200);
    expect(res.json).toEqual([]);
  }, 60_000);

  it('attack: the no-claims identity cannot create an organization', async () => {
    const e = env as AttackEnv;
    const res = await rest(e, attacker.token, 'POST', 'organizations', { name: `ATTACK-FORGED-ORG-${run}` });
    console.log(`[attack] POST /organizations as claimless user -> ${res.status} ${res.text.slice(0, 160)}`);
    expect(res.status).toBe(403);
  }, 60_000);

  it('attack: updateUser() cannot write app_metadata (the server-managed claim store)', async () => {
    const e = env as AttackEnv;
    const client = anonClient(e);
    const { error } = await client.auth.signInWithPassword({ email: attackerEmail, password: attackerPassword });
    expect(error).toBeNull();

    const attempt = await client.auth.updateUser({
      // deliberately the forbidden field
      // @ts-expect-error — attacking exactly the field a client must not write
      app_metadata: { role: 'platform_admin', org_id: AF_ORG },
    } as never);
    console.log(`[attack] updateUser(app_metadata) -> error: ${attempt.error?.message ?? 'none'}`);

    // fresh sign-in: claims must still carry nothing
    const fresh = await signIn(e, attackerEmail, attackerPassword);
    expect(fresh.status).toBe(200);
    const claims = decodeJwtPayload(String(fresh.json.access_token));
    const appMeta = (claims.app_metadata ?? {}) as Record<string, unknown>;
    expect(appMeta.role).toBeUndefined();
    expect(appMeta.org_id).toBeUndefined();

    const { data } = await admin!.auth.admin.getUserById(attacker.id);
    const appMetaDb = (data?.user?.app_metadata ?? {}) as Record<string, unknown>;
    expect(appMetaDb.role).toBeUndefined();
    expect(appMetaDb.org_id).toBeUndefined();
  }, 60_000);

  it('attack: user_metadata IS writable but grants nothing — planted org_admin claims read zero org rows', async () => {
    const e = env as AttackEnv;
    const client = anonClient(e);
    const { error } = await client.auth.signInWithPassword({ email: attackerEmail, password: attackerPassword });
    expect(error).toBeNull();

    // user_metadata is user-editable BY DESIGN — the write succeeds
    const { error: metaError } = await client.auth.updateUser({
      data: { role: 'org_admin', org_id: AF_ORG },
    });
    expect(metaError).toBeNull();

    // fresh token so the JWT carries the planted user_metadata
    const fresh = await signIn(e, attackerEmail, attackerPassword);
    expect(fresh.status).toBe(200);
    const token = String(fresh.json.access_token);
    const claims = decodeJwtPayload(token);
    const userMeta = (claims.user_metadata ?? {}) as Record<string, unknown>;
    expect(userMeta.role).toBe('org_admin');
    expect(userMeta.org_id).toBe(AF_ORG);

    // ...and the planted claims still reach nothing
    const resOrg = await rest(e, token, 'GET', `organizations?id=eq.${AF_ORG}&select=*`);
    expect(resOrg.json).toEqual([]);
    const resBranch = await rest(e, token, 'POST', 'branches', { org_id: AF_ORG, name: `ATTACK-FORGED-BR-${run}` });
    console.log(`[attack] POST /branches with planted org claim -> ${resBranch.status}`);
    expect(resBranch.status).toBe(403);
    const resStaff = await rest(e, token, 'POST', 'staff', {
      id: attacker.id,
      org_id: AF_ORG,
      email: attackerEmail,
      role: 'org_admin',
      display_name: 'Forged Admin',
    });
    console.log(`[attack] POST /staff self-provision attempt -> ${resStaff.status}`);
    expect(resStaff.status).toBe(403);
  }, 90_000);

  it('attack: the GoTrue admin API is unreachable with a client key (no self-service app_metadata writes)', async () => {
    const e = env as AttackEnv;
    // the call that WOULD mint claims if the admin API leaked to clients
    const put = await authApi(e, 'PUT', `admin/users/${attacker.id}`, {
      token: attacker.token, // user JWT in Authorization
      body: { app_metadata: { role: 'platform_admin' } },
    });
    console.log(`[attack] PUT /auth/v1/admin/users with user JWT + publishable key -> ${put.status}`);
    expect([401, 403]).toContain(put.status);

    const post = await authApi(e, 'POST', 'admin/users', {
      token: attacker.token,
      body: { email: `attack-admin-${run}@attack.invalid`, password: `attack-${run}-pw`, app_metadata: { role: 'platform_admin' } },
    });
    console.log(`[attack] POST /auth/v1/admin/users with user JWT + publishable key -> ${post.status}`);
    expect([401, 403]).toContain(post.status);
  }, 60_000);
});
