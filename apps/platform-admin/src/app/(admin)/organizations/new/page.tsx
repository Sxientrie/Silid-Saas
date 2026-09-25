"use client";

import { useActionState } from "react";
import { createOrganization, type ActionState } from "@/app/(admin)/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: ActionState = {};

export default function NewOrganizationPage() {
  const [state, formAction, pending] = useActionState(createOrganization, initialState);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">New organization</h1>
      <Card>
        <CardHeader>
          <CardTitle>Create a tenant</CardTitle>
          <CardDescription>
            The organization starts active. Branches and its first
            administrator are added on the organization page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="flex max-w-sm flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Organization name</Label>
              <Input id="name" name="name" required maxLength={200} />
            </div>
            {state.error ? (
              <p role="alert" className="text-sm text-red-600">
                {state.error}
              </p>
            ) : null}
            <Button type="submit" disabled={pending} className="w-fit">
              {pending ? "Creating…" : "Create organization"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
