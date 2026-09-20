import { describe, expect, it } from "vitest";
import { config as baseConfig } from "../base.js";

describe("@silid/config pipeline smoke", () => {
  it("exposes the shared eslint base as a non-empty config array", () => {
    expect(Array.isArray(baseConfig)).toBe(true);
    expect(baseConfig.length).toBeGreaterThan(0);
  });
});
