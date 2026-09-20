import { describe, expect, it } from "vitest";
import { SILID_PACKAGE_NAME } from "../src/index.js";

describe("@silid/audit pipeline smoke", () => {
  it("exposes the package identity", () => {
    expect(SILID_PACKAGE_NAME).toBe("@silid/audit");
  });
});
