// Rule linter (roadmap 01, Deliverable 14) — fails CI on
// documentation-pipeline violations:
//   1. the unqualified term outside permitted quotations in spec/ and
//      roadmap artifacts (Terminology rule, spec/00-master-goal.md),
//   2. missing EVIDENCE tags on PROGRESS.md completion claims,
//   3. acceptance inputs that are not single sentences
//      (spec/builder-protocol.md §5).
//
// Run as a CLI from the repo root (paths default to the real artifacts):
//   node packages/testing/src/rule-lint.ts [files...]

import { readFileSync, readdirSync, realpathSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseAcceptanceInputs } from "./acceptance-report.ts";

export interface LintViolation {
  file: string;
  line: number;
  rule:
    | "terminology-qualified"
    | "evidence-tag-missing"
    | "acceptance-input-sentence";
  message: string;
}

/**
 * Flags every bare use of the term that is not qualified ("guest
 * billing" / "platform billing", including hyphenated and soft-wrap
 * forms). The master goal's own TERMINOLOGY section — the definition
 * home of the rule — is the one permitted span, and spec/CRITIQUE.md is
 * excluded wholesale as a historical review record (spec/00-master-goal
 * .md, Step 6: "a historical review record, and nothing more"); its
 * bare occurrences quote the pre-fix wording of fixed findings.
 */
export function checkTerminology(
  file: string,
  text: string,
): LintViolation[] {
  if (basename(file) === "CRITIQUE.md") return [];

  const lineStarts: number[] = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") lineStarts.push(i + 1);
  }
  const lineOf = (index: number): number => {
    let line = 0;
    for (const start of lineStarts) {
      if (start <= index) line += 1;
      else break;
    }
    return line;
  };
  const columnOf = (index: number): number =>
    index - (lineStarts[lineOf(index) - 1] ?? 0) + 1;

  // The permitted span: inside 00-master-goal.md, from the TERMINOLOGY
  // header through the section's closing divider (skipping the divider
  // that underlines the header itself).
  let allowedStart = -1;
  let allowedEnd = -1;
  const lines = text.split(/\r?\n/);
  const headerIndex = lines.findIndex(
    (line) => line.includes("TERMINOLOGY") && line.includes("GUEST BILLING"),
  );
  if (headerIndex >= 0) {
    let close = headerIndex + 1;
    if (lines[close]?.includes("════")) close += 1;
    const endIdx = lines.findIndex(
      (line, idx) => idx >= close && line.includes("════"),
    );
    allowedStart = lineStarts[headerIndex] ?? 0;
    allowedEnd =
      endIdx < 0 ? text.length : (lineStarts[endIdx] ?? text.length);
  }

  const violations: LintViolation[] = [];
  const pattern = /\b(?:guest|platform)[\s-]*billing|\bbilling\b/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const isQualified = /^(guest|platform)/i.test(match[0]);
    if (
      isQualified ||
      (match.index >= allowedStart && match.index < allowedEnd)
    ) {
      continue;
    }
    violations.push({
      file,
      line: lineOf(match.index),
      rule: "terminology-qualified",
      message: `unqualified term at column ${columnOf(match.index)} — use "guest billing" or "platform billing" (Terminology rule, spec/00-master-goal.md)`,
    });
  }
  return violations;
}

/**
 * Every task block in PROGRESS.md whose closing STATUS line claims DONE
 * must contain at least one well-formed EVIDENCE tag
 * (spec/builder-protocol.md §1).
 */
