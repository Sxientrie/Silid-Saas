import { NextResponse, type NextRequest } from "next/server";
import { createSilidServerClient, readAppClaims } from "@silid/auth";
import { canOpenSurface } from "@/lib/desk-navigation";
import { requiresSession } from "./guard-scope";

/**
 * Layer 2 route guarding (spec/multi-tenancy.md §3, spec/authentication.md
 * §3) on Next.js 16's Proxy convention. Refreshes the managed session and
 * resolves the caller's claims from `app_metadata`, then asks the same
 * surface table the navigation renders from. A signed-in visitor whose role
 * cannot open a surface gets an explicit 403 rather than a redirect, so no
 * guard loop can trap them.
 */

/**
 * HARNESS-ONLY. The offline proof has to run on a desk with no session and no
 * reachable server: queueing a write needs no identity, and the whole point of
 * the battery is the outage (roadmap 05 Deliverable 6). The exemption itself
 * is a path prefix rather than a flag — see ./guard-scope.
 */

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createSilidServerClient({
    getAll() {
      return request.cookies.getAll();
    },
    setAll(cookiesToSet) {
      cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
      supabaseResponse = NextResponse.next({ request });
      cookiesToSet.forEach(({ name, value, options }) =>
        supabaseResponse.cookies.set(name, value, options),
      );
    },
  });

  // getClaims() validates the JWT signature — never trust getSession() here.
  const { data } = await supabase.auth.getClaims();
  const claims = readAppClaims(data?.claims ?? null);

  const path = request.nextUrl.pathname;
  const guarded = requiresSession(path);

  if (!claims && guarded) {
    const url = request.nextUrl.clone();
    url.pathname = "/signin";
    return NextResponse.redirect(url);
  }

  if (claims && guarded && !canOpenSurface(path, claims)) {
    return new NextResponse(
      `Not authorized: a ${claims.role} cannot open ${path} in the Frontdesk.`,
      { status: 403 },
    );
  }

  return supabaseResponse;
}
