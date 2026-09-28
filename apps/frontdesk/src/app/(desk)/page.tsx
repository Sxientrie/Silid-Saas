import { readAppClaims } from "@silid/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DeskOutboxRows, DeskSyncBar } from "@/components/desk-sync";
import { DeskDashboard } from "@/features/sessions/DeskDashboard";
import { createClient } from "@/lib/supabase/server";

/**
 * The desk surface (spec/applications.md §3): the cashier dashboard — room
 * grid, check-in with the payment-confirmation step, check-out with the
 * sealed total, and the overstay ladder. The queries poll at the 15-second
 * design interval so other cashiers' sessions and rooms appear (multi-cashier
 * is the normal case), and the offline bar carries the write contract's desk
 * surface.
 */
export default async function DeskPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = readAppClaims(data?.claims ?? null);

  return (
    <div data-testid="desk-home" className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            Desk
            {claims ? (
              <span data-testid="desk-role" className="text-sm font-normal text-muted-foreground">
                {claims.role}
              </span>
            ) : null}
          </CardTitle>
          <CardDescription>
            Rooms, sessions, and the overstay ladder — every peso sealed by the server.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DeskSyncBar />
          <div className="mt-3">
            <DeskOutboxRows />
          </div>
        </CardContent>
      </Card>
      <DeskDashboard />
    </div>
  );
}
