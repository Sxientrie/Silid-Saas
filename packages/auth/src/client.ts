import { createBrowserClient } from "@supabase/ssr";
import { supabasePublishableKey, supabaseUrl } from "./env";

/**
 * Browser Supabase client (client components). createBrowserClient is a
 * singleton internally, so repeated calls share one instance. Session
 * storage and refresh stay entirely in Supabase Auth's managed clients —
 * no hand-rolled session logic (spec/authentication.md §2).
 */
export function createSilidBrowserClient() {
  return createBrowserClient(supabaseUrl(), supabasePublishableKey());
}
