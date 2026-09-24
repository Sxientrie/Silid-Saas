/**
 * Client-exposed configuration only: the project URL and the publishable
 * key. No secret or service_role key is ever read here — client-exposed
 * env vars reach the browser by definition (spec/supabase.md §5).
 */
export function supabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured");
  }
  return url;
}

export function supabasePublishableKey(): string {
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY) is not configured",
    );
  }
  return key;
}
