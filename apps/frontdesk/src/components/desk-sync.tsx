"use client";

import { useQueryClient } from "@tanstack/react-query";
import { countPendingMoneyEntries, runReconnect } from "@silid/offline-sync";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { deskDb } from "@/lib/offline/desk-db";
import { deskTrpc, useDeskConnectivity } from "@/lib/trpc/desk";
import { createDeskWriteSender } from "@/features/sessions/sessions.remote";

/**
 * The desk's offline surface (spec/offline-sync.md §5): the reachability
 * verdict, the outbox state, and the reconnection path — drain the outbox
 * FIRST, refresh the read caches SECOND. The monitor's probe (not
 * `navigator.onLine`) is the authority, and the browser's online event fires
 * the same runReconnect automatically; the button exists so the desk (and the
 * proof clips) can drive the path deterministically.
 */

export function DeskSyncBar() {
  const queryClient = useQueryClient();
  const connectivity = useDeskConnectivity();
  const [pendingMoney, setPendingMoney] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<string>("never");
  const [status, setStatus] = useState<string>("");

  const sender = useMemo(() => createDeskWriteSender(deskTrpc()), []);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const count = await countPendingMoneyEntries(deskDb());
      if (!cancelled) setPendingMoney(count);
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [connectivity.online]);

  async function reconnect(): Promise<void> {
    const online = await connectivity.checkNow();
    if (!online) {
      setStatus("offline — nothing to drain");
      return;
    }
    const result = await runReconnect({
      drainOutbox: () => import("@silid/offline-sync").then(({ drain }) => drain(deskDb(), sender)),
      refreshCaches: async () => {
        await queryClient.invalidateQueries();
      },
    });
    if (result.live) {
      setLastSyncedAt(result.lastSyncedAt ?? new Date().toISOString());
      setStatus(result.poisoned > 0 ? `live — drained ${result.drained}, ${result.poisoned} rejected (see the outbox below)` : `live — drained ${result.drained}`);
    } else if (result.poisoned > 0) {
      // The drain REACHED the server — the rejections happened there — so the
      // link is back even though rejected rows keep the outbox non-empty.
      // (Poisoned rows are excluded from future drains: they are a stuck
      // entry for a human, not a pending write.)
      setLastSyncedAt(new Date().toISOString());
      setStatus(`live — drained ${result.drained}, ${result.poisoned} rejected (see the outbox below)`);
    } else {
      setStatus(`still offline — drained ${result.drained}, ${result.remaining} left queued`);
    }
    await queryClient.invalidateQueries();
  }

  useEffect(() => {
    const onOnline = () => void reconnect();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div data-testid="desk-sync-bar" className="flex items-center gap-3 text-sm">
      <span data-testid="sync-connectivity" className="font-medium">
        {connectivity.online ? "online" : "offline"}
      </span>
      <span data-testid="sync-pending-money">queued money writes: {pendingMoney}</span>
      <span data-testid="sync-last-synced">last synced: {lastSyncedAt}</span>
      <Button variant="outline" data-testid="sync-reconnect" onClick={() => void reconnect()}>
        Reconnect now
      </Button>
      {status !== "" ? (
        <span data-testid="sync-status" className="text-muted-foreground">
          {status}
        </span>
      ) : null}
    </div>
  );
}

/**
 * The outbox rows, surfaced so a stuck entry is visible to the desk rather
 * than silently lost (spec/offline-sync.md §2.4).
 */
export function DeskOutboxRows() {
  const [rows, setRows] = useState<Array<{ key: string; procedure: string; state: string; lastError?: string }>>([]);

  useEffect(() => {
    let cancelled = false;
    const read = async () => {
      const entries = await deskDb().outbox.toArray();
      if (!cancelled) {
        setRows(
          entries.map((entry) => ({
            key: `${entry.id ?? entry.idempotencyKey}`,
            procedure: entry.procedure,
            state: entry.state,
            lastError: entry.lastError,
          })),
        );
      }
    };
    void read();
    const timer = window.setInterval(() => void read(), 2_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  if (rows.length === 0) {
    return <p data-testid="outbox-empty" className="text-sm text-muted-foreground">Outbox empty.</p>;
  }

  return (
    <div data-testid="desk-outbox" className="flex flex-col gap-1 text-sm">
      {rows.map((row) => (
        <div key={row.key} data-testid={`desk-outbox-row-${row.key}`} className="rounded-md border px-3 py-2">
          <span className="font-medium">{row.procedure}</span> — {row.state}
          {row.lastError !== undefined ? (
            <span data-testid={`desk-outbox-error-${row.key}`} className="ml-2 text-red-600">
              {row.lastError}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
