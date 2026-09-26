/**
 * Dexie is an IndexedDB wrapper, so the unit suite needs an IndexedDB.
 * `fake-indexeddb/auto` installs a spec-shaped in-memory implementation
 * onto the globals Dexie looks for, which lets the real Dexie code (schema,
 * transactions, indexes, ordering) run unmodified under vitest.
 *
 * Nothing is stubbed here: the tests exercise Dexie itself, not a mock of it.
 */
import "fake-indexeddb/auto";
