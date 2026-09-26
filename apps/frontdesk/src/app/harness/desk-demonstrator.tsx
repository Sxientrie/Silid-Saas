"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  SilidOfflineDb,
  countPendingMoneyEntries,
  createConnectivityMonitor,
  createReachabilityProbe,
  drain,
  evaluateOnlineOnly,
  runReconnect,
  submitWrite,
  type OnlineOnlyAction,
  type OnlineOnlyVerdict,
  type OutboxEntry,
} from "@silid/offline-sync";
import { createHarnessTransport } from "@/lib/harness/transport";
import { harnessReadSchema, type HarnessRead } from "@/lib/harness/read";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

/**
 * HARNESS-ONLY. The demonstrator the offline proof clips are recorded
 * against (roadmap 05 Deliverable 6).
 *
 * It is the whole contract on one screen: the desk's reachability verdict, the
 * durable outbox, the drain, the reconnection order, and the online-only gate.
 * Every control carries a `data-testid` because the proof is a video of this
 * screen reacting, not a log line — a test that cannot read the verdict cannot
 * prove the gate blocked anything.
 *
 * There is no business feature here and none may be added: this surface exists
 * to prove the queue, and a peso on it would be a peso with no ledger behind
 * it.
 */

const db = new SilidOfflineDb();
const send = createHarnessTransport();
const probe = createReachabilityProbe("/harness/health");

/** The online-only actions, in the order `spec/offline-sync.md` §3 lists them. */
const GATE_ACTIONS: readonly OnlineOnlyAction[] = [
  "shift_open",
  "shift_close",
  "void_session",
  "update_rate_config",
];

const ACCEPT_LOG_ENDPOINT = "/harness/accept-log";
const READ_ENDPOINT = "/harness/read";

/** The desk reads its own run's ledger, never a process-wide count. */
function readUrl(run: string): string {
  return `${READ_ENDPOINT}?run=${encodeURIComponent(run)}`;
}

type Verdict = { action: string; allowed: boolean; code?: string; reason: string };

/** The desk's own action counter, which is what the ordered-drain proof reads. */
function seqOf(entry: OutboxEntry): number {
  const payload = entry.payload as { seq?: number } | null;
  return payload?.seq ?? -1;
}

