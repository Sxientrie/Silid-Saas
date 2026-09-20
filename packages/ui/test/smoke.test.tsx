import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "../src/button";

describe("@silid/ui pipeline smoke", () => {
  it("renders the generated Button component", () => {
    render(<Button appName="smoke">Click me</Button>);
    expect(screen.getByRole("button", { name: "Click me" })).toBeTruthy();
  });
});
