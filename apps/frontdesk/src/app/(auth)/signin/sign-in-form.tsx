"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { mapStaffIdentifier } from "@/lib/staff-identifier";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * The bare-identifier ergonomics of vault-19, and nothing more: a cashier
 * types `mgarcia`, the form rewrites the string to the address Supabase's
 * standard password sign-in takes, and no role or claim is derived from it
 * anywhere (`spec/authentication.md` §2, §5). The mapping is refused rather
 * than guessed when there is no domain to map onto.
 */
export function SignInForm({ staffEmailDomain }: { staffEmailDomain: string | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const identifier = String(formData.get("identifier") ?? "");
    const mapped = mapStaffIdentifier(identifier, staffEmailDomain);
    if (!mapped.ok) {
      setError(mapped.reason);
      setSubmitting(false);
      return;
    }

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: mapped.email,
      password: String(formData.get("password") ?? ""),
    });
    if (signInError) {
      setError(signInError.message);
      setSubmitting(false);
      return;
    }
    // replace, not push: signing in should not leave the sign-in page in the
    // history for the Back button to return to.
    router.replace("/");
    router.refresh();
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>
          <h1 className="text-xl font-semibold">Silid Frontdesk</h1>
        </CardTitle>
        <CardDescription>
          {staffEmailDomain
            ? "Staff sign-in — your identifier, or your full address"
            : "Staff sign-in — full email address (no staff domain is configured on this deployment)"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="identifier">Staff identifier</Label>
            <Input
              id="identifier"
              name="identifier"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
