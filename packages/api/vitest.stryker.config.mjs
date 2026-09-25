// Minimal vitest config for Stryker's command-runner sandbox (Phase 02
// pattern, shared by db/api/schemas). The sandboxed copy of vitest.config.ts
// resolves "vitest/config" unreliably through the node_modules symlink on
// Windows hosts, and vitest 5.0.1 exits 0 on that config startup error —
// which made every mutant "survive" regardless of the tests. This file has
// zero imports, so the sandboxed run has nothing to resolve. Excluded: the
// live contract tests (env-gated integration proofs, not mutation targets)
// and the no-re-typed-pesos grep test (it probes the REAL workspace tree on
// disk; inside the sandbox copy its relative paths are meaningless).
export default {
  include: ['test/**/*.test.ts'],
  exclude: ['test/contract.live.test.ts', 'test/catalogue.test.ts', '**/node_modules/**', '**/.stryker-tmp/**'],
};
