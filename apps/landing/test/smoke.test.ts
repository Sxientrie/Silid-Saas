import { describe, expect, it } from "vitest";
import appPackage from "../package.json";

describe("@silid/landing pipeline smoke", () => {
  it("is the landing workspace", () => {
    expect(appPackage.name).toBe("@silid/landing");
  });
});
