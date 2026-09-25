import Link from "next/link";
import { isPlatformAdminClaims, readAppClaims } from "@silid/auth";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";
import { Button } from "@/components/ui/button";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = readAppClaims(data?.claims ?? null);
  const email = typeof data?.claims?.email === "string" ? data.claims.email : null;

  if (!claims || !isPlatformAdminClaims(claims)) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-zinc-50 p-6 dark:bg-black">
        <h1 className="text-xl font-semibold">Not authorized</h1>
        <p className="max-w-md text-center text-sm text-zinc-600 dark:text-zinc-400">
          The Platform Admin portal is restricted to the operator role. The
          Frontdesk application is where organization work happens.
        </p>
        <form action={signOut}>
          <Button type="submit" variant="outline">
            Sign out
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-3 dark:border-zinc-800 dark:bg-zinc-950">
        <Link href="/" className="text-sm font-semibold">
          Silid Platform Admin
        </Link>
        <div className="flex items-center gap-3 text-sm text-zinc-600 dark:text-zinc-400">
          <span>{email}</span>
          <form action={signOut}>
            <Button type="submit" variant="outline" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 p-6">{children}</main>
    </div>
  );
}
