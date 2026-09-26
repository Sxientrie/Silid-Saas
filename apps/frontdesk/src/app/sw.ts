/// <reference lib="webworker" />

import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import {
  CacheableResponsePlugin,
  CacheFirst,
  ExpirationPlugin,
  NetworkFirst,
  NetworkOnly,
  Serwist,
} from "serwist";
import { defaultCache } from "@serwist/turbopack/worker";

/**
 * The Frontdesk service worker (spec/offline-sync.md §1): app-shell
 * precaching so the desk boots with no network at all, plus runtime caching
 * for the static assets and the read-only surfaces.
 *
 * The build injects the precache manifest here; `self.__SW_MANIFEST` is
 * replaced at build time by the Serwist route handler's esbuild pass
 * (see src/app/serwist/[path]/route.ts). Nothing hand-maintains the list.
 */
declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  // ORDER IS THE CONTRACT. Serwist evaluates `runtimeCaching` in array order
  // and registers the first matching route, discarding the rest
  // (serwist/dist/index.mjs: `for (const entry of runtimeCaching) { this.
  // registerCapture(...) }` -> `findMatchingRoute` returns the first match).
  // `defaultCache` ends in a catch-all same-origin NetworkFirst (`others`,
  // @serwist/turbopack/src/index.worker.ts), so it MUST be spread last or it
  // silently shadows every rule below it.
  runtimeCaching: [
    // The reachability probe. NetworkOnly on purpose: a cached 200 would make
    // a dead branch look connected, which is the one lie the connectivity
    // monitor must never tell (spec/offline-sync.md §5).
    {
      matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/harness/health"),
      handler: new NetworkOnly(),
    },
    // Immutable build output: the filename changes when the bytes change, so
    // a cache hit is always correct and the entry can be kept long.
    {
      matcher: ({ url }) => url.pathname.startsWith("/_next/static/"),
      handler: new CacheFirst({
        cacheName: "silid-next-static",
        plugins: [
          new CacheableResponsePlugin({ statuses: [0, 200] }),
          new ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 * 30 }),
        ],
      }),
    },
    // The read surface the desk mirrors into Dexie. NetworkFirst with a
    // short timeout window: a desk on a slow link paints the server's copy
    // when it arrives and never waits indefinitely, and an offline desk still
    // reads the last-synced payload the worker kept. The response carries the
    // server's own `servedAt`, so a cache hit is visibly older rather than
    // silently fresh.
    {
      matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/harness/read"),
      handler: new NetworkFirst({
        cacheName: "silid-harness-read",
        networkTimeoutSeconds: 5,
        plugins: [
          new CacheableResponsePlugin({ statuses: [200] }),
          new ExpirationPlugin({ maxEntries: 16, maxAgeSeconds: 60 * 60 * 24 }),
        ],
      }),
    },
    // Last, and deliberately so: defaultCache carries the `pages` NetworkFirst
    // for HTML navigations, which is what lets a cold boot render the shell
    // with no network after one worker-controlled visit.
    ...defaultCache,
  ],
});

serwist.addEventListeners();
