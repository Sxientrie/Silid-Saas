// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { z } from "npm:zod@4.6.5";

/**
 * provision-staff — the trusted server provisioning path
 * (spec/authentication.md §5). Creates a staff auth user WITH its
 * app_metadata claims (role, org_id, branch_id) and the staff profile row
 * through the elevated credentials; returns nothing sensitive.
 *
 * Caller liveness (spec/authentication.md §2, §5): deactivation revokes
 * sessions and flips the profile, but app_metadata claims are NOT synced
 * (they stay stale until an admin updates them), and this function writes
 * with the elevated credentials — the database's claims↔profile binding
 * (app.claims_match_profile) never applies here. So before ANY
 * authorization decision the caller must prove liveness exactly as the
 * database layer requires: a platform_admin claim must carry the platform
 * claim shape (null org/branch claims), and an org_admin/cashier claim
 * must sit on an ACTIVE staff profile row whose role, org (and branch,
 * for a cashier) match the claims.
 *
 * Authorization matrix (the caller's role is resolved from its CURRENT
 * auth record, not the JWT, which may be stale):
 *   platform_admin → provisions org_admin for any organization;
 *   org_admin      → provisions org_admin/cashier within its own org.
 * Claims are never user-editable: they are written here, server-side
 * only — no client path can set app_metadata.
 */

const PROVISION_SCHEMA = z.object({
  email: z.email(),
  // bcrypt caps passwords at 72 bytes on the auth server.
  password: z.string().min(8).max(72),
  display_name: z.string().trim().min(1).max(120),
  role: z.enum(["org_admin", "cashier"]),
  org_id: z.uuid(),
  branch_id: z.uuid().nullish().transform((value) => value ?? null),
});

function http(status: number, body: unknown) {
  return Response.json(body, { status });
}

export default {
  fetch: withSupabase({ auth: ["publishable", "secret"] }, async (req, ctx) => {
    try {
      if (req.method === "OPTIONS") {
        return new Response("ok", { status: 200 });
      }
      if (req.method !== "POST") {
        return http(405, { error: "POST required" });
      }

      // Caller authentication: validate the caller's JWT server-side with
      // Supabase Auth (works for legacy and signing-key JWTs alike).
      const token = (req.headers.get("Authorization") ?? "").replace(
        /^Bearer\s+/i,
        "",
      );
      if (!token) {
        return http(401, { error: "missing bearer token" });
      }
      const { data: callerData, error: callerError } =
        await ctx.supabaseAdmin.auth.getUser(token);
      if (callerError || !callerData?.user) {
        return http(401, { error: "invalid bearer token" });
      }
      const caller = callerData.user;
      const callerRole: unknown = caller.app_metadata?.role;
      const callerOrgId: unknown = caller.app_metadata?.org_id ?? null;
      const callerBranchId: unknown = caller.app_metadata?.branch_id ?? null;

      // Caller liveness BEFORE any authorization decision — the mirror of
      // app.claims_match_profile (migration 20260925092000). A deactivated
      // org_admin's auth record still carries its org_admin claims (a fresh
      // sign-in re-mints them), and the elevated writes here bypass RLS, so
      // only this check ends their access (spec/authentication.md §5:
      // deactivating a staff member ends their access even with a token
      // still in hand). The refusal body is the function's standard 403 —
      // caller state never leaks.
      let callerLive = false;
      if (callerRole === "platform_admin") {
        callerLive = callerOrgId === null && callerBranchId === null;
      } else if (callerRole === "org_admin" || callerRole === "cashier") {
        const { data: profile } = await ctx.supabaseAdmin
          .from("staff")
          .select("role, org_id, branch_id")
          .eq("id", caller.id)
          .eq("is_active", true)
          .maybeSingle();
        callerLive =
          profile !== null &&
          profile.role === callerRole &&
          profile.org_id === callerOrgId &&
          (callerRole === "org_admin"
            ? callerBranchId === null && profile.branch_id === null
            : callerBranchId !== null && profile.branch_id === callerBranchId);
      }
      if (!callerLive) {
        return http(403, { error: "caller role cannot provision staff" });
      }

      if (callerRole !== "platform_admin" && callerRole !== "org_admin") {
        return http(403, { error: "caller role cannot provision staff" });
      }

      const parsed = PROVISION_SCHEMA.safeParse(await req.json());
      if (!parsed.success) {
        return http(400, { error: "invalid input", issues: parsed.error.issues });
      }
      const input = parsed.data;

      // Authorization matrix, from claims only — request-supplied tenant
      // identifiers never widen scope (spec/multi-tenancy.md §2).
      if (callerRole === "platform_admin") {
        if (input.role !== "org_admin") {
          return http(403, {
            error:
              "the platform tier provisions org-admins; staff provisioning belongs to the organization tier",
          });
        }
      } else if (input.org_id !== callerOrgId) {
        return http(403, { error: "cross-tenant provisioning refused" });
      }

      if (input.role === "cashier" && input.branch_id === null) {
        return http(400, { error: "cashier provisioning requires branch_id" });
      }
      if (input.role === "org_admin" && input.branch_id !== null) {
        return http(400, { error: "org_admin provisioning requires null branch_id" });
      }

      const { data: org } = await ctx.supabaseAdmin
        .from("organizations")
        .select("id")
        .eq("id", input.org_id)
        .maybeSingle();
      if (!org) {
        return http(404, { error: "organization not found" });
      }
      if (input.branch_id !== null) {
        const { data: branch } = await ctx.supabaseAdmin
          .from("branches")
          .select("id")
          .eq("id", input.branch_id)
          .eq("org_id", input.org_id)
          .maybeSingle();
        if (!branch) {
          return http(404, { error: "branch not found in the organization" });
        }
      }

      // The claim set is written here — the trusted server path — exactly
      // per spec/authentication.md §2's shape.
      const { data: created, error: createError } =
        await ctx.supabaseAdmin.auth.admin.createUser({
          email: input.email,
          password: input.password,
          email_confirm: true,
          app_metadata: {
            role: input.role,
            org_id: input.org_id,
            branch_id: input.role === "cashier" ? input.branch_id : null,
          },
        });
      if (createError || !created?.user) {
        return http(createError?.status === 422 ? 409 : 400, {
          error: createError?.message ?? "user creation failed",
        });
      }
      const user = created.user;

      const branchId = input.role === "cashier" ? input.branch_id : null;
      const { error: staffError } = await ctx.supabaseAdmin.from("staff").insert({
        id: user.id,
        org_id: input.org_id,
        branch_id: branchId,
        email: input.email,
        role: input.role,
        display_name: input.display_name,
        is_active: true,
      });
      if (staffError) {
        // Do not strand a claim-bearing auth user without its profile row.
        await ctx.supabaseAdmin.auth.admin.deleteUser(user.id);
        return http(500, { error: "staff profile creation failed" });
      }

      // The platform tier's actions are audited with null org/branch
      // (spec/multi-tenancy.md §5); the organization tier's carry its org.
      await ctx.supabaseAdmin.from("audit_log").insert({
        actor_id: caller.id,
        action: "provision_staff",
        target_table: "staff",
        target_id: user.id,
        old_data: null,
        new_data: {
          email: input.email,
          role: input.role,
          org_id: input.org_id,
          branch_id: branchId,
          display_name: input.display_name,
        },
        org_id: callerRole === "platform_admin" ? null : input.org_id,
        branch_id: null,
      });

      return http(200, { user_id: user.id, email: input.email });
    } catch (_error) {
      return http(500, { error: "unexpected failure" });
    }
  }),
};
