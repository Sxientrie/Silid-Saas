import { SignInForm } from "./sign-in-form";

/**
 * The Frontdesk sign-in (spec/authentication.md §5).
 *
 * The staff email domain is read here, on the server, and handed to the form
 * as a prop. It is deliberately *not* a `NEXT_PUBLIC_` variable: a public
 * variable is inlined into the client bundle, and the domain is configuration
 * this app reads, not something a desk machine supplies. A deployment with no
 * domain configured still renders — the form then accepts only full addresses
 * and says so, rather than guessing a domain the cashier never named.
 */
export default async function SignInPage() {
  const staffEmailDomain = process.env.SILID_STAFF_EMAIL_DOMAIN ?? null;

  return (
    <main className="flex flex-1 items-center justify-center bg-zinc-50 p-6 dark:bg-black">
      <SignInForm staffEmailDomain={staffEmailDomain} />
    </main>
  );
}
