# 04 — Auto-assigned rooms with a double-booking guard

On check-in, propose the first vacant room (one tap to accept, one tap to
override for guest preference), and make double-booking structurally
impossible with a database constraint plus a server-side check-in transaction.

## What it changes

**Current behavior.** Check-in requires manually choosing a room —
`CreateSessionPayload` carries `room_id` (`src/features/sessions/types.ts`).
Nothing prevents two active sessions on the same room: the `sessions` table
(migration 0004) has no uniqueness constraint on room + active status
(migration 0010 adds plain indexes only), and no code path sets the room
`'occupied'` at all — `updateRoomStatus`
(`src/features/rooms/services/rooms.service.ts`) exists as a direct client
table write but currently has no callers, so rooms stay `'vacant'` until the
grace job flips them to `'grace'`. The room grid therefore cannot disagree
with reality today only because there is no room grid yet. Related gaps:
`createSession`
(`src/features/sessions/services/sessions.service.ts`) inserts the session
without `base_rate`, `surcharges`, or `total`, so every money column starts
at 0 (neither `calculate-charge` nor `charge.calculator.ts` is ever
invoked). The check-in form itself is a stub
(`src/features/sessions/components/CheckInForm.tsx`).

**New behavior.** The check-in screen preselects the first vacant room; the
cashier accepts it or overrides with one tap. A partial unique index
guarantees at most one `active` session per room regardless of what any client
does, and session creation + room status change happen server-side in one
atomic transaction, so the room grid cannot lie.

## Why it matters

Removes a decision-and-scan step from the product's "<10 seconds" check-in
goal and eliminates a whole class of front-desk incident — a double-booked
room is an awkward guest confrontation at the desk. Client-side checks race;
the database constraint is the only version that is actually trustworthy.

## How to implement

1. **Constraint** (new migration):
   `CREATE UNIQUE INDEX ... ON sessions (room_id) WHERE status = 'active'` —
   a partial index, so closed/voided sessions never block room reuse. Verify
   no existing data violates it before creating.
2. **Server-side check-in RPC** — e.g. `create_session(p_room_id,
   p_booking_type, p_pax)`: inserts the session, sets the room `'occupied'`,
   stamps the charge figures, all in one SECURITY DEFINER function following
   the `close_session` pattern (migration 0010). Migrate the client to it
   (`createSession` in
   `src/features/sessions/services/sessions.service.ts` + `useCheckIn`).
3. **Auto-assign.** `fetchRooms(branchId)` already returns the room list; add
   a tiny helper that picks the first `'vacant'` room. The stub CheckInForm
   preselects it; override stays one tap away via the room list.
4. **Close the side door.** `updateRoomStatus` is a direct table UPDATE from
   the client; fold room-status transitions into the session RPCs
   (check-in, checkout, void) so there is exactly one writer. If a manual
   status control is still needed, expose it as an admin-gated RPC, not a
   client table write.
5. **Open question:** whether rooms have classes that should influence
   assignment order (e.g., don't auto-spend premium rooms first). Default to
   lowest room number among vacant; refine when room types exist.

## Risk / tradeoff

Guest room preferences need an obvious override path, or staff will experience
the automation as loss of control. The RPC refactor changes the check-in
path's shape, so it should land together with the (currently stub) check-in UI
rather than before it. A SECURITY DEFINER `create_session` RPC bypasses RLS
entirely, so it must derive branch and cashier identity from the caller's
auth context server-side (never from arguments) and validate that the room
belongs to the caller's branch — otherwise the fix for double-booking opens a
cross-branch booking hole. Note also that the partial unique index alone does
not free the room: closed sessions stop blocking reuse, but the
`rooms.status` row only becomes truthful if the checkout/void RPCs reset it.

## Rough size

Small–medium — the index itself is trivial; the atomic check-in RPC and
client migration are the bulk of the work.

## Red-team verdict

**survives.** Core claims verified: no uniqueness constraint on active
sessions per room (migrations 0004/0010), no code path ever sets a room
`'occupied'` (the brief's "separate client call that can be skipped"
overstated — `updateRoomStatus` has no callers at all, now corrected), and
the check-in form is a stub. The "<10 seconds" check-in goal is real
(`docs/moteltrack-overview (1).md`, cashier user story). The partial unique
index plus one atomic SECURITY DEFINER RPC is the correct shape. Fixes
applied: corrected the room-status claim, made explicit that money columns
are all 0 today (making the RPC's charge-stamping load-bearing, not polish),
and added the RLS-bypass and room-status-reset risks.
