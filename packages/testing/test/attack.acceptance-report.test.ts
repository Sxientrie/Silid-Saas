// ATTACK BATTERY — Phase 01 (scaffolding), acceptance-report generator surface.
//
// Authored by the isolated attacker sub-agent. These tests feed the report
// generator (`node packages/testing/src/acceptance-report.ts --phase-file
// <md> --results <json> --out <md>`) malformed and adversarial inputs from
// test/fixtures/attacker/report/ and assert the behavior the spec requires:
// a report is "well-formed" only when every green line is backed by a clip,
// an attack test, and a resolvable EVIDENCE tag, and any fail/blocked/missing
// input keeps the verdict NOT GREEN (spec/00-master-goal.md, ACCEPTANCE
// REPORTS & PROOF CLIPS).
//
// Tests in the "confirmed breaks" section assert the required behavior;
// each currently FAILS — that failure is the documented break, returned to
// the builder by the runner. Nothing here is relaxed to green.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const REPO_ROOT = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const GENERATOR = join(
  REPO_ROOT,
  "packages",
  "testing",
  "src",
  "acceptance-report.ts",
);
const BUILDER_PHASE_FILE = join(
  REPO_ROOT,
  "packages",
  "testing",
  "test",
  "fixtures",
  "phase-00-fixture.md",
);
const BUILDER_RESULTS = join(
  REPO_ROOT,
  "packages",
  "testing",
  "test",
  "fixtures",
  "phase-00-fixture-results.json",
);
const ATTACKER_REPORT = join(
  REPO_ROOT,
  "packages",
  "testing",
  "test",
  "fixtures",
  "attacker",
  "report",
);

const workDir = mkdtempSync(join(tmpdir(), "silid-attack-report-"));
afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

interface RunResult {
  code: number;
  output: string;
  report?: string;
}

function runGenerator(
  phaseFile: string,
  resultsFile: string,
  outName: string,
): RunResult {
  const outPath = join(workDir, outName);
  try {
    const output = execFileSync(
      process.execPath,
      [
        GENERATOR,
        "--phase-file",
        phaseFile,
        "--results",
        resultsFile,
        "--out",
        outPath,
      ],
      { cwd: REPO_ROOT, encoding: "utf8" },
    );
    let report: string | undefined;
    try {
      report = readFileSync(outPath, "utf8");
    } catch {
      report = undefined;
    }
    return { code: 0, output, report };
  } catch (error) {
    const err = error as { status?: number; stdout?: string; stderr?: string };
    return {
      code: err.status ?? 1,
      output: `${err.stdout ?? ""}${err.stderr ?? ""}`,
    };
  }
}

describe("attack: acceptance-report — harness control", () => {
  it("the seeded fixture still compiles to ALL GREEN", () => {
    // Anchors the spawn harness: unchanged builder inputs must behave as
    // recorded. If this fails, the attack findings below are invalid.
    const run = runGenerator(
      BUILDER_PHASE_FILE,
      BUILDER_RESULTS,
      "control-green.md",
    );
    expect(run.code).toBe(0);
    expect(run.output).toContain("ALL GREEN");
  });
});

describe("attack: acceptance-report — required behavior (claim: survives)", () => {
  it("a results file missing a capability yields NOT GREEN with a non-pass line", () => {
    const run = runGenerator(
      BUILDER_PHASE_FILE,
      join(ATTACKER_REPORT, "results-missing-capability.json"),
      "missing-capability.md",
    );
    expect(run.code).toBe(0);
    expect(run.output).toContain("NOT GREEN");
    expect(run.report).toContain("**BLOCKED**");
    expect(run.report).not.toContain("ALL GREEN");
  });

  it("wrong status value types are rejected loudly (nonzero exit)", () => {
    const run = runGenerator(
      BUILDER_PHASE_FILE,
      join(ATTACKER_REPORT, "results-type-abuse.json"),
      "type-abuse.md",
    );
    expect(run.code).not.toBe(0);
    expect(run.output).toContain("status");
  });

  it("a phase file without an acceptance section is rejected loudly", () => {
    const run = runGenerator(
      join(ATTACKER_REPORT, "phase-no-acceptance-section.md"),
      BUILDER_RESULTS,
      "no-acceptance.md",
    );
    expect(run.code).not.toBe(0);
    expect(run.output.toLowerCase()).toContain("acceptance");
  });
});

