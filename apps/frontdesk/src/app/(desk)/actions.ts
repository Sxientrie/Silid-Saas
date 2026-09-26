"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Sign-out is a server action rather than a client call so the session cookie
 * is cleared by a response the proxy then re-reads: a client-only sign-out
 * would leave the desk rendering one more frame as a signed-in shell.
 */
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/signin");
}
