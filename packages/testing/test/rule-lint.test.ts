import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  checkAcceptanceInputSentences,
  checkEvidenceTags,
  checkTerminology,
  lintFiles,
  type LintViolation,
} from "../src/rule-lint.js";

const violationsOf = (violations: LintViolation[]) =>
  violations.map((v) => v.rule);

describe("checkTerminology", () => {
  it("flags the unqualified term in prose", () => {
    const violations = checkTerminology(
      "doc.md",
      "The billing module handles money.\nSecond line mentions billing again.",
    );
    expect(violations).toHaveLength(2);
    expect(violations[0]).toMatchObject({
      file: "doc.md",
      line: 1,
      rule: "terminology-qualified",
    });
    expect(violations[1]!.line).toBe(2);
  });

  it("allows the qualified terms on one line and across a soft-wrap", () => {
    const violations = checkTerminology(
      "doc.md",
      "Guest billing and platform billing are distinct.\nAlso guest-billing\n  and platform\n  billing hyphenated or wrapped.",
    );
    expect(violations).toEqual([]);
  });

  it("allows bare uses inside the master goal's TERMINOLOGY section only", () => {
    const text = [
      "════ divider ════",
      "TERMINOLOGY — GUEST BILLING VS. PLATFORM BILLING",
      'This section uses "billing" bare, twice: billing.',
      "════ divider ════",
      "But billing here is a violation.",
    ].join("\n");
    const violations = checkTerminology("00-master-goal.md", text);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.line).toBe(5);
  });

  it("skips CRITIQUE.md as a historical review record quoting fixed findings", () => {
    const violations = checkTerminology(
      "spec/CRITIQUE.md",
      'The old wording ("per-minute billing via a zero-length block") was fixed.\n',
    );
    expect(violations).toEqual([]);
  });
});

describe("checkEvidenceTags", () => {
  it("flags a DONE block without an EVIDENCE tag", () => {
    const violations = checkEvidenceTags(
      "PROGRESS.md",
      "### Task one\n\nSTATUS: DONE — Deliverable X.\n",
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]!.rule).toBe("evidence-tag-missing");
  });

  it("accepts a DONE block with a well-formed EVIDENCE tag", () => {
    // "Well-formed" is now resolvable, not merely shaped: the tag must cite
    // a /Silid/ path that exists in the cited commit's tree. The fixture
    // cites the current HEAD and a file every commit carries.
    const headSha = execFileSync("git", ["rev-parse", "--short=7", "HEAD"], {
      cwd: resolve(import.meta.dirname, "../../.."),
      encoding: "utf8",
    }).trim();
    const violations = checkEvidenceTags(
      "PROGRESS.md",
      `### Task one\n\nEVIDENCE ${headSha} /Silid/package.json:1 — proof\n\nSTATUS: DONE — Deliverable X.\n`,
    );
    expect(violations).toEqual([]);
  });

  it("does not demand EVIDENCE for in-progress or plain blocks", () => {
    const violations = checkEvidenceTags(
      "PROGRESS.md",
      "### Session start\n\nSTATUS: IN PROGRESS — working.\n\n### Other\n\nNo status here.\n",
    );
    expect(violations).toEqual([]);
  });
});

describe("checkAcceptanceInputSentences", () => {
  it("accepts single-sentence inputs", () => {
    const violations = checkAcceptanceInputSentences(
      "roadmap/01-x.md",
      '## Acceptance-report inputs\n\n- "Two cashiers cannot double-book a room."\n- A clean checkout installs and tests.\n',
    );
    expect(violations).toEqual([]);
  });

  it("flags two-sentence inputs and terminators mid-bullet", () => {
    const violations = checkAcceptanceInputSentences(
      "roadmap/01-x.md",
      "## Acceptance-report inputs\n\n- Handles room conflicts well. And badly.\n- Ends without a period\n",
    );
    expect(violations).toHaveLength(2);
    expect(violations.map((v) => v.line)).toEqual([3, 4]);
  });
});

describe("lintFiles (the rule-lint CLI contract)", () => {
  it("is clean on a compliant tree and noisy on a deliberately non-compliant one", async () => {
    const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "silid-rulelint-"));
    try {
      const good = join(dir, "good.md");
      writeFileSync(good, "Guest billing is not platform billing.\n");
      expect(lintFiles([good])).toEqual([]);

      const bad = join(dir, "bad.md");
      writeFileSync(bad, "The billing happens here.\n");
      const violations = lintFiles([bad]);
      expect(violations.map((v) => v.rule)).toContain(
        "terminology-qualified",
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