export function checkEvidenceTags(
  file: string,
  text: string,
): LintViolation[] {
  const violations: LintViolation[] = [];
  const allLines = text.split(/\r?\n/);
  const blocks = text.split(/^### /m).slice(1);
  let searchOffset = 0;
  blocks.forEach((block) => {
    const statusLine = block
      .split(/\r?\n/)
      .find((line) => line.startsWith("STATUS:"));
    if (!statusLine || !/\bDONE\b/.test(statusLine)) {
      searchOffset += block.length;
      return;
    }
    if (!/\bEVIDENCE\s+[0-9a-f]{7,40}\s+\S+:\d+/.test(block)) {
      const lineIndex = allLines.findIndex((l) => l === statusLine);
      violations.push({
        file,
        line: lineIndex + 1,
        rule: "evidence-tag-missing",
        message: `task block claims DONE ("${statusLine.slice(0, 70)}") without a resolvable EVIDENCE tag (spec/builder-protocol.md §1)`,
      });
    }
    searchOffset += block.length;
  });
  return violations;
}

/**
 * Every acceptance input must be a single, observable, falsifiable
 * sentence — exactly one sentence terminator, at the end
 * (spec/builder-protocol.md §5).
 */
export function checkAcceptanceInputSentences(
  file: string,
  text: string,
): LintViolation[] {
  const violations: LintViolation[] = [];
  const inputs = parseAcceptanceInputs(text);
  if (inputs.length === 0) return violations;
  const sectionStart =
    /^##\s+Acceptance-report inputs\s*$/im.exec(text)?.index ?? 0;
  const afterSection = text.slice(sectionStart);
  const inputLines: number[] = [];
  const bulletRe = /^([ \t]*)-[ \t]+/gm;
  let bulletMatch: RegExpExecArray | null;
  while ((bulletMatch = bulletRe.exec(afterSection)) !== null) {
    const absolute = sectionStart + bulletMatch.index;
    inputLines.push(text.slice(0, absolute).split(/\r?\n/).length);
  }
  inputs.forEach((input, i) => {
    const stripped = /^".*"$/s.test(input) ? input.slice(1, -1).trim() : input;
    const single = isSingleSentence(stripped);
    if (!single) {
      violations.push({
        file,
        line: inputLines[i] ?? 1,
        rule: "acceptance-input-sentence",
        message: `acceptance input is not a single sentence: "${input.slice(0, 80)}" (spec/builder-protocol.md §5)`,
      });
    }
  });
  return violations;
}

/**
 * A single sentence: non-empty, exactly one sentence boundary (a
 * terminator followed by whitespace and a new capital/quote — which
 * keeps ".md" file names and "e.g." abbreviations from counting as
 * boundaries), terminated at the end.
 */
export function isSingleSentence(sentence: string): boolean {
  if (sentence.length === 0) return false;
  if (!/[.!?]$/.test(sentence)) return false;
  const boundaries = sentence.split(
    /(?<=[.!?])["']?\s+(?=["A-Z(₱])/,
  );
  return boundaries.length === 1;
}

function appliesTo(file: string): {
  terminology: boolean;
  evidence: boolean;
  acceptanceInputs: boolean;
} {
  const name = basename(file);
  return {
    terminology: name !== "CRITIQUE.md",
    evidence: name === "PROGRESS.md",
    acceptanceInputs:
      /^(phase-\d{2}|\d{2}-)/.test(name) || file.includes("roadmap"),
  };
}

/** Runs every applicable check over the given files. */
export function lintFiles(files: string[]): LintViolation[] {
  const violations: LintViolation[] = [];
  for (const file of files) {
    const applicable = appliesTo(file);
    const text = readFileSync(file, "utf8");
    if (applicable.terminology) {
      violations.push(...checkTerminology(file, text));
    }
    if (applicable.evidence) {
      violations.push(...checkEvidenceTags(file, text));
    }
    if (applicable.acceptanceInputs) {
      violations.push(...checkAcceptanceInputSentences(file, text));
    }
  }
  return violations;
}

/** The default scan set when the CLI runs with no explicit files. */
function defaultArtifactFiles(): string[] {
  const files: string[] = [];
  for (const dir of ["spec", "roadmap"]) {
    for (const entry of readdirSync(resolve(dir))) {
      if (entry.endsWith(".md")) files.push(resolve(dir, entry));
    }
  }
  files.push(resolve("PROGRESS.md"));
  return files;
}

function main(argv: string[]): number {
  const files =
    argv.length > 0
      ? argv.map((f) => resolve(f))
      : defaultArtifactFiles();
  const violations = lintFiles(files);
  if (violations.length === 0) {
    console.log(`rule-lint: clean (${files.length} files scanned)`);
    return 0;
  }
  for (const violation of violations) {
    console.error(
      `rule-lint: ${violation.file}:${violation.line} [${violation.rule}] ${violation.message}`,
    );
  }
  console.error(
    `rule-lint: ${violations.length} violation(s) across ${files.length} files`,
  );
  return 1;
}

const invokedDirectly = (() => {
  try {
    const real = (path: string): string => {
      try {
        return realpathSync(path);
      } catch {
        return path;
      }
    };
    return (
      real(fileURLToPath(import.meta.url)) ===
      real(resolve(process.argv[1] ?? ""))
    );
  } catch {
    return false;
  }
})();

if (invokedDirectly) process.exit(main(process.argv.slice(2)));
