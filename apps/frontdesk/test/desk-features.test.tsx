import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CheckInForm } from "../src/features/sessions/CheckInForm";
import { RoomGrid } from "../src/features/rooms/RoomGrid";
import { OverstayLadderList } from "../src/features/sessions/OverstayLadderList";
import type { RoomView, SessionView } from "@silid/schemas";
import { OVERSTAY_DEFAULTS } from "@silid/db";

/**
 * Roadmap 06 Deliverables 2–4 — the desk components' behavior contracts, at
 * the level a browser test cannot cheaply reach: the payment-confirmation
 * gate, the money-input absence, the server-only room grid, and the ladder's
 * garbage fallback rendering. The probe in jsdom cannot reach a server, so
 * every submit here resolves to the offline branch — which is exactly the
 * branch that must DURABLY queue a money-affecting write.
 */

const ROOM_VACANT: RoomView = {
  id: "44000000-0000-4000-8000-000000000001",
  orgId: "14000000-0000-4000-8000-000000000001",
  branchId: "24000000-0000-4000-8000-000000000001",
  roomNumber: "101",
  status: "vacant",
};
const ROOM_TAKEN: RoomView = { ...ROOM_VACANT, id: "44000000-0000-4000-8000-000000000002", roomNumber: "102", status: "occupied" };

