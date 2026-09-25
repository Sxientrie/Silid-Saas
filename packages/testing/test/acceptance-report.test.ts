import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildAcceptanceReport,
  parseAcceptanceInputs,
  parseResultsFile,
  reportVerdict,
  type AcceptanceReportModel,
} from "../src/acceptance-report.js";

const packageRoot = resolve(fileURLToPath(import.meta.url), "..", "..");
const fixturePhaseFile = join(
  packageRoot,
  "test",
  "fixtures",
  "phase-00-fixture.md",
);
const fixtureResultsFile = join(
  packageRoot,
  "test",
  "fixtures",
  "phase-00-fixture-results.json",
);

function fixtureModel(): AcceptanceReportModel {
  return {
    phase: "00",
    phaseTitle: "Fixture",
    inputs: parseAcceptanceInputs(readFileSync(fixturePhaseFile, "utf8")),
    ...parseResultsFile(readFileSync(fixtureResultsFile, "utf8")),
  } as AcceptanceReportModel;
}

describe("parseAcceptanceInputs", () => {
  it("extracts the quoted bullet sentences from the acceptance inputs section", () => {
    const inputs = parseAcceptanceInputs(
      readFileSync(fixturePhaseFile, "utf8"),
    );
    expect(inputs).toEqual([
      "The fixture capability one passes with a recorded clip.",
      "The fixture capability two recomputes every fixture figure.",
    ]);
  });

  it("returns no inputs when the section is absent", () => {
    expect(parseAcceptanceInputs("# Phase X\n\nNo inputs here.\n")).toEqual(
      [],
    );
  });

  it("joins bullets soft-wrapped across continuation lines", () => {
    const inputs = parseAcceptanceInputs(
      [
        "## Acceptance-report inputs",
        "",
        '- "A clean checkout installs, builds, lints, and tests with one command',
        '  and zero errors."',
        "",
      ].join("\n"),
    );
    expect(inputs).toEqual([
      "A clean checkout installs, builds, lints, and tests with one command and zero errors.",
    ]);
  });
});

describe("buildAcceptanceReport", () => {
  it("renders one green line per capability with clip, attack test, and evidence slots", () => {
    const report = buildAcceptanceReport(fixtureModel());
    expect(report).toContain("# Phase 00 — Client Acceptance Report");
    expect(report).toContain(
      "- **PASS** — The fixture capability one passes with a recorded clip.",
    );
    expect(report).toContain(
      "proof clip: reports/proof/e2e/fixture/fixture-one/video.webm",
    );
    expect(report).toContain(
      "attack test: test/attack-fixture.spec.ts > fixture capability one survives the attack",
    );
    expect(report).toContain(
      "EVIDENCE 0000000 /Silid/packages/testing/test/fixtures/phase-00-fixture.md:11",
    );
    expect(report).toContain("MONEY RECOMPUTATION GATE:");
    expect(report).toContain("MUTATION GATE:");
    expect(reportVerdict(report)).toBe("ALL GREEN");
  });

  it("renders BLOCKED with none-recorded slots and a NOT GREEN verdict when a result is missing", () => {
    const model = fixtureModel();
    model.results = model.results.slice(0, 1);
    const report = buildAcceptanceReport(model);
    expect(report).toContain(
      "- **BLOCKED** — The fixture capability two recomputes every fixture figure.",
    );
    expect(report).toContain("proof clip: none recorded");
    expect(report).toContain("attack test: none recorded");
    expect(report).toContain("evidence: none recorded");
    expect(reportVerdict(report)).toBe("NOT GREEN");
  });

  it("renders FAIL lines for failed results", () => {
    const model = fixtureModel();
    model.results[1]!.status = "fail";
    const report = buildAcceptanceReport(model);
    expect(report).toContain(
      "- **FAIL** — The fixture capability two recomputes every fixture figure.",
    );
    expect(reportVerdict(report)).toBe("NOT GREEN");
  });

  it("matches results to inputs case- and whitespace-insensitively", () => {
    const model = fixtureModel();
    model.results[0]!.input =
      "  the   FIXTURE capability one passes with a recorded clip.  ";
    const report = buildAcceptanceReport(model);
    expect(report).toContain(
      "- **PASS** — The fixture capability one passes with a recorded clip.",
    );
    expect(reportVerdict(report)).toBe("ALL GREEN");
  });
});

