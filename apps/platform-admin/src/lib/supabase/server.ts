import { cookies } from "next/headers";
import { createSilidServerClient } from "@silid/auth";

export async function createClient() {
  const cookieStore = await cookies();
  return createSilidServerClient({
    getAll() {
      return cookieStore.getAll();
    },
    setAll(cookiesToSet) {
      try {
        cookiesToSet.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options),
        );
      } catch {
        // Called from a Server Component: cookie writes happen in the
        // proxy, which refreshes sessions on every request.
      }
    },
  });
}
