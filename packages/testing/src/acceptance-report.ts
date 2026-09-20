// Acceptance-report generator (roadmap 01, Deliverable 13).
//
// Compiles a phase's client acceptance report from the phase file's
// "Acceptance-report inputs" section plus that phase's recorded test
// results: one plain-language line per capability with its proof clip,
// attack test, and EVIDENCE slots, plus the MONEY RECOMPUTATION GATE and
// MUTATION GATE result lines (spec/00-master-goal.md, ACCEPTANCE REPORTS
// & PROOF CLIPS).
//
// Run as a CLI from the repo root:
//   node packages/testing/src/acceptance-report.ts \
//     --phase-file roadmap/01-scaffolding.md \
//     --results <results.json> \
//     --out reports/phase-01-acceptance.md

import { readFileSync, writeFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export interface CapabilityResult {
  status: "pass" | "fail" | "blocked";
  /** Path to the recorded proof clip (reports/proof/...). */
  clip?: string;
  /** The attack test that tried to break this claim (name + file). */
  attackTest?: string;
  /** The EVIDENCE tag binding the claim to git. */
  evidence?: string;
}

/** One entry of a results file: the capability sentence plus its proof. */
export interface CapabilityResultRecord extends CapabilityResult {
  /** The acceptance-input sentence this result belongs to. */
  input: string;
}

export interface GateResult {
  status: "pass" | "fail" | "not-applicable";
  /** One-line plain-language detail (counts, threshold, report path). */
  detail: string;
}

export interface AcceptanceReportModel {
  phase: string;
  phaseTitle?: string;
  /** The acceptance inputs, one falsifiable sentence per capability. */
  inputs: string[];
  results: CapabilityResultRecord[];
  moneyGate: GateResult;
  mutationGate: GateResult;
}

/** Normalizes a sentence for matching results to acceptance inputs. */
export function normalizeSentence(sentence: string): string {
  return sentence
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Extracts the acceptance-input sentences from a phase file's
 * "## Acceptance-report inputs" section (bullets, optionally quoted).
 */
export function parseAcceptanceInputs(phaseFileMarkdown: string): string[] {
  const sectionStart =
    /^##\s+Acceptance-report inputs\s*$/im.exec(phaseFileMarkdown);
  if (!sectionStart || sectionStart.index === undefined) return [];
  const rest = phaseFileMarkdown.slice(
    sectionStart.index + sectionStart[0].length,
  );
  const nextSection = /^##\s/m.exec(rest);
  const section = nextSection ? rest.slice(0, nextSection.index) : rest;
  return section
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim())
    .map((line) =>
      /^".*"$/s.test(line) ? line.slice(1, -1).trim() : line,
    );
}

/** Parses and validates a results JSON file's text. */
export function parseResultsFile(
  resultsJson: string,
): Omit<AcceptanceReportModel, "inputs"> {
  const parsed: unknown = JSON.parse(resultsJson);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("results file must be a JSON object");
  }
  const model = parsed as Partial<AcceptanceReportModel>;
  if (typeof model.phase !== "string" || model.phase === "") {
    throw new Error("results file requires a non-empty \"phase\"");
  }
  if (!Array.isArray(model.results)) {
    throw new Error("results file requires a \"results\" array");
  }
  for (const result of model.results) {
    if (
      typeof result !== "object" ||
      result === null ||
      typeof result.input !== "string" ||
      !["pass", "fail", "blocked"].includes(result.status)
    ) {
      throw new Error(
        "every result requires \"input\" (string) and \"status\" (pass|fail|blocked)",
      );
    }
  }
  if (!isGate(model.moneyGate) || !isGate(model.mutationGate)) {
    throw new Error(
      "results file requires \"moneyGate\" and \"mutationGate\" ({status: pass|fail|not-applicable, detail})",
    );
  }
  return {
    phase: model.phase,
    phaseTitle: model.phaseTitle,
    results: model.results,
    moneyGate: model.moneyGate,
    mutationGate: model.mutationGate,
  };
}

