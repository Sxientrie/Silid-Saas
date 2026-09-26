import { forbidden } from "next/navigation";
import { readAppClaims } from "@silid/auth";
import { createClient } from "@/lib/supabase/server";
import { canOpenSurface } from "@/lib/desk-navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * The organization surface (spec/authentication.md §3). Organization-tier work
 * is one of the online-only surfaces: a rate change or a void is performed from
 * a connected admin surface and never from a desk that cannot see the ledger.
 *
 * The guard already refuses this path to a cashier with a 403. The check is
 * repeated here on purpose: the proxy is Layer 2 for navigation, and a page
 * that renders its own conclusions should not depend on someone else's guard
 * having run first.
 */
export default async function OrganizationPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = readAppClaims(data?.claims ?? null);

  if (!claims || !canOpenSurface("/organization", claims)) {
    forbidden();
  }

  return (
    <div data-testid="organization-page" className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Organization</CardTitle>
          <CardDescription>
            Organization-tier surfaces: rate configuration and voids. Both are online-only by design
            (<code>spec/offline-sync.md</code> §3) — a change sealed from a desk that cannot see the
            ledger is a change nobody can reconcile.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>
            Rate configuration lands with the money features in a later phase. This page exists so
            the role-aware navigation and its guard have a real destination to refuse.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
