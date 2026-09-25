import { describe, expect, it } from "vitest";
import {
  branchViewSchema,
  branchWithRateConfigSchema,
  roomViewSchema,
  sessionViewSchema,
  staffViewSchema,
} from "../src/index.js";

/** The read-view contracts the API's claim-scoped procedures return. */
describe("read-view schemas", () => {
  const orgId = "14000000-0000-4000-8000-000000000001";
  const branchId = "24000000-0000-4000-8000-000000000001";
  const staffId = "34000000-0000-4000-8000-000000000001";
  const roomId = "44000000-0000-4000-8000-000000000001";
  const sessionId = "55000000-0000-4000-8000-000000000001";

  it("parses a branch view", () => {
    const parsed = branchViewSchema.parse({
      id: branchId,
      orgId,
      name: "Legacy main",
      createdAt: "2026-09-25T00:00:00Z",
    });
    expect(parsed.name).toBe("Legacy main");
  });

  it("parses a branch with its rate card and tolerates a null card", () => {
    const withCard = branchWithRateConfigSchema.parse({
      id: branchId,
      orgId,
      name: "Legacy main",
      createdAt: "2026-09-25T00:00:00Z",
      rateConfig: { extension: { grace_minutes: "25" } },
    });
    expect(withCard.rateConfig?.extension?.grace_minutes).toBe("25");
    const withoutCard = branchWithRateConfigSchema.parse({
      id: branchId,
      orgId,
      name: "Legacy main",
      createdAt: "2026-09-25T00:00:00Z",
      rateConfig: null,
    });
    expect(withoutCard.rateConfig).toBeUndefined();
  });

  it("parses a room view with a legal status", () => {
    expect(roomViewSchema.parse({ id: roomId, orgId, branchId, roomNumber: "1", status: "vacant" }).status).toBe("vacant");
    expect(roomViewSchema.safeParse({ id: roomId, orgId, branchId, roomNumber: "1", status: "demolished" }).success).toBe(false);
  });

  it("parses a staff view; platform_admin is not a staff role", () => {
    expect(staffViewSchema.parse({ id: staffId, orgId, branchId, email: "c@x.test", role: "cashier", displayName: "C", isActive: true }).role).toBe("cashier");
    expect(staffViewSchema.safeParse({ id: staffId, orgId, branchId: null, email: "a@x.test", role: "platform_admin", displayName: "A", isActive: true }).success).toBe(false);
  });

  it("parses a session view with sealed-money string columns", () => {
    const parsed = sessionViewSchema.parse({
      id: sessionId,
      orgId,
      branchId,
      roomId,
      cashierId: staffId,
      bookingType: "short_time",
      pax: 2,
      baseRate: "450",
      surcharges: "0",
      total: "450",
      checkedInAt: "2026-09-25T10:00:00Z",
      bookedEndAt: "2026-09-25T13:00:00Z",
      checkedOutAt: null,
      status: "active",
      voidReason: null,
    });
    expect(parsed.total).toBe("450");
    expect(sessionViewSchema.safeParse({ ...parsed, status: "reopened" }).success).toBe(false);
  });
});
