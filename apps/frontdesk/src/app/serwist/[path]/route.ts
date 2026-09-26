import { createSerwistRoute } from "@serwist/turbopack";

/**
 * Serves the built service worker from /serwist/[path]. Serwist bundles
 * src/app/sw.ts with esbuild here and injects the precache manifest, so this
 * route is the only thing that has to know where the worker source lives.
 *
 * The option set is deliberately small: the schema here is a strict object,
 * and the worker's own behaviour (skipWaiting, clientsClaim, navigation
 * preload, runtime caching) belongs in src/app/sw.ts, not here. Globbing
 * keeps Serwist's defaults, which cover both the build output and public/.
 *
 * useNativeEsbuild is set explicitly instead of relying on the
 * platform-dependent default (`process.platform === "win32"` in
 * @serwist/turbopack 9.5.12): esbuild is the installed devDependency and
 * esbuild-wasm is not installed at all, so the default would be a coin-flip
 * on a Linux CI runner.
 */
export const { GET, generateStaticParams } = createSerwistRoute({
  swSrc: "src/app/sw.ts",
  useNativeEsbuild: true,
});
