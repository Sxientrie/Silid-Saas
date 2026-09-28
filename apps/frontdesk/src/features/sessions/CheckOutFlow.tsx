"use client";

import { useState } from "react";
import type { SessionView } from "@silid/schemas";
import { formatPeso } from "@silid/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useCheckOut } from "./use-sessions";

/**
 * The check-out flow (spec/applications.md §3, vault-11): the desk reviews the
 * session's server-held facts, confirms, and the ONE server transaction seals
 * base, surcharge, posted add-ons, and the extension deficit, then releases
 * the room. The desk then displays the sealed total the SERVER returned — a
 * figure rendered after the seal, and un-corruptible by construction: the
 * confirm action sends the session id alone, so no client figure exists for
 * the server to read even if the display were tampered with.
 */

export interface CheckOutFlowProps {
  sessions: SessionView[];
  /** roomId → room number, so the picker shows the desk's own naming. */
  roomNumbers?: Record<string, string>;
  onDone?: () => void;
}

export function CheckOutFlow({ sessions, roomNumbers = {}, onDone }: CheckOutFlowProps) {
  const [selected, setSelected] = useState<string>("");
  const { checkOut, state, reset } = useCheckOut();

  const active = sessions.filter((session) => session.status === "active");
  const session = active.find((candidate) => candidate.id === selected);

  async function confirm(): Promise<void> {
    if (session === undefined) return;
    await checkOut({ sessionId: session.id });
    setSelected("");
    onDone?.();
  }

  return (
    <Card data-testid="check-out-flow">
      <CardHeader>
        <CardTitle>Check out</CardTitle>
        <CardDescription>
          The server seals the total in one transaction — the desk reviews facts, never prices.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium" htmlFor="check-out-session">
            Session
          </label>
          <select
            id="check-out-session"
            data-testid="check-out-session"
            value={selected}
            onChange={(event) => {
              setSelected(event.target.value);
              reset();
            }}
            className="rounded-md border bg-background px-3 py-2 text-sm"
          >
            <option value="">Pick an active session</option>
            {active.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {roomNumbers[candidate.roomId] !== undefined
                  ? `Room ${roomNumbers[candidate.roomId]}`
                  : "Room"}{" "}
                — {candidate.bookingType === "overnight" ? "overnight" : "short time"}, {candidate.pax} pax
              </option>
            ))}
          </select>
        </div>

        {session !== undefined ? (
          <div data-testid="check-out-facts" className="rounded-md border p-3 text-sm">
            <p>Stay: {session.bookingType === "overnight" ? "overnight" : "short time"}</p>
            <p>Guests: {session.pax}</p>
            <p>Checked in (server time): {new Date(session.checkedInAt).toLocaleString()}</p>
            <p>Booked end (server time): {new Date(session.bookedEndAt).toLocaleString()}</p>
          </div>
        ) : null}

        <div className="flex items-center gap-3">
          <Button data-testid="check-out-confirm" onClick={() => void confirm()} disabled={session === undefined}>
            Confirm check-out
          </Button>
          {state.status === "sealed" ? (
            <span data-testid="check-out-sealed-total" className="text-sm font-semibold">
              Sealed total {formatPeso(Number(state.sealedTotal ?? "0"))}
            </span>
          ) : null}
          {state.status === "queued" ? (
            <span data-testid="check-out-queued" className="text-sm text-muted-foreground">
              {state.message ?? "queued"}
            </span>
          ) : null}
          {state.status === "error" ? (
            <span data-testid="check-out-error" className="text-sm text-red-600">
              {state.message}
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
