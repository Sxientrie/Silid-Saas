"use client";

import { useMemo } from "react";
import { readOverstayTriple, type OverstayTriple } from "@silid/schemas";
import { DEFAULT_OVERSTAY } from "@silid/utils";
import { CheckInForm } from "./CheckInForm";
import { CheckOutFlow } from "./CheckOutFlow";
import { OverstayLadderList } from "./OverstayLadderList";
import { useBranchRateConfig, useSessions } from "./use-sessions";
import { RoomGrid } from "@/features/rooms/RoomGrid";
import { useRooms } from "@/features/rooms/use-rooms";

/**
 * The dashboard's client features (roadmap 06 Deliverables 2–4): the room
 * grid, the check-in form, the check-out flow, and the overstay ladder, all
 * reading the server through the claim-scoped procedures and polling at the
 * cross-desk design interval. The ladder's parameters come from the branch's
 * rate card via the server (readOverstayTriple falls back per §3.3); the
 * garbage-timestamp fallback itself lives in the pure display math.
 */
export function DeskDashboard() {
  const roomsQuery = useRooms();
  const sessionsQuery = useSessions();
  const branch = useBranchRateConfig();

  // The fixture's defaults until the branch's own card arrives; the triple
  // reader falls back per §3.3 for any corrupted stored value.
  const overstay = useMemo<OverstayTriple>(() => {
    if (branch !== undefined && branch !== null) {
      return readOverstayTriple(branch.rateConfig);
    }
    return {
      graceMinutes: DEFAULT_OVERSTAY.grace_minutes,
      blockMinutes: DEFAULT_OVERSTAY.block_minutes,
      blockCharge: DEFAULT_OVERSTAY.block_charge,
    };
  }, [branch]);

  const rooms = useMemo(() => roomsQuery.data ?? [], [roomsQuery.data]);
  const roomNumbers = useMemo(
    () => Object.fromEntries(rooms.map((room) => [room.id, room.roomNumber])),
    [rooms],
  );
  const sessions = useMemo(() => sessionsQuery.data ?? [], [sessionsQuery.data]);
  const active = useMemo(() => sessions.filter((session) => session.status === "active"), [sessions]);

  return (
    <div className="flex flex-col gap-6">
      <RoomGrid rooms={rooms} />
      <OverstayLadderList sessions={sessions} roomNumbers={roomNumbers} overstay={overstay} />
      <div className="grid gap-6 lg:grid-cols-2">
        <CheckInForm rooms={rooms} />
        <CheckOutFlow sessions={active} roomNumbers={roomNumbers} />
      </div>
    </div>
  );
}
