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
 * "## Acceptance-report inputs" sections (bullets, optionally quoted,
 * possibly soft-wrapped across continuation lines). EVERY matching section
 * is parsed — a duplicate or alternate-spelled section is never silently
 * ignored, so an input hidden in a second section cannot escape the
 * single-sentence rule or the report.
 */
export function parseAcceptanceInputs(phaseFileMarkdown: string): string[] {
  return acceptanceInputSections(phaseFileMarkdown).flatMap(
    (section) => section.inputs,
  );
}

export interface AcceptanceInputSection {
  inputs: string[];
  /** The 1-based line number each bullet starts on. */
  bulletLines: number[];
}

// Global so the multi-section scan's exec loop advances (a non-global
// regex ignores lastIndex and would match the first heading forever).
const ACCEPTANCE_HEADING_RE = /^##\s+Acceptance[- ]report inputs[ \t]*$/gim;

/** Locates and parses every acceptance-inputs section of a phase file. */
export function acceptanceInputSections(
  phaseFileMarkdown: string,
): AcceptanceInputSection[] {
  const sections: AcceptanceInputSection[] = [];
  const heading = ACCEPTANCE_HEADING_RE;
  heading.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = heading.exec(phaseFileMarkdown)) !== null) {
    const bodyStart = match.index + match[0].length;
    const rest = phaseFileMarkdown.slice(bodyStart);
    const nextSection = /^##\s/m.exec(rest);
    const sectionText = nextSection ? rest.slice(0, nextSection.index) : rest;

    const inputs: string[] = [];
    const bulletLines: number[] = [];
    let current: string[] | null = null;
    let currentLine = 0;
    const lines = sectionText.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const bullet = /^[ \t]*-[ \t]+(.*)$/.exec(line);
      if (bullet) {
        if (current) inputs.push(current.join(" "));
        current = [bullet[1]!];
        // +1 for the 1-based count, +1 to skip the heading line itself.
        currentLine = bodyStartOffset(phaseFileMarkdown, bodyStart) + i + 1;
        bulletLines.push(currentLine);
      } else if (current && line.trim() !== "") {
        current.push(line.trim());
      } else if (current && line.trim() === "") {
        inputs.push(current.join(" "));
        current = null;
      }
    }
    if (current) inputs.push(current.join(" "));
    sections.push({
      inputs: inputs
        .map((input) => input.replace(/\s+/g, " ").trim())
        .filter((input) => input !== "")
        .map((input) =>
          /^".*"$/s.test(input) ? input.slice(1, -1).trim() : input,
        ),
      bulletLines,
    });
    // Continue the global scan AFTER this heading so the same heading is
    // never matched twice.
    heading.lastIndex = bodyStart;
  }
  return sections;
}

