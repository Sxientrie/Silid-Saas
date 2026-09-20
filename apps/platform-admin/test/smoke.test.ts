import { describe, expect, it } from "vitest";
import appPackage from "../package.json";

describe("@silid/platform-admin pipeline smoke", () => {
  it("is the platform-admin workspace", () => {
    expect(appPackage.name).toBe("@silid/platform-admin");
  });
});
