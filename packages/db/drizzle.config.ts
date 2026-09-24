import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit is used ONLY to verify this package's ORM schema against the
 * migrations (generate into a throwaway, gitignored directory and inspect);
 * database migrations themselves are owned by the Supabase CLI/MCP
 * (spec/monorepo-structure.md §4). Nothing in ./.drizzle-kit-tmp is ever
 * committed or applied.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/drizzle/schema.ts",
  out: "./.drizzle-kit-tmp",
});
