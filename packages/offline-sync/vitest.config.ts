import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Dexie needs a real IndexedDB implementation; fake-indexeddb supplies
    // one in-memory. It is installed globally by a setup file rather than
    // imported by each test, and vitest.stryker.config.mjs has to repeat the
    // setupFiles entry because the mutation sandbox runs that config instead
    // of this one.
    setupFiles: ["./test/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**"],
      thresholds: { lines: 80 },
    },
  },
});