function isGate(value: unknown): value is GateResult {
  return (
    typeof value === "object" &&
    value !== null &&
    ["pass", "fail", "not-applicable"].includes(
      (value as GateResult).status,
    ) &&
    typeof (value as GateResult).detail === "string"
  );
}

function renderGateLine(label: string, gate: GateResult): string {
  const status =
    gate.status === "pass"
      ? "PASS"
      : gate.status === "fail"
        ? "FAIL"
        : "NOT APPLICABLE";
  return `- ${label}: ${status} — ${gate.detail}`;
}

function renderCapabilityLine(
  sentence: string,
  result: CapabilityResult,
): string {
  const slot = (label: string, value?: string) =>
    `${label}: ${value ?? "none recorded"}`;
  return [
    `- **${result.status.toUpperCase()}** — ${sentence}`,
    `  - ${slot("proof clip", result.clip)}`,
    `  - ${slot("attack test", result.attackTest)}`,
    `  - ${slot("evidence", result.evidence)}`,
  ].join("\n");
}

/** Compiles the acceptance-report markdown for a phase. */
export function buildAcceptanceReport(model: AcceptanceReportModel): string {
  const byInput = new Map<string, CapabilityResult>();
  for (const result of model.results) {
    byInput.set(normalizeSentence(result.input), result);
  }
  const lines: string[] = [];
  lines.push(
    `# Phase ${model.phase} — Client Acceptance Report`,
    "",
    `_Generated by the @silid/testing acceptance-report generator from the phase file's acceptance inputs and recorded test results._`,
    "",
  );

  let green = 0;
  const capabilityLines: string[] = [];
  for (const sentence of model.inputs) {
    const result =
      byInput.get(normalizeSentence(sentence)) ??
      ({ status: "blocked" } as CapabilityResult);
    if (result.status === "pass") green += 1;
    capabilityLines.push(renderCapabilityLine(sentence, result));
  }
  lines.push("## Capabilities", "", ...capabilityLines, "");

  lines.push("## Gates", "");
  lines.push(renderGateLine("MONEY RECOMPUTATION GATE", model.moneyGate));
  lines.push(renderGateLine("MUTATION GATE", model.mutationGate));
  lines.push("");

  const verdict = green === model.inputs.length ? "ALL GREEN" : "NOT GREEN";
  lines.push(
    "## Verdict",
    "",
    `${verdict} — ${green}/${model.inputs.length} capability lines green. ` +
      `Every line must be green (and every clip play) before the phase closes.`,
    "",
  );
  return lines.join("\n");
}

/** "ALL GREEN" iff every capability line is green. */
export function reportVerdict(report: string): string {
  return report.includes("ALL GREEN —")
    ? "ALL GREEN"
    : report.includes("NOT GREEN —")
      ? "NOT GREEN"
      : "UNKNOWN";
}

function main(argv: string[]): number {
  const flag = (name: string): string | undefined => {
    const index = argv.indexOf(`--${name}`);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const phaseFile = flag("phase-file");
  const resultsFile = flag("results");
  const outFile = flag("out");
  if (!phaseFile || !resultsFile || !outFile) {
    console.error(
      "usage: node acceptance-report.ts --phase-file <phase.md> --results <results.json> --out <report.md>",
    );
    return 1;
  }
  const inputs = parseAcceptanceInputs(readFileSync(phaseFile, "utf8"));
  if (inputs.length === 0) {
    console.error(
      `no acceptance inputs found under "## Acceptance-report inputs" in ${phaseFile}`,
    );
    return 1;
  }
  const model: AcceptanceReportModel = {
    inputs,
    ...parseResultsFile(readFileSync(resultsFile, "utf8")),
  };
  const report = buildAcceptanceReport(model);
  writeFileSync(outFile, report, "utf8");
  console.log(
    `wrote ${outFile} — ${reportVerdict(report)} (${model.inputs.length} capability lines)`,
  );
  return 0;
}

const invokedDirectly = (() => {
  try {
    const thisFile = realpathSync(fileURLToPath(import.meta.url));
    const invoked = realpathSync(resolve(process.argv[1] ?? ""));
    return thisFile === invoked;
  } catch {
    return false;
  }
})();

if (invokedDirectly) process.exit(main(process.argv.slice(2)));
