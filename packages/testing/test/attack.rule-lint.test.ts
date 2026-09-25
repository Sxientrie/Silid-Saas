// ATTACK BATTERY — Phase 01 (scaffolding), rule-lint surface.
//
// Authored by the isolated attacker sub-agent. These tests probe the
// documentation rule linter (`node packages/testing/src/rule-lint.ts`) with
// newly authored non-compliant fixtures under test/fixtures/attacker/.
//
// Tests in the "confirmed breaks" sections assert the behavior the pipeline
// SHOULD have (per spec/00-master-goal.md and spec/builder-protocol.md).
// Each one currently FAILS — that failure is the documented break, returned
// to the builder by the runner; the phase re-opens until every test here
// passes, and every test here is then retained as a permanent regression
// test. The fixture material is kept out of the default scanned tree on
// purpose: the default scan covers spec/*.md, roadmap/*.md and the root
// PROGRESS.md, and the compliant tree must stay clean with these fixtures
// present (asserted below).

import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const RULE_LINT = join(REPO_ROOT, "packages", "testing", "src", "rule-lint.ts");
const ATTACKER_FIXTURES = join(
  REPO_ROOT,
  "packages",
  "testing",
  "test",
  "fixtures",
  "attacker",
);

interface LintResult {
  code: number;
  output: string;
}

