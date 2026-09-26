"use client";

import { createSilidBrowserClient } from "@silid/auth";

/** Browser Supabase client for client components. */
export function createClient() {
  return createSilidBrowserClient();
}
