import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Mirrors tsconfig.json's `@/*` -> `./src/*`, so a unit test can import the
  // same module the route does instead of a copy of it reached by relative path.
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    include: ["test/**/*.test.{ts,tsx}"],
    setupFiles: ["./test/setup.ts"],
  },
});
