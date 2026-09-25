"use client";

import { useActionState } from "react";
import {
  createBranch,
  provisionOrgAdmin,
  setOrganizationStatus,
  type ActionState,
  type ProvisionState,
} from "@/app/(admin)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: ActionState = {};
const initialProvisionState: ProvisionState = {};

export function StatusForm({ orgId, status }: { orgId: string; status: string }) {
  const [state, formAction, pending] = useActionState(setOrganizationStatus, initialState);
  const nextStatus = status === "active" ? "suspended" : "active";
  return (
    <form action={formAction} className="flex items-center gap-3">
      <input type="hidden" name="id" value={orgId} />
      <input type="hidden" name="status" value={nextStatus} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending
          ? "Saving…"
          : nextStatus === "suspended"
            ? "Suspend organization"
            : "Reactivate organization"}
      </Button>
      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

export function BranchForm({ orgId }: { orgId: string }) {
  const [state, formAction, pending] = useActionState(createBranch, initialState);
  return (
    <form action={formAction} className="flex max-w-md items-end gap-3">
      <input type="hidden" name="org_id" value={orgId} />
      <div className="flex flex-1 flex-col gap-2">
        <Label htmlFor="branch-name">Branch name</Label>
        <Input id="branch-name" name="name" required maxLength={200} />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add branch"}
      </Button>
      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

export function ProvisionForm({ orgId }: { orgId: string }) {
  const [state, formAction, pending] = useActionState(
    provisionOrgAdmin,
    initialProvisionState,
  );
  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      <input type="hidden" name="org_id" value={orgId} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="admin-email">Administrator email</Label>
        <Input id="admin-email" name="email" type="email" required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="admin-name">Display name</Label>
        <Input id="admin-name" name="display_name" required maxLength={120} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="admin-password">Initial password</Label>
        <Input
          id="admin-password"
          name="password"
          type="password"
          required
          minLength={8}
          maxLength={72}
        />
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      {state.provisionedEmail ? (
        <p role="status" data-testid="provision-success" className="text-sm text-green-700">
          Administrator provisioned: {state.provisionedEmail}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Provisioning…" : "Provision administrator"}
      </Button>
    </form>
  );
}
