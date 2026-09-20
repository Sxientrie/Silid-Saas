import { describe, expect, it } from "vitest";
import appPackage from "../package.json";

describe("@silid/frontdesk pipeline smoke", () => {
  it("is the frontdesk workspace", () => {
    expect(appPackage.name).toBe("@silid/frontdesk");
  });
});
