"use client";

import { useMemo, useState } from "react";
import { BOOKING_TYPES } from "@silid/schemas";
import type { RoomView } from "@silid/schemas";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCheckIn } from "./use-sessions";

/**
 * The check-in form (spec/applications.md §3, vault-10): the first vacant
 * room preselected with a one-tap override, stay type, guest count — and a
 * payment-confirmation step that gates the submit, because the house rule is
 * absolute: full payment before check-in, no partials, no deferred, no
 * refunds (spec/domain-rules.md §2). The cashier never types an amount: there
 * is no money input on this form, by construction.
 */

export interface CheckInFormProps {
  rooms: RoomView[];
  onDone?: () => void;
}

export function CheckInForm({ rooms, onDone }: CheckInFormProps) {
  const vacant = useMemo(() => rooms.filter((room) => room.status === "vacant"), [rooms]);
  const [roomId, setRoomId] = useState("");
  const [bookingType, setBookingType] = useState<(typeof BOOKING_TYPES)[number]>("short_time");
  const [pax, setPax] = useState(2);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const { checkIn, state, reset } = useCheckIn();

  // Default to the first vacant room until the cashier overrides.
  const effectiveRoomId = roomId !== "" ? roomId : vacant[0]?.id ?? "";

  const canSubmit = effectiveRoomId !== "" && pax >= 1 && paymentConfirmed && state.status !== "confirmed" && state.status !== "queued";

  async function onSubmit(): Promise<void> {
    if (!canSubmit) return;
    await checkIn({ roomId: effectiveRoomId, bookingType, pax });
    setPaymentConfirmed(false);
    onDone?.();
  }

  return (
    <Card data-testid="check-in-form">
      <CardHeader>
        <CardTitle>Check in</CardTitle>
        <CardDescription>
          Full payment is collected before check-in completes — no partials, no refunds. Time and
          money are sealed by the server.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="check-in-room">Room</Label>
          <select
            id="check-in-room"
            data-testid="check-in-room"
            value={effectiveRoomId}
            onChange={(event) => setRoomId(event.target.value)}
            className="rounded-md border bg-background px-3 py-2 text-sm"
          >
            {vacant.length === 0 ? <option value="">No vacant rooms</option> : null}
            {vacant.map((room) => (
              <option key={room.id} value={room.id}>
                Room {room.roomNumber}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="check-in-stay">Stay type</Label>
          <select
            id="check-in-stay"
            data-testid="check-in-stay"
            value={bookingType}
            onChange={(event) => setBookingType(event.target.value as (typeof BOOKING_TYPES)[number])}
            className="rounded-md border bg-background px-3 py-2 text-sm"
          >
            <option value="short_time">Short time (3 hours)</option>
            <option value="overnight">Overnight (12 hours)</option>
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="check-in-pax">Guests</Label>
          <Input
            id="check-in-pax"
            data-testid="check-in-pax"
            type="number"
            min={1}
            step={1}
            value={Number.isFinite(pax) ? String(pax) : ""}
            onChange={(event) => {
              const parsed = Number.parseInt(event.target.value, 10);
              setPax(Number.isNaN(parsed) ? 0 : parsed);
            }}
          />
        </div>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            data-testid="check-in-payment"
            checked={paymentConfirmed}
            onChange={(event) => setPaymentConfirmed(event.target.checked)}
            className="mt-0.5"
          />
          <span>
            Full payment collected — <strong>₱ figure is computed and sealed by the server</strong>;
            this desk never prices the stay.
          </span>
        </label>

        <div className="flex items-center gap-3">
          <Button data-testid="check-in-submit" onClick={() => void onSubmit()} disabled={!canSubmit}>
            Check in
          </Button>
          {state.status !== "idle" ? (
            <span
              data-testid="check-in-status"
              className={state.status === "error" ? "text-sm text-red-600" : "text-sm text-muted-foreground"}
            >
              {state.status === "confirmed"
                ? (state.message ?? "checked in")
                : state.status === "queued"
                  ? (state.message ?? "queued")
                  : state.status === "error"
                    ? (state.message ?? "rejected")
                    : ""}
            </span>
          ) : null}
        </div>
        {state.status === "error" ? (
          <Button variant="outline" data-testid="check-in-dismiss" onClick={reset}>
            Dismiss
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
