import { NextResponse, type NextRequest } from "next/server";
import {
  createSilidServerClient,
  isPlatformAdminClaims,
  readAppClaims,
} from "@silid/auth";

/**
 * Layer 2 route guarding (spec/multi-tenancy.md §3) on Next.js 16's Proxy
 * convention (the renamed middleware). Refreshes the managed session and
 * resolves the caller's claims — the guard is user experience only; RLS
 * stays the boundary. A signed-in non-platform visitor gets an explicit
 * 403 rather than a redirect, so no guard loop can trap them.
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
  const isSignin = path.startsWith("/signin");

  if (!claims && !isSignin) {
    const url = request.nextUrl.clone();
    url.pathname = "/signin";
    return NextResponse.redirect(url);
  }

  if (claims && !isPlatformAdminClaims(claims) && !isSignin) {
    return new NextResponse(
      "Not authorized: the Platform Admin portal is restricted to the operator role.",
      { status: 403 },
    );
  }

  return supabaseResponse;
}
