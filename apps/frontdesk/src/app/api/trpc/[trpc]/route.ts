import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter, createTrpcContext } from "@silid/api";
import { createClient } from "@/lib/supabase/server";

/**
 * The Frontdesk's tRPC HTTP endpoint: every procedure resolves scope from the
 * VERIFIED session claims (Layer 1, spec/multi-tenancy.md §3) and its data
 * client runs as the caller, so RLS stays the non-bypassable backstop.
 *
 * The access token is read from the managed cookie session, then VERIFIED
 * inside createTrpcContext (auth.getClaims — the JWT-signature-validated
 * path). getSession() is not trusted for any authorization decision here; it
 * only surfaces the token the context then verifies.
 */
async function handler(request: Request): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: request,
    router: appRouter,
    createContext: () =>
      createTrpcContext({
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
        publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
        accessToken: session?.access_token ?? null,
      }),
  });
}

export { handler as GET, handler as POST };
