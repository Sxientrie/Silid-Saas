import { readAppClaims } from "@silid/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * The desk surface (spec/applications.md §3).
 *
 * Deliberately thin: Phase 05 delivers the shell and the offline contract, and
 * no business feature exists to render here yet (roadmap 05). A screen full of
 * placeholders would be a lie about the product's state, so this says what is
 * here and names where the contract is proved.
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
            {claims ? <Badge data-testid="desk-role">{claims.role}</Badge> : null}
          </CardTitle>
          <CardDescription>
            The shell is in place: this session came from <code>app_metadata</code> claims, the
            navigation above is the role&apos;s own surface set, and every route here is behind the
            Layer 2 guard.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
          <p>
            Room, session, and shift features land in later phases. What is already real on every
            desk machine is the offline layer: the service worker, the local database, the durable
            outbox, and the online-only gate.
          </p>
          <p>
            The offline contract is demonstrated at{" "}
            <a className="underline" href="/harness">
              /harness
            </a>
            , which is exempt from the guard and holds no business data.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
