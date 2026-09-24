import { createServerClient } from "@supabase/ssr";
import { supabasePublishableKey, supabaseUrl } from "./env.js";

/**
 * The cookie adapter shape @supabase/ssr expects; the Next.js app supplies
 * it from next/headers (server components/actions) or from the request and
 * response objects (proxy route guarding).
 */
export interface CookieAdapter {
  getAll(): Array<{ name: string; value: string }>;
  setAll(cookies: Array<{ name: string; value: string; options?: Record<string, unknown> }>): void;
}

/**
 * Server Supabase client (server components, server actions, route
 * handlers, and the proxy). One client per request — the caller supplies
 * that request's cookie adapter.
 */
export function createSilidServerClient(cookies: CookieAdapter) {
  return createServerClient(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookies.setAll(cookiesToSet);
      },
    },
  });
}
