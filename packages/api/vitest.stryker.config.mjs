// Minimal vitest config for Stryker's command-runner sandbox (Phase 02) —
// see packages/db/vitest.stryker.config.mjs for the rationale. Zero imports
// so the sandboxed run has nothing to resolve; passed via --config.
export default {
  include: ["test/**/*.test.ts"],
};
