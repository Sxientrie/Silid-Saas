import { SilidOfflineDb } from "@silid/offline-sync";

/**
 * The desk machine's local layer, as a singleton per browser origin
 * (spec/offline-sync.md §1). The Dexie schema lives in @silid/offline-sync;
 * this module only decides WHEN the desk opens which instance, so tests can
 * pass their own in-memory instance while the app always shares one.
 */
let singleton: SilidOfflineDb | null = null;

export function deskDb(): SilidOfflineDb {
  if (singleton === null) {
    singleton = new SilidOfflineDb();
  }
  return singleton;
}

/** Test seam: replace the singleton (and close the previous one). */
export function setDeskDb(db: SilidOfflineDb | null): void {
  if (singleton !== null) {
    void singleton.close();
  }
  singleton = db;
}
