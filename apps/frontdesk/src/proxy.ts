import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - icons (generated app icons, which the manifest and the launcher fetch
     *   without a session — a guard here would redirect the install request)
     * - serwist (the worker script itself: a redirected worker script arrives
     *   as HTML, and the browser refuses to register it)
     * - manifest.webmanifest (fetched by the launcher, unauthenticated)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|icons|serwist|manifest.webmanifest|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
