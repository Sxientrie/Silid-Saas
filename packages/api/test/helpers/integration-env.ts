/**
 * Loads the gitignored root .env.local into process.env for integration
 * tests that run against the linked Supabase project. Existing process.env
 * values always win. (Same contract as packages/auth's test helper; this
 * package's copy keeps the test trees independent.)
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export function loadLocalEnv(relativeTo = process.cwd()): void {
  const candidates = [resolve(relativeTo, ".env.local"), resolve(relativeTo, "../../.env.local")];
  for (const path of candidates) {
    try {
      const raw = readFileSync(path, "utf8");
      for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq < 1) continue;
        const key = trimmed.slice(0, eq).trim();
        const value = trimmed.slice(eq + 1).trim();
        if (!(key in process.env)) process.env[key] = value;
      }
      return;
    } catch {
      // try the next candidate
    }
  }
}

export function integrationEnv() {
  loadLocalEnv();
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ready = Boolean(supabaseUrl && publishableKey && serviceKey);
  return { supabaseUrl, publishableKey, serviceKey, ready };
}
