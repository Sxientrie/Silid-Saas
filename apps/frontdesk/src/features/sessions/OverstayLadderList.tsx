"use client";

import { useMemo } from "react";
import type { SessionView } from "@silid/schemas";
import type { OverstayTriple } from "@silid/schemas";
import { formatPeso, overstayLadder, type LadderReading } from "@silid/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * The overstay ladder display (roadmap 06 Deliverable 4; spec/applications.md
 * §3 Dashboard). Every active session is placed on the booked/grace/overdue
 * ladder from its OWN timestamps — pure display math per vault-05/06 — with
 * overdue rooms floating to the top and the accruing DISPLAY figure shown.
 * The figure is display-only: the authoritative extension money is sealed
 * exclusively at checkout (vault-11, spec/domain-rules.md §3.2), and garbage
 * timestamps degrade to the booked-phase zeros, never to NaN money
 * (spec/domain-rules.md §3.4).
 */

export interface OverstayLadderListProps {
  sessions: SessionView[];
  roomNumbers?: Record<string, string>;
  /** The branch's §3.3 triple (read server-side, garbage already fallen back). */
  overstay: OverstayTriple;
  now?: () => Date;
}

export interface LadderEntry {
  session: SessionView;
  reading: LadderReading;
}

/** Place every active session on the ladder and sort overdue to the top. */
export function placeOnLadder(
  sessions: SessionView[],
  overstay: OverstayTriple,
  now: () => Date = (): Date => new Date(),
): LadderEntry[] {
  const rank = { overdue: 0, grace: 1, booked: 2 } as const;
  return sessions
    .filter((session) => session.status === "active")
    .map((session) => ({
      session,
      reading: overstayLadder({
        now: now(),
        bookedEndAt: session.bookedEndAt,
        graceMinutes: overstay.graceMinutes,
        blockMinutes: overstay.blockMinutes,
        blockCharge: overstay.blockCharge,
      }),
    }))
    .sort((a, b) => {
      const byPhase = rank[a.reading.phase] - rank[b.reading.phase];
      if (byPhase !== 0) return byPhase;
      // Within a phase, the closest to expiring (or the deepest overdue) first.
      const aKey = a.reading.phase === "overdue" ? -a.reading.overdueMinutes : a.reading.graceMinutesLeft;
      const bKey = b.reading.phase === "overdue" ? -b.reading.overdueMinutes : b.reading.graceMinutesLeft;
      return aKey - bKey;
    });
}

const PHASE_LABEL: Record<LadderReading["phase"], string> = {
  booked: "booked",
  grace: "grace",
  overdue: "overdue",
};

export function OverstayLadderList({ sessions, roomNumbers = {}, overstay, now }: OverstayLadderListProps) {
  const entries = useMemo(() => placeOnLadder(sessions, overstay, now), [sessions, overstay, now]);

  return (
    <Card data-testid="overstay-ladder">
      <CardHeader>
        <CardTitle>Overstay ladder</CardTitle>
        <CardDescription>
          Accruing figures are display-only — extension pesos are sealed by the server at checkout.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {entries.length === 0 ? (
          <p data-testid="ladder-empty" className="text-sm text-muted-foreground">
            No active sessions on the ladder.
          </p>
        ) : null}
        {entries.map(({ session, reading }) => (
          <div
            key={session.id}
            data-testid={`ladder-entry-${session.id}`}
            className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
          >
            <span>
              {roomNumbers[session.roomId] !== undefined ? `Room ${roomNumbers[session.roomId]}` : "Room"} —{" "}
              {session.bookingType === "overnight" ? "overnight" : "short time"}, {session.pax} pax
            </span>
            <span className="flex items-center gap-2">
              <Badge data-testid={`ladder-phase-${session.id}`} variant={reading.phase === "overdue" ? "destructive" : "secondary"}>
                {PHASE_LABEL[reading.phase]}
              </Badge>
              {reading.phase === "grace" ? (
                <span data-testid={`ladder-detail-${session.id}`}>
                  {reading.graceMinutesLeft} min left
                </span>
              ) : null}
              {reading.phase === "overdue" ? (
                <span data-testid={`ladder-detail-${session.id}`}>
                  {reading.blocksAccrued === 0
                    ? "grace just closed"
                    : `accruing ${formatPeso(reading.accruingPhp)}`}
                </span>
              ) : null}
              {reading.phase === "booked" ? (
                <span data-testid={`ladder-detail-${session.id}`}>in stay</span>
              ) : null}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