describe("proof-slot convention — recorded no-clip dispositions", () => {
  // The gate-accepted database-phase precedent: a capability with no UI has
  // no clip, and the report records that HONESTLY and VISIBLY — the clip
  // slot carries "none recorded — <what proves it instead>" with the reason
  // rendered verbatim. A real attack test and a real EVIDENCE tag remain
  // mandatory on every green line (spec/00-master-goal.md, ACCEPTANCE
  // REPORTS & PROOF CLIPS).
  const REAL_ATTACK =
    "test/attack-fixture.spec.ts > fixture capability one survives the attack";
  const REAL_EVIDENCE =
    "EVIDENCE 0000000 /Silid/packages/testing/test/fixtures/phase-00-fixture.md:11 — fixture evidence line";

  function modelWithSlots(overrides: {
    clip?: string;
    attackTest?: string;
    evidence?: string;
  }): AcceptanceReportModel {
    const model = fixtureModel();
    model.results = [
      {
        input: "The fixture capability one passes with a recorded clip.",
        status: "pass",
        attackTest: REAL_ATTACK,
        evidence: REAL_EVIDENCE,
        ...overrides,
      },
      ...model.results.slice(1),
    ];
    return model;
  }

  it("a clip disposition beginning 'none recorded — ' counts green and renders verbatim", () => {
    const disposition =
      "none recorded — the proof is pgTAP suite 10 (database phase, no UI)";
    const report = buildAcceptanceReport(modelWithSlots({ clip: disposition }));
    expect(report).toContain(`proof clip: ${disposition}`);
    expect(reportVerdict(report)).toBe("ALL GREEN");
  });

  it("a bare 'none recorded' clip without a reason does not count green", () => {
    const report = buildAcceptanceReport(
      modelWithSlots({ clip: "none recorded" }),
    );
    expect(report).toContain("PROOF INCOMPLETE");
    expect(reportVerdict(report)).toBe("NOT GREEN");
  });

  it("a truly empty clip slot does not count green", () => {
    const report = buildAcceptanceReport(modelWithSlots({ clip: "" }));
    expect(report).toContain("PROOF INCOMPLETE");
    expect(reportVerdict(report)).toBe("NOT GREEN");
  });

  it("a 'none recorded — ' disposition cannot stand in for a real attack test", () => {
    const report = buildAcceptanceReport(
      modelWithSlots({
        clip: "reports/proof/e2e/fixture/fixture-one/video.webm",
        attackTest: "none recorded — the proof is the fixture suite instead",
      }),
    );
    expect(report).toContain("PROOF INCOMPLETE");
    expect(reportVerdict(report)).toBe("NOT GREEN");
  });

  it("a 'none recorded — ' disposition cannot stand in for a real EVIDENCE tag", () => {
    const report = buildAcceptanceReport(
      modelWithSlots({
        clip: "reports/proof/e2e/fixture/fixture-one/video.webm",
        evidence: "none recorded — the proof is the recorded hosted run instead",
      }),
    );
    expect(report).toContain("PROOF INCOMPLETE");
    expect(reportVerdict(report)).toBe("NOT GREEN");
  });
});

describe("acceptance-report CLI", () => {
  it("compiles the fixture phase into a well-formed report file", () => {
    const outDir = mkdtempSync(join(tmpdir(), "silid-acceptance-"));
    const outFile = join(outDir, "phase-00-fixture-acceptance.md");
    try {
      execFileSync(
        process.execPath,
        [
          join(packageRoot, "src", "acceptance-report.ts"),
          "--phase-file",
          fixturePhaseFile,
          "--results",
          fixtureResultsFile,
          "--out",
          outFile,
        ],
        { cwd: packageRoot, stdio: "pipe" },
      );
      const report = readFileSync(outFile, "utf8");
      expect(report).toContain("# Phase 00 — Client Acceptance Report");
      expect(report).toContain("ALL GREEN");
      // well-formed: every capability line carries all three proof slots
      expect(report.match(/proof clip:/g)?.length).toBe(2);
      expect(report.match(/attack test:/g)?.length).toBe(2);
      expect(report.match(/evidence: /g)?.length).toBe(2);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});
