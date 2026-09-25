"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isPlatformAdminClaims, readAppClaims } from "@silid/auth";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error?: string };
export type ProvisionState = { error?: string; provisionedEmail?: string };

async function requirePlatformAdmin() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = readAppClaims(data?.claims ?? null);
  if (!isPlatformAdminClaims(claims)) {
    throw new Error("forbidden");
  }
  return supabase;
}

/**
 * Platform-tier actions are audited with null org/branch
 * (spec/multi-tenancy.md §5); the audit trigger seals actor and time from
 * the caller's verified claims.
 */
async function audit(
  supabase: Awaited<ReturnType<typeof requirePlatformAdmin>>,
  action: string,
  targetTable: string,
  targetId: string,
  newData: Record<string, unknown>,
) {
  const { error } = await supabase.from("audit_log").insert({
    action,
    target_table: targetTable,
    target_id: targetId,
    new_data: newData,
  });
  if (error) throw new Error(error.message);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/signin");
}

export async function createOrganization(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await requirePlatformAdmin();
  const parsed = z
    .object({ name: z.string().trim().min(1).max(200) })
    .safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { error: "Organization name is required (max 200 characters)." };
  }
  const { data, error } = await supabase
    .from("organizations")
    .insert({ name: parsed.data.name, status: "active" })
    .select("id")
    .single();
  if (error) return { error: error.message };
  await audit(supabase, "create_organization", "organizations", data.id, {
    name: parsed.data.name,
    status: "active",
  });
  revalidatePath("/");
  redirect(`/organizations/${data.id}`);
}

export async function setOrganizationStatus(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await requirePlatformAdmin();
  const parsed = z
    .object({ id: z.uuid(), status: z.enum(["active", "suspended"]) })
    .safeParse({ id: formData.get("id"), status: formData.get("status") });
  if (!parsed.success) return { error: "Invalid status change." };
  const { error } = await supabase
    .from("organizations")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.id);
  if (error) return { error: error.message };
  await audit(supabase, "set_organization_status", "organizations", parsed.data.id, {
    status: parsed.data.status,
  });
  revalidatePath(`/organizations/${parsed.data.id}`);
  revalidatePath("/");
  return {};
}

export async function createBranch(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await requirePlatformAdmin();
  const parsed = z
    .object({ org_id: z.uuid(), name: z.string().trim().min(1).max(200) })
    .safeParse({ org_id: formData.get("org_id"), name: formData.get("name") });
  if (!parsed.success) return { error: "Branch name is required (max 200 characters)." };
  const { data: branch, error } = await supabase
    .from("branches")
    .insert({ org_id: parsed.data.org_id, name: parsed.data.name })
    .select("id")
    .single();
  if (error) return { error: error.message };
  await audit(supabase, "create_branch", "branches", branch.id, {
    org_id: parsed.data.org_id,
    name: parsed.data.name,
  });
  revalidatePath(`/organizations/${parsed.data.org_id}`);
  return {};
}

export async function provisionOrgAdmin(
  _prev: ProvisionState,
  formData: FormData,
): Promise<ProvisionState> {
  const supabase = await requirePlatformAdmin();
  const parsed = z
    .object({
      org_id: z.uuid(),
      email: z.email(),
      display_name: z.string().trim().min(1).max(120),
      password: z.string().min(8).max(72),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      error: "Check the fields: a valid email, a display name, and a password of at least 8 characters.",
    };
  }
  const { error } = await supabase.functions.invoke("provision-staff", {
    body: { ...parsed.data, role: "org_admin", branch_id: null },
  });
  if (error) {
    let message: string = error.message;
    try {
      const context = (error as { context?: Response }).context;
      if (context) {
        const body = (await context.json()) as { error?: string };
        if (body.error) message = body.error;
      }
    } catch {
      // keep the invoke error message
    }
    return { error: message };
  }
  revalidatePath(`/organizations/${parsed.data.org_id}`);
  return { provisionedEmail: parsed.data.email };
}