describe("attack: acceptance-report — false-green channels (confirmed breaks)", () => {
  it("PASS lines backed by empty proof slots are not allowed to be green", () => {
    const run = runGenerator(
      BUILDER_PHASE_FILE,
      join(ATTACKER_REPORT, "results-empty-slots.json"),
      "empty-slots.md",
    );
    // BREAK (observed 2026-09-25): capability one passes with clip="",
    // attackTest="", evidence="" — the report renders an empty proof slot
    // list under a PASS line and the verdict is ALL GREEN. A nonexistent
    // clip path on capability two is also accepted silently.
    expect(run.code).toBe(0);
    expect(run.report).not.toContain("ALL GREEN");
  });

  it("a failing gate must fail the verdict", () => {
    const run = runGenerator(
      BUILDER_PHASE_FILE,
      join(ATTACKER_REPORT, "results-gates-fail.json"),
      "gates-fail.md",
    );
    // BREAK (observed 2026-09-25): moneyGate.status=fail ("recomputation
    // drifted on 2 of 5 figures") and mutationGate.status=fail ("kill rate
    // 40.00%") both render as FAIL gate lines — and the verdict still reads
    // "ALL GREEN — 2/2 capability lines green". The verdict counts only
    // capability lines.
    expect(run.code).toBe(0);
    expect(run.report).toContain("FAIL");
    expect(run.report).not.toContain("ALL GREEN");
  });

  it("gate detail contradicting a PASS status must not be green", () => {
    const run = runGenerator(
      BUILDER_PHASE_FILE,
      join(ATTACKER_REPORT, "results-gate-detail-lie.json"),
      "gate-detail-lie.md",
    );
    // BREAK (observed 2026-09-25): status "pass" with detail "kill rate
    // 40.00% ... versus the 80% threshold" (and a money gate claiming
    // "diff = 2 pesos (DRIFT)") renders as PASS gate lines with an ALL
    // GREEN verdict — the generator never cross-checks the detail against
    // the threshold it knows.
    expect(run.code).toBe(0);
    expect(run.report).not.toContain("ALL GREEN");
  });

  it(
    "duplicate capability results differing only in case must not let order flip the verdict",
    () => {
      const run = runGenerator(
        BUILDER_PHASE_FILE,
        join(ATTACKER_REPORT, "results-duplicate-case-flip.json"),
        "duplicate-case-flip.md",
      );
      // BREAK (observed 2026-09-25): results matching is case/punctuation
      // insensitive and resolved last-entry-wins. The fixture records a
      // FAIL for the capability (as a case-variant input) followed by a
      // PASS for the exact input; the FAIL entry is silently swallowed and
      // the verdict is ALL GREEN. Flipping the array order flips the
      // verdict to NOT GREEN — the client-visible outcome depends on the
      // order of appended rows, with no duplicate-conflict warning.
      expect(run.code).toBe(0);
      expect(run.report).not.toContain("ALL GREEN");
    },
  );

  it("a recorded failing result matching no capability must not be green", () => {
    const run = runGenerator(
      BUILDER_PHASE_FILE,
      join(ATTACKER_REPORT, "results-unmatched-fail.json"),
      "unmatched-fail.md",
    );
    // BREAK (observed 2026-09-25): a results entry whose input matches no
    // phase-file capability is dropped without any warning; if the phase
    // file's sentence drifted after results were recorded, the recorded
    // FAIL disappears and the verdict is ALL GREEN.
    expect(run.code).toBe(0);
    expect(run.report).not.toContain("ALL GREEN");
  });

  it(
    "the no-clip disposition convention must not launder missing attack tests or bare placeholders",
    () => {
      const run = runGenerator(
        BUILDER_PHASE_FILE,
        join(ATTACKER_REPORT, "results-none-recorded-slots.json"),
        "none-recorded-slots.md",
      );
      // Convention (implemented 2026-09-25, the database-phase precedent):
      // a clip slot may carry "none recorded — <reason>" for a capability
      // with no UI — but capability one here carries the BARE "none
      // recorded" (no reason: a placeholder, not a disposition), and
      // capability two tries to dodge the mandatory attack test with a
      // "none recorded — ..." string in the attack-test slot. Neither may
      // count green: dispositions live in the clip slot only, the reason
      // is mandatory, and the attack-test/EVIDENCE slots must reference
      // real artifacts.
      expect(run.code).toBe(0);
      expect(run.report).toContain("PROOF INCOMPLETE");
      expect(run.report).not.toContain("ALL GREEN");
    },
  );
});
