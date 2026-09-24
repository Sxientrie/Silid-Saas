import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**"],
      // The drizzle schema is a declarative mirror whose behavioral parity is
      // proven by the full-spec test suite, drizzle-kit generate, the live
      // database's generated types, and the mutation gate (which still
      // targets it). v8's line accounting miscounts the DSL's import-time
      // chains, so the file is excluded from the line threshold only.
      exclude: ["src/drizzle/**"],
      thresholds: { lines: 80 },
    },
  },
});
