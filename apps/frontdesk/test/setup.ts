/**
 * Dexie is an IndexedDB wrapper, so the unit suite needs an IndexedDB —
 * same contract as packages/offline-sync's setup (fake-indexeddb/auto
 * installs a spec-shaped in-memory implementation onto the globals; the real
 * Dexie code runs unmodified).
 */
import "fake-indexeddb/auto";
