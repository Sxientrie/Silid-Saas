import Link from "next/link";
import { readAppClaims } from "@silid/auth";
import { createClient } from "@/lib/supabase/server";
import { navItemsFor } from "@/lib/desk-navigation";
import { signOut } from "./actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DeskQueryProvider } from "@/components/desk-query-provider";

/**
 * The desk shell (spec/applications.md §3, spec/authentication.md §3).
 *
 * The navigation is rendered from the caller's verified `app_metadata` claims
 * and from the same surface table the proxy's guard reads, so a cashier is
 * never shown a link that would 403. The claims are resolved on the server
 * with `getClaims()`, which validates the JWT — the shell never trusts a
 * client-asserted role.
 */
export default async function DeskLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = readAppClaims(data?.claims ?? null);
  const items = navItemsFor(claims);

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex flex-wrap items-center gap-4 border-b px-6 py-3">
        <span className="font-semibold">Silid Frontdesk</span>
        <nav aria-label="Desk" className="flex items-center gap-1">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              data-testid={`nav-${item.href === "/" ? "desk" : item.href.replace("/", "")}`}
              className="rounded-md px-3 py-1.5 text-sm hover:bg-accent"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          {claims ? <Badge data-testid="role-badge">{claims.role}</Badge> : null}
          <form action={signOut}>
            <Button type="submit" variant="outline" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 p-6">
        <DeskQueryProvider>{children}</DeskQueryProvider>
      </main>
    </div>
  );
}
