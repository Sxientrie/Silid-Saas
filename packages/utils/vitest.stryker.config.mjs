// Minimal vitest config for Stryker's command-runner sandbox (Phase 02
// pattern, shared by db/api/schemas/offline-sync). Zero imports so the
// sandboxed run has nothing to resolve through the Windows node_modules
// symlink; options nested under `test` on purpose (a flat object is
// silently ignored by vitest 5.0.1 — see packages/offline-sync's copy).
export default {
  test: {
    include: ['test/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/.stryker-tmp/**'],
  },
};