function withProvider(node: React.ReactElement): React.ReactElement {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

afterEach(() => {
  cleanup();
});

describe("CheckInForm — the payment-confirmation gate (vault-10)", () => {
  it("offers no amount input anywhere: the cashier never types a peso", () => {
    render(withProvider(<CheckInForm rooms={[ROOM_VACANT]} />));
    expect(screen.queryByLabelText(/amount/i)).toBeNull();
    expect(screen.queryByTestId("check-in-amount")).toBeNull();
    // The payment step is a confirmation, not a figure.
    expect(screen.getByTestId("check-in-payment")).not.toBeNull();
  });

  it("keeps the submit disabled until full payment is confirmed", () => {
    render(withProvider(<CheckInForm rooms={[ROOM_VACANT]} />));
    const submit = screen.getByTestId("check-in-submit") as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.click(screen.getByTestId("check-in-payment"));
    expect(submit.disabled).toBe(false);
  });

  it("defaults the room to the first vacant and ignores occupied rooms", () => {
    render(withProvider(<CheckInForm rooms={[ROOM_TAKEN, ROOM_VACANT]} />));
    const room = screen.getByTestId("check-in-room") as HTMLSelectElement;
    expect(room.value).toBe(ROOM_VACANT.id);
  });

  it("refuses a zero guest count at the form layer, never by clamping", () => {
    render(withProvider(<CheckInForm rooms={[ROOM_VACANT]} />));
    const pax = screen.getByTestId("check-in-pax") as HTMLInputElement;
    fireEvent.change(pax, { target: { value: "0" } });
    fireEvent.click(screen.getByTestId("check-in-payment"));
    expect((screen.getByTestId("check-in-submit") as HTMLButtonElement).disabled).toBe(true);
  });

  it("durably queues the money-affecting write when the desk cannot reach the server", async () => {
    render(withProvider(<CheckInForm rooms={[ROOM_VACANT]} />));
    fireEvent.click(screen.getByTestId("check-in-payment"));
    fireEvent.click(screen.getByTestId("check-in-submit"));
    await waitFor(
      () => expect(screen.getByTestId("check-in-status").textContent).toContain("queued"),
      { timeout: 5_000 },
    );
  });
});

describe("RoomGrid — server status only (vault-15)", () => {
  it("renders the server's statuses and counts without offering any control", () => {
    render(withProvider(<RoomGrid rooms={[ROOM_VACANT, ROOM_TAKEN]} />));
    expect(screen.getByTestId("room-status-101").textContent).toBe("vacant");
    expect(screen.getByTestId("room-status-102").textContent).toBe("occupied");
    expect(screen.getByTestId("room-count-vacant").textContent).toContain("1");
    expect(screen.getByTestId("room-count-occupied").textContent).toContain("1");
    expect(screen.getByTestId("room-count-overdue").textContent).toContain("0");
    // No button, no select: the grid has no write path of any kind.
    expect(screen.queryByRole("button")).toBeNull();
  });
});

const BRANCH = "24000000-0000-4000-8000-000000000001";
const ORG = "14000000-0000-4000-8000-000000000001";

function session(bookedEndAt: string, overrides: Partial<SessionView> = {}): SessionView {
  const bookedEndMs = Date.parse(bookedEndAt);
  return {
    id: "55000000-0000-4000-8000-000000000001",
    orgId: ORG,
    branchId: BRANCH,
    roomId: ROOM_VACANT.id,
    cashierId: "34000000-0000-4000-8000-000000000001",
    bookingType: "short_time",
    pax: 2,
    baseRate: "0",
    surcharges: "0",
    total: "0",
    checkedInAt: Number.isFinite(bookedEndMs)
      ? new Date(bookedEndMs - 3 * 3_600_000).toISOString()
      : "2026-09-29T06:00:00Z",
    bookedEndAt,
    checkedOutAt: null,
    status: "active",
    voidReason: null,
    ...overrides,
  };
}

const TRIPLE = {
  graceMinutes: OVERSTAY_DEFAULTS.grace_minutes,
  blockMinutes: OVERSTAY_DEFAULTS.block_minutes,
  blockCharge: OVERSTAY_DEFAULTS.block_charge,
};

describe("OverstayLadderList — the display goldens at the component layer", () => {
  const NOW = new Date("2026-09-29T12:00:00Z");

  it("floats overdue above grace above booked, with the accruing display figure", () => {
    const booked = session("2026-09-29T14:00:00Z", { id: "55000000-0000-4000-8000-00000000000a" });
    // Grace opened at 11:50 and runs 25 minutes; at 12:00 fifteen remain.
    const grace = session("2026-09-29T11:50:00Z", { id: "55000000-0000-4000-8000-00000000000b" });
    const overdue = session("2026-09-29T09:00:00Z", {
      id: "55000000-0000-4000-8000-00000000000c",
      bookingType: "overnight",
      pax: 5,
    });
    render(withProvider(<OverstayLadderList sessions={[booked, grace, overdue]} overstay={TRIPLE} now={() => NOW} />));
    const entries = screen.getByTestId("overstay-ladder").querySelectorAll("[data-testid^='ladder-entry-']");
    const ids = Array.from(entries).map((entry) => entry.getAttribute("data-testid"));
    expect(ids).toEqual([
      "ladder-entry-55000000-0000-4000-8000-00000000000c",
      "ladder-entry-55000000-0000-4000-8000-00000000000b",
      "ladder-entry-55000000-0000-4000-8000-00000000000a",
    ]);
    // 12:00 is 3h past the 09:00 booked end (grace 25m closed at 09:25):
    // 2h35m overdue = 3 started blocks at the fixture's block charge.
    expect(screen.getByTestId("ladder-detail-55000000-0000-4000-8000-00000000000c").textContent).toContain(
      `accruing ₱${3 * OVERSTAY_DEFAULTS.block_charge}`,
    );
  });

  it("renders the booked-phase fallback for a corrupted booked end — never NaN money", () => {
    const corrupted = session("not-a-timestamp", { id: "55000000-0000-4000-8000-00000000000d" });
    render(withProvider(<OverstayLadderList sessions={[corrupted]} overstay={TRIPLE} now={() => NOW} />));
    expect(screen.getByTestId("ladder-phase-55000000-0000-4000-8000-00000000000d").textContent).toBe("booked");
    expect(screen.getByTestId("ladder-detail-55000000-0000-4000-8000-00000000000d").textContent).toBe("in stay");
    // No NaN anywhere on the card.
    expect(screen.getByTestId("overstay-ladder").textContent).not.toContain("NaN");
  });
});
