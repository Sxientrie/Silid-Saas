import { describe, expect, it } from "vitest";
import { SILID_PACKAGE_NAME } from "../src/index.js";

describe("@silid/schemas pipeline smoke", () => {
  it("exposes the package identity", () => {
    expect(SILID_PACKAGE_NAME).toBe("@silid/schemas");
  });
});