function runRuleLint(paths: string[] = []): LintResult {
  try {
    const output = execFileSync(process.execPath, [RULE_LINT, ...paths], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
    return { code: 0, output };
  } catch (error) {
    const err = error as { status?: number; stdout?: string; stderr?: string };
    return {
      code: err.status ?? 1,
      output: `${err.stdout ?? ""}${err.stderr ?? ""}`,
    };
  }
}

const countOccurrences = (haystack: string, needle: string): number =>
  haystack.split(needle).length - 1;

describe("attack: rule-lint — compliant tree baseline", () => {
  it("the default scan stays clean while the attacker fixtures are present", () => {
    const run = runRuleLint();
    expect(run.code).toBe(0);
    expect(run.output).toContain("clean");
    // The default scan must not have started scanning the attacker fixtures
    // (if it had, it would flag them and the count of scanned files would
    // change; either way the tree is no longer compliant-clean).
    expect(run.output).not.toContain("attacker");
  });
});

describe("attack: rule-lint — terminology rule (claim: survives)", () => {
  it("flags the unqualified forbidden term in every markdown context", () => {
    const run = runRuleLint([
      join(ATTACKER_FIXTURES, "terminology", "contexts.md"),
    ]);
    // heading, table cell, inline code, uppercase, capitalized, bold, link
    // text, fenced code block, list item, blockquote, plain paragraph,
    // sub-heading — twelve planted occurrences, all must be flagged.
    expect(run.code).toBe(1);
    expect(countOccurrences(run.output, "[terminology-qualified]")).toBe(12);
    expect(run.output).toContain("12 violation(s)");
  });
});

describe("attack: rule-lint — acceptance-input sentence rule", () => {
  it("detects a plain two-sentence input in a roadmap-named file (control)", () => {
    // Control: proves the fixture naming used below is inside the rule's
    // detection scope, so the escapes in the break tests are real evasions.
    const run = runRuleLint([
      join(ATTACKER_FIXTURES, "roadmap", "07-control-two-sentences.md"),
    ]);
    expect(run.code).toBe(1);
    expect(run.output).toContain("[acceptance-input-sentence]");
  });

  it(
    "flags a two-sentence input hidden in a duplicate acceptance section",
    () => {
      const run = runRuleLint([
        join(ATTACKER_FIXTURES, "roadmap", "07-duplicate-acceptance-section.md"),
      ]);
      // BREAK (observed 2026-09-25, exit 0, clean): only the FIRST
      // "## Acceptance-report inputs" section is parsed; a violating input
      // in a second section passes even though the file sits in a
      // roadmap-scoped path.
      expect(run.code).toBe(1);
      expect(run.output).toContain("[acceptance-input-sentence]");
    },
  );

  it(
    "flags a two-sentence input under an alternate acceptance heading",
    () => {
      const run = runRuleLint([
        join(ATTACKER_FIXTURES, "roadmap", "07-alt-acceptance-heading.md"),
      ]);
      // BREAK (observed 2026-09-25, exit 0, clean): the section matcher is
      // literal "## Acceptance-report inputs"; "## Acceptance report
      // inputs" is not scanned at all, so the non-compliant input passes.
      expect(run.code).toBe(1);
      expect(run.output).toContain("[acceptance-input-sentence]");
    },
  );
});

describe("attack: rule-lint — acceptance-input scope (claim: survives)", () => {
  it("flags a two-sentence input in a phase file missing the NN- prefix", () => {
    const run = runRuleLint([
      join(ATTACKER_FIXTURES, "roadmap", "phase-misnamed-no-nn.md"),
    ]);
    // Survives: the acceptance-input rule scopes by the CONTAINING PATH (a
    // directory named roadmap) or the NN- basename prefix, so a misnamed
    // phase file inside a roadmap directory is still checked. Caveat
    // recorded: the same content in a non-roadmap directory (e.g.
    // "road/phase-five.md" probed during recon) escapes the rule — the
    // scope trigger is the path, not the phase-file format.
    expect(run.code).toBe(1);
    expect(run.output).toContain("[acceptance-input-sentence]");
  });
});

describe("attack: rule-lint — evidence-tag rule on PROGRESS.md", () => {
  it("flags a DONE claim written in lowercase", () => {
    const run = runRuleLint([
      join(ATTACKER_FIXTURES, "progress", "status-done-lowercase", "PROGRESS.md"),
    ]);
    // BREAK (observed 2026-09-25): the DONE detection matches the literal
    // string "STATUS: DONE"; "status: done" carries no resolvable EVIDENCE
    // tag yet passes clean.
    expect(run.code).toBe(1);
    expect(run.output).toContain("[evidence-tag-missing]");
  });

  it("rejects an EVIDENCE tag citing a path that does not exist", () => {
    const run = runRuleLint([
      join(ATTACKER_FIXTURES, "progress", "ghost-evidence-path", "PROGRESS.md"),
    ]);
    // BREAK (observed 2026-09-25, exit 0, clean): when the cited path cannot
    // be resolved to a file on disk, the resolvability check is skipped
    // entirely and the tag counts as resolvable. A DONE claim whose only
    // EVIDENCE tag points at /Silid/spec/attacker-ghost-does-not-exist.md
    // passes clean at the CI invocation (cwd = repo root).
    expect(run.code).toBe(1);
    expect(run.output).toContain("[evidence-tag-missing]");
  });

  it("rejects malformed EVIDENCE tags (sha/path/line shape)", () => {
    const run = runRuleLint([
      join(ATTACKER_FIXTURES, "progress", "malformed-evidence", "PROGRESS.md"),
    ]);
    // Partially survives (observed 2026-09-25): a three-character sha, a
    // missing sha, and a missing :line suffix ARE flagged (3 violations)
    // when the cited path resolves from the repo root. The BREAK: a
    // repo-relative path without the /Silid prefix
    // ("EVIDENCE a1b2c3d spec/00-master-goal.md:1") is accepted as
    // resolvable because plain relative resolution finds the file — so the
    // fourth task block escapes and only 3 of 4 required violations fire.
    expect(run.code).toBe(1);
    expect(countOccurrences(run.output, "[evidence-tag-missing]")).toBe(4);
  });

  it("flags DONE claims in alternate task-block shapes", () => {
    const run = runRuleLint([
      join(ATTACKER_FIXTURES, "progress", "alt-task-shapes", "PROGRESS.md"),
    ]);
    // Partially survives (observed 2026-09-25): the task-block detector
    // keys on ANY level-3 "### ..." heading plus the literal "STATUS: DONE"
    // line — so "### Deliverable two" IS flagged. The BREAK: the other
    // three shapes escape entirely — an H4 heading ("#### Task one"), a
    // bold task header ("**Task three**"), and a bullet-style task line
    // ("- Task four: STATUS: DONE ...") claim DONE with no EVIDENCE tag and
    // pass clean. Required: 4 violations; observed: 1.
    expect(run.code).toBe(1);
    expect(countOccurrences(run.output, "[evidence-tag-missing]")).toBe(4);
  });
});
