// Rule: the Supabase tooling mandate must be present in the root AGENTS.md.
//
// spec/00-master-goal.md and spec/supabase.md §3 state the requirement — every
// agent operates Supabase through the MCP server and the official skill — but
// the requirement lived only in spec prose, which a session has to go looking
// for. These tests pin the enforcement: the check fires on a missing file and
// on each individually-dropped part of the mandate, stays silent on a
// compliant root, and is actually wired into the CLI invocation CI runs.

import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkSupabaseToolingMandate } from "../src/rule-lint.js";

const REPO_ROOT = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const RULE_LINT = join(REPO_ROOT, "packages", "testing", "src", "rule-lint.ts");
const FIXTURES = join(
  REPO_ROOT,
  "packages",
  "testing",
  "test",
  "fixtures",
  "mandate",
);

const elementsOf = (rootDir: string): string[] =>
  checkSupabaseToolingMandate(rootDir).map(
    (v) =>
      // "<element>: <message>" -> "<element>"
      v.message.split(":")[0] ?? "",
  );

function runRuleLintIn(
  cwd: string,
  files: string[],
): { code: number; output: string } {
  try {
    const output = execFileSync(process.execPath, [RULE_LINT, ...files], {
      cwd,
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

describe("checkSupabaseToolingMandate — the real repo root", () => {
  it("is compliant, so the rule does not fire on the tree it ships with", () => {
    expect(checkSupabaseToolingMandate(REPO_ROOT)).toEqual([]);
  });

  it("defaults to the current working directory, which is what the CLI uses", () => {
    const previous = process.cwd();
    try {
      process.chdir(FIXTURES);
      expect(checkSupabaseToolingMandate()).toHaveLength(1);
    } finally {
      process.chdir(previous);
    }
  });
});

describe("checkSupabaseToolingMandate — a missing mandate", () => {
  it("reports the absent file itself, not a vacuous pass", () => {
    const violations = checkSupabaseToolingMandate(join(FIXTURES, "no-file"));
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      rule: "supabase-tooling-mandate",
      line: 1,
    });
    expect(violations[0]!.file.replace(/\\/g, "/")).toContain(
      "fixtures/mandate/no-file/AGENTS.md",
    );
  });

  it("reports every dropped part separately when the file exists but is hollow", () => {
    expect(elementsOf(join(FIXTURES, "empty")).sort()).toEqual([
      "bypass-ban",
      "mcp-server-path",
      "official-skill",
    ]);
  });

  it("still fires on the parts a partial file kept", () => {
    // The trap this guards: a file that says "use the Supabase MCP server" and
    // stops there satisfies the mandate in a reader's eyes while permitting
    // every bypass and the skill omission. Naming the MCP path is not enough.
    const elements = elementsOf(join(FIXTURES, "partial"));
    expect(elements.sort()).toEqual(["bypass-ban", "official-skill"]);
    expect(elements).not.toContain("mcp-server-path");
  });
});

describe("checkSupabaseToolingMandate — CLI wiring", () => {
  it("passes on a compliant root, proving the check is not unconditionally red", () => {
    const run = runRuleLintIn(join(FIXTURES, "full"), ["clean.md"]);
    expect(run.code).toBe(0);
    expect(run.output).toContain("clean");
  });

  it("fails a run whose root has no AGENTS.md, even with an explicit file", () => {
    // Naming a file on the command line is not a waiver of a repo-level
    // invariant — that is the escape hatch a caller would reach for.
    const run = runRuleLintIn(join(FIXTURES, "no-file"), ["clean.md"]);
    expect(run.code).toBe(1);
    expect(run.output).toContain("[supabase-tooling-mandate]");
  });

  it("leaves the documented CI invocation clean", () => {
    const run = runRuleLintIn(REPO_ROOT, []);
    expect(run.code).toBe(0);
    expect(run.output).toContain("clean");
  }, 120_000);
});
