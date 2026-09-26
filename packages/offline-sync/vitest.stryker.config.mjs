// Minimal vitest config for Stryker's command-runner sandbox (Phase 02
// pattern, shared by db/api/schemas). The sandboxed copy of vitest.config.ts
// resolves "vitest/config" unreliably through the node_modules symlink on
// Windows hosts, and vitest 5.0.1 exits 0 on that config startup error —
// which made every mutant "survive" regardless of the tests. This file has
// zero imports, so the sandboxed run has nothing to resolve.
//
// The options are nested under `test` on purpose. A FLAT object
// ({ include, setupFiles, exclude } at the root) is silently ignored by
// vitest 5.0.1 — verified on this host: the run then uses vitest's own
// defaults, which is why the dry run below collects the sandbox copies of
// every test file. setupFiles being ignored is what made Dexie find no
// IndexedDB in the dry run; the nested form loads fake-indexeddb.
export default {
  test: {
    include: ['test/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
    exclude: ['**/node_modules/**', '**/.stryker-tmp/**'],
  },
};
