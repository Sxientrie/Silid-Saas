"use client";

import { useMemo } from "react";
import type { RoomView } from "@silid/schemas";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * The room grid (roadmap 06 Deliverable 3; spec/applications.md §3). Every
 * tile renders the SERVER's status — the grid has no write path of any kind
 * (vault-15: check-in, the scheduled escalation job, and the checkout
 * transaction are the only status writers; no client code mutates room
 * status). The counts are computed from the same server rows.
 */

const STATUS_ORDER = ["vacant", "occupied", "grace", "overdue"] as const;

export interface RoomGridProps {
  rooms: RoomView[];
}

export function roomStatusCounts(rooms: RoomView[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const room of rooms) {
    counts[room.status] = (counts[room.status] ?? 0) + 1;
  }
  return counts;
}

export function RoomGrid({ rooms }: RoomGridProps) {
  const counts = useMemo(() => roomStatusCounts(rooms), [rooms]);
  const sorted = useMemo(
    () =>
      [...rooms].sort((a, b) =>
        a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }),
      ),
    [rooms],
  );

  return (
    <Card data-testid="room-grid">
      <CardHeader>
        <CardTitle>Rooms</CardTitle>
        <CardDescription>
          Status is the server&apos;s word only — check-in, escalation, and checkout write it; this
          grid never does.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div data-testid="room-status-counts" className="flex flex-wrap gap-2 text-sm">
          {STATUS_ORDER.map((status) => (
            <Badge key={status} data-testid={`room-count-${status}`} variant={status === "vacant" ? "secondary" : "destructive"}>
              {status}: {counts[status] ?? 0}
            </Badge>
          ))}
        </div>
        <div data-testid="room-tiles" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {sorted.map((room) => (
            <div
              key={room.id}
              data-testid={`room-tile-${room.roomNumber}`}
              data-room-status={room.status}
              className="rounded-md border px-3 py-2 text-sm"
            >
              <div className="font-medium">Room {room.roomNumber}</div>
              <div data-testid={`room-status-${room.roomNumber}`} className="text-muted-foreground">
                {room.status}
              </div>
            </div>
          ))}
          {sorted.length === 0 ? (
            <p data-testid="rooms-empty" className="text-sm text-muted-foreground">
              No rooms in scope.
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