function bodyStartOffset(text: string, bodyStart: number): number {
  return text.slice(0, bodyStart).split(/\r?\n/).length - 1;
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

/** A capability line counts green only when all three proof slots carry
 *  recorded proof (spec/00-master-goal.md, ACCEPTANCE REPORTS & PROOF
 *  CLIPS: every line links its clip, its attack test, and its EVIDENCE
 *  tag). An empty slot is "none recorded" and can never be green. */
function isFullyProven(result: CapabilityResult): boolean {
  return (
    typeof result.clip === "string" &&
    result.clip.trim() !== "" &&
    typeof result.attackTest === "string" &&
    result.attackTest.trim() !== "" &&
    typeof result.evidence === "string" &&
    result.evidence.trim() !== ""
  );
}

const MUTATION_KILL_RATE_THRESHOLD = 80;

/**
 * Cross-checks a gate's recorded detail against the status it claims, so a
 * detail that contradicts its own status cannot ride a PASS label into an
 * ALL GREEN verdict. Fail-closed: a "pass" gate whose detail cannot be
 * verified is treated as not verified.
 */
export function gateDetailVerified(gate: GateResult): boolean {
  if (gate.status !== "pass") return true;
  const detail = gate.detail;
  // The money gate's pass must affirm zero drift; any positive drift
  // figure contradicts it.
  if (/(zero|no) drift/i.test(detail)) return true;
  const drift = /diff\s*=\s*(\d+(?:\.\d+)?)/i.exec(detail);
  if (drift) return Number(drift[1]) === 0;
  if (/drift/i.test(detail)) return false;
  // The mutation gate's pass must show a kill rate at or above the spec
  // threshold (the threshold percentage a detail may also cite must never
  // stand in for the gate's own rate).
  const labeled = /kill rate\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*%/i.exec(detail);
  const percent = labeled ?? /(\d+(?:\.\d+)?)\s*%/.exec(detail);
  if (percent) {
    return Number(percent[1]) >= MUTATION_KILL_RATE_THRESHOLD;
  }
  // Unverifiable pass detail: fail closed.
  return false;
}

/** Compiles the acceptance-report markdown for a phase. */
export function buildAcceptanceReport(model: AcceptanceReportModel): string {
  // Results are grouped by normalized input. Duplicate entries for one
  // capability are a recorded conflict: the verdict can never be green and
  // the conflict is rendered, never silently last-entry-wins.
  const byInput = new Map<string, CapabilityResultRecord[]>();
  const unmatched: CapabilityResultRecord[] = [];
  const inputKeys = new Set(model.inputs.map(normalizeSentence));
  for (const result of model.results) {
    const key = normalizeSentence(result.input);
    if (!inputKeys.has(key)) {
      unmatched.push(result);
      continue;
    }
    const group = byInput.get(key) ?? [];
    group.push(result);
    byInput.set(key, group);
  }
  const severity = (status: string): number =>
    status === "fail" ? 0 : status === "blocked" ? 1 : 2;
  const worstOf = (group: CapabilityResultRecord[]): CapabilityResultRecord =>
    [...group].sort((a, b) => severity(a.status) - severity(b.status))[0]!;

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
    const group = byInput.get(normalizeSentence(sentence));
    const result = group
      ? worstOf(group)
      : ({ status: "blocked" } as CapabilityResult);
    const lineBits = [renderCapabilityLine(sentence, result)];
    if (group && group.length > 1) {
      lineBits.push(
        `  - CONFLICT: ${group.length} results recorded for this capability (case/spacing variants included) — the verdict cannot be green until one result is recorded.`,
      );
    } else if (result.status === "pass" && !isFullyProven(result)) {
      lineBits.push(
        `  - PROOF INCOMPLETE: a green line requires a recorded proof clip, its attack test, and an EVIDENCE tag — every slot empty is "none recorded" and cannot count as green.`,
      );
    }
    const countsGreen =
      result.status === "pass" &&
      isFullyProven(result) &&
      (!group || group.length === 1);
    if (countsGreen) green += 1;
    capabilityLines.push(lineBits.join("\n"));
  }
  lines.push("## Capabilities", "", ...capabilityLines, "");

  lines.push("## Gates", "");
  lines.push(renderGateLine("MONEY RECOMPUTATION GATE", model.moneyGate));
  lines.push(renderGateLine("MUTATION GATE", model.mutationGate));
  lines.push("");

  const gatesOk =
    model.moneyGate.status !== "fail" &&
    model.mutationGate.status !== "fail" &&
    gateDetailVerified(model.moneyGate) &&
    gateDetailVerified(model.mutationGate);

  if (unmatched.length > 0) {
    lines.push("## Unmatched results", "");
    lines.push(
      "These recorded results match no acceptance input of this phase file — a drifted sentence must never silently swallow a recorded result:",
      "",
    );
    for (const entry of unmatched) {
      lines.push(
        `- **${entry.status.toUpperCase()}** — ${entry.input} (status as recorded; the capability sentence no longer matches)`,
      );
    }
    lines.push("");
  }

  const allCapabilitiesGreen = green === model.inputs.length;
  const verdict =
    allCapabilitiesGreen && gatesOk && unmatched.length === 0
      ? "ALL GREEN"
      : "NOT GREEN";
  const reasons: string[] = [];
  if (!allCapabilitiesGreen) {
    reasons.push(`${green}/${model.inputs.length} capability lines green`);
  }
  if (!gatesOk) {
    reasons.push("a gate failed or its detail contradicts its status");
  }
  if (unmatched.length > 0) {
    reasons.push(`${unmatched.length} recorded result(s) match no acceptance input`);
  }
  lines.push(
    "## Verdict",
    "",
    `${verdict} — ${reasons.join("; ") || "everything recorded is green"}. ` +
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