export function DeskDemonstrator({ run }: { run: string }) {
  const [online, setOnline] = useState<boolean | undefined>(undefined);
  const [note, setNote] = useState("desk demonstrator");
  const [seq, setSeq] = useState(0);
  const [status, setStatus] = useState("idle");
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [acceptLog, setAcceptLog] = useState<
    { seq: number; receivedAt: string; clientEnqueuedAt: string }[]
  >([]);
  const [cache, setCache] = useState<{ servedAt: string; acceptedCount: number } | null>(null);
  const [inject, setInject] = useState<"none" | "reject" | "unavailable">("none");

  const monitor = useMemo(
    () =>
      createConnectivityMonitor({
        probe,
        onChange: setOnline,
      }),
    [],
  );

  useEffect(() => {
    monitor.start();
    void monitor.checkNow();
    return () => monitor.stop();
  }, [monitor]);

  // The outbox is a live view, not local state: a queued write is durable
  // before this render happens, and a reload re-reads the same rows.
  const rows = useLiveQuery(() => db.outbox.orderBy("id").toArray(), []) ?? [];
  const pendingMoney = useLiveQuery(() => countPendingMoneyEntries(db), []) ?? 0;
  const cachedRooms = useLiveQuery(() => db.rooms.orderBy("roomNumber").toArray(), []) ?? [];

  const refreshAcceptLog = useCallback(async () => {
    const response = await fetch(
      `${ACCEPT_LOG_ENDPOINT}?run=${encodeURIComponent(run)}`,
      { cache: "no-store" },
    );
    if (!response.ok) return;
    const body = (await response.json()) as {
      rows: { seq: number; receivedAt: string; clientEnqueuedAt: string }[];
    };
    setAcceptLog(body.rows);
  }, [run]);

  const readFromServer = useCallback(async () => {
    const response = await fetch(readUrl(run), { cache: "no-store" });
    if (!response.ok) throw new Error(`harness read refused with ${response.status}`);
    const body = harnessReadSchema.parse(await response.json());
    await mirrorRooms(body);
    setCache({ servedAt: body.servedAt, acceptedCount: body.acceptedCount });
  }, [run]);

  async function queueNote(moneyAffecting = false) {
    const next = seq + 1;
    setSeq(next);
    setStatus("queueing…");
    const outcome = await submitWrite(db, {
      procedure: "harness_note",
      payload: { run, seq: next, note, ...(inject === "none" ? {} : { inject }) },
      send,
      isOnline: () => monitor.isOnline(),
      moneyAffecting,
    });
    setStatus(
      outcome.status === "confirmed"
        ? `confirmed by the server (seq ${next})`
        : `queued durably (seq ${next}) — IndexedDB holds it before this line appears`,
    );
    await refreshAcceptLog();
  }

  async function runDrain() {
    setStatus("draining…");
    const result = await drain(db, send);
    setStatus(
      `drained ${result.drained}, poisoned ${result.poisoned}, remaining ${result.remaining}` +
        (result.stoppedByTransport ? " — stopped: the server was unreachable" : ""),
    );
    await refreshAcceptLog();
  }

  async function runReconnectNow() {
    setStatus("reconnecting: drain first, then refresh…");
    const result = await runReconnect({
      drainOutbox: () => drain(db, send),
      refreshCaches: readFromServer,
    });
    setLastSyncedAt(result.lastSyncedAt ?? null);
    setStatus(
      result.live
        ? `live again — drained ${result.drained}, caches refreshed, last synced ${result.lastSyncedAt}`
        : `not live: ${result.remaining} still queued, caches left exactly as they were`,
    );
    await refreshAcceptLog();
  }

  async function checkGate(action: OnlineOnlyAction) {
    const result: OnlineOnlyVerdict = evaluateOnlineOnly(action, {
      online: monitor.isOnline(),
      pendingMoneyEntries: await countPendingMoneyEntries(db),
    });
    setVerdict({
      action,
      allowed: result.allowed,
      ...(result.allowed ? {} : { code: result.code }),
      reason: result.allowed
        ? `${action} may run: the ledger the server would seal is complete.`
        : result.reason,
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-3">
            Connectivity
            <Badge data-testid="connectivity-badge" variant={online ? "default" : "destructive"}>
              {online === undefined ? "not yet probed" : online ? "online" : "offline"}
            </Badge>
          </CardTitle>
          <CardDescription>
            The badge is the probe&apos;s verdict, never <code>navigator.onLine</code>: an{" "}
            <code>online</code> event is confirmed by a HEAD to <code>/harness/health</code>, which
            the service worker refuses to cache.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button
            data-testid="probe-now"
            variant="outline"
            onClick={() => void monitor.checkNow()}
          >
            Probe now
          </Button>
          <p className="text-sm text-muted-foreground">
            last synced: <span data-testid="last-synced">{lastSyncedAt ?? "never"}</span>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Outbox</CardTitle>
          <CardDescription>
            These rows are in IndexedDB, not in this page. They are written before the status line
            says anything, and they survive a reload. The money-affecting button sets only the{" "}
            <code>moneyAffecting</code> flag the online-only gate reads — the write still carries no
            amount, because this double holds no money and a peso here would have no ledger behind
            it.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="note">Note</Label>
              <Input
                id="note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className="w-56"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="inject">
                Server fault (applied when the write is queued, since a replay
                carries the payload it was queued with)
              </Label>
              <select
                id="inject"
                data-testid="inject"
                value={inject}
                onChange={(event) => setInject(event.target.value as typeof inject)}
                className="h-9 rounded-md border bg-transparent px-3 text-sm"
              >
                <option value="none">none</option>
                <option value="reject">reachable server says no (409)</option>
                <option value="unavailable">proxy cannot reach the app (503)</option>
              </select>
            </div>
            <Button data-testid="queue-note" onClick={() => void queueNote()}>
              Queue a note
            </Button>
            <Button
              data-testid="queue-money"
              variant="secondary"
              onClick={() => void queueNote(true)}
            >
              Queue a money-affecting write
            </Button>
            <Button data-testid="drain" variant="outline" onClick={() => void runDrain()}>
              Drain
            </Button>
            <Button data-testid="reconnect" variant="outline" onClick={() => void runReconnectNow()}>
              Reconnect
            </Button>
            <Button
              data-testid="clear"
              variant="ghost"
              onClick={() => {
                void db.outbox.clear().then(() => setStatus("outbox cleared"));
              }}
            >
              Clear
            </Button>
          </div>

          <p data-testid="status" className="text-sm">
            {status}
          </p>

          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-muted-foreground">
                <th className="py-1">seq</th>
                <th className="py-1">procedure</th>
                <th className="py-1">state</th>
                <th className="py-1">attempts</th>
                <th className="py-1">enqueued at (client)</th>
                <th className="py-1">last error</th>
              </tr>
            </thead>
            <tbody data-testid="outbox-rows">
              {rows.map((row) => (
                <tr key={row.id} data-testid={`outbox-row-${seqOf(row)}`}>
                  <td className="py-1">{seqOf(row)}</td>
                  <td className="py-1">{row.procedure}</td>
                  <td className="py-1">{row.state}</td>
                  <td className="py-1">{row.attempts}</td>
                  <td className="py-1">{row.enqueuedAt}</td>
                  <td className="py-1">{row.lastError ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Online-only gate</CardTitle>
          <CardDescription>
            Shift open and shift close are sealed by the server with the full ledger visible, so
            they are blocked while the desk is offline or while money-affecting writes are still
            queued. Pending money-affecting writes right now:{" "}
            <span data-testid="pending-money">{pendingMoney}</span>.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {GATE_ACTIONS.map((action) => (
              <Button
                key={action}
                data-testid={`gate-${action}`}
                variant="outline"
                onClick={() => void checkGate(action)}
              >
                {action}
              </Button>
            ))}
          </div>
          <Separator />
          <p data-testid="gate-verdict" className="text-sm">
            {verdict
              ? `${verdict.action}: ${verdict.allowed ? "ALLOWED" : `BLOCKED (${verdict.code})`} — ${verdict.reason}`
              : "no action attempted yet"}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Read cache</CardTitle>
          <CardDescription>
            Rooms mirrored into IndexedDB. A stale payload is visibly stale:{" "}
            <code>servedAt</code> is the server&apos;s own instant, sealed when it was read.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              data-testid="refresh-caches"
              variant="outline"
              onClick={() => void readFromServer()}
            >
              Refresh caches
            </Button>
            <p className="text-sm text-muted-foreground">
              served at <span data-testid="cache-served-at">{cache?.servedAt ?? "never"}</span> —
              the server ledger holds{" "}
              <span data-testid="cache-accepted-count">{cache?.acceptedCount ?? 0}</span> accepted
              write(s)
            </p>
          </div>
          <ul data-testid="cached-rooms" className="text-sm">
            {cachedRooms.map((room) => (
              <li key={room.id} data-testid={`cached-room-${room.roomNumber}`}>
                {room.roomNumber} — {room.status} (cached {room.cachedAt})
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Server accept log</CardTitle>
          <CardDescription>
            What the server actually took, in arrival order, for run <code>{run}</code>. The
            desk&apos;s instant survives only as client metadata.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-muted-foreground">
                <th className="py-1">seq</th>
                <th className="py-1">received at (server)</th>
                <th className="py-1">enqueued at (client)</th>
              </tr>
            </thead>
            <tbody data-testid="accept-log">
              {acceptLog.map((row) => (
                <tr key={`${row.seq}-${row.receivedAt}`} data-testid={`accept-row-${row.seq}`}>
                  <td className="py-1">{row.seq}</td>
                  <td className="py-1">{row.receivedAt}</td>
                  <td className="py-1">{row.clientEnqueuedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * The read cache, written. Rooms only: rate configuration and catalogue
 * prices are money and have no source in this phase
 * (`packages/offline-sync/src/db.ts` carries the tables for later).
 */
async function mirrorRooms(read: HarnessRead): Promise<void> {
  await db.transaction("rw", db.rooms, async () => {
    for (const room of read.rooms) {
      await db.rooms.put({
        id: room.id,
        branchId: HARNESS_BRANCH,
        roomNumber: room.roomNumber,
        status: room.status,
        cachedAt: read.servedAt,
      });
    }
  });
}

/** HARNESS-ONLY. The cache rows belong to a stand-in branch, not a real one. */
const HARNESS_BRANCH = "00000000-0000-0000-0000-0000000000ff";
