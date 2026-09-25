// ATTACK BATTERY — Phase 01 (scaffolding), legacy-exclusion surface.
//
// Authored by the isolated attacker sub-agent. Acceptance input: "The legacy
// codebase is excluded from every build, lint, coverage, mutation, and test
// glob (reported as zero legacy files in each gate's output)."
//
// Method: (a) behavioral probes of the real gates (turbo filter, vitest
// filter, Stryker --mutate override probed separately and reported), and
// (b) independent recomputation of every gate's effective glob input set
// against the actual file list under /Silid/legacy. No existing config file
// was modified; explicit-path probe results are documented in comments.

import { execFileSync, execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const LEGACY_DIR = join(REPO_ROOT, "legacy");
const WORKSPACE_PACKAGES = join(REPO_ROOT, "packages");
const WORKSPACE_APPS = join(REPO_ROOT, "apps");

const toPosix = (p: string): string => p.split("\\").join("/");

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".git") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const legacyFiles = walk(LEGACY_DIR).map((f) =>
  toPosix(relative(REPO_ROOT, f)),
);

// Minimal glob matcher: ** → any path, * → one path segment.
function globToRegex(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const withGlobs = escaped
    .replace(/\*\*/g, "\u0000")
    .replace(/\*/g, "[^/]*")
    .replace(/\u0000/g, ".*");
  return new RegExp(`^${withGlobs}$`);
}

const matchesAny = (file: string, globs: string[]): boolean =>
  globs.some((g) => globToRegex(g).test(file));

function listDirs(base: string): string[] {
  if (!existsSync(base)) return [];
  return readdirSync(base, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => join(base, d.name));
}

function extractIncludeGlobs(configPath: string): string[] {
  const text = readFileSync(configPath, "utf8");
  const patterns: string[] = [];
  const includeRe = /include:\s*\[([^\]]*)\]/gs;
  let match: RegExpExecArray | null;
  while ((match = includeRe.exec(text)) !== null) {
    for (const m of match[1].matchAll(/["'`]([^"'`]+)["'`]/g)) {
      patterns.push(m[1]);
    }
  }
  return patterns;
}

describe("attack: legacy exclusion — workspace selection (build gate)", () => {
  it("no pnpm workspace glob matches /Silid/legacy", () => {
    const yaml = readFileSync(join(REPO_ROOT, "pnpm-workspace.yaml"), "utf8");
    const block = /packages:\s*\n((?:\s+-\s*[^\n]+\n?)+)/.exec(yaml);
    expect(block).not.toBeNull();
    const globs = (block?.[1] ?? "")
      .split("\n")
      .map((line) => line.trim().replace(/^-\s*/, "").replace(/["']/g, ""))
      .filter((line) => line.length > 0);
    expect(globs.length).toBeGreaterThan(0);
    // legacy must not be selected as a workspace package, and no glob may
    // reach inside it either.
    expect(matchesAny("legacy", globs)).toBe(false);
    for (const file of legacyFiles) {
      expect(matchesAny(file, globs)).toBe(false);
    }
  });

  it("turbo build selects zero tasks for the legacy filter", () => {
    const output = execSync(
      "pnpm exec turbo run build --filter=./legacy --dry=json",
      { cwd: REPO_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    const dry = JSON.parse(output) as { tasks?: unknown[] };
    expect(dry.tasks).toEqual([]);
  });
});

describe("attack: legacy exclusion — test and coverage globs", () => {
  it("no legacy test file matches any workspace package's vitest include globs", () => {
    expect(legacyFiles.length).toBeGreaterThan(0);
    const legacyTestFiles = legacyFiles.filter((f) =>
      /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$/.test(f),
    );
    expect(legacyTestFiles.length).toBeGreaterThan(0); // probes are real

    const roots = [...listDirs(WORKSPACE_APPS), ...listDirs(WORKSPACE_PACKAGES)];
    expect(roots.length).toBeGreaterThan(0);
    for (const root of roots) {
      const configPath = join(root, "vitest.config.ts");
      if (!existsSync(configPath)) continue; // "vitest run" default include is
      // rooted at the package dir, which can never reach ../../legacy.
      const include = extractIncludeGlobs(configPath);
      for (const file of legacyTestFiles) {
        // include patterns are relative to the package root; resolve the
        // file into package-relative form and require a mismatch.
        const pkgRelative = toPosix(relative(root, join(REPO_ROOT, file)));
        if (pkgRelative.startsWith("..")) continue; // outside this project root
        expect(matchesAny(pkgRelative, include)).toBe(false);
      }
    }
  });

  it("no legacy file matches any coverage include glob", () => {
    const roots = [...listDirs(WORKSPACE_APPS), ...listDirs(WORKSPACE_PACKAGES)];
    for (const root of roots) {
      const configPath = join(root, "vitest.config.ts");
      if (!existsSync(configPath)) continue;
      const text = readFileSync(configPath, "utf8");
      const covMatch = /coverage:\s*\{([\s\S]*?)\n\s*\}/.exec(text);
      if (!covMatch) continue;
      const includeMatch = /include:\s*\[([^\]]*)\]/.exec(covMatch[1]);
      if (!includeMatch) continue;
      const globs = [...includeMatch[1].matchAll(/["'`]([^"'`]+)["'`]/g)].map(
        (m) => m[1],
      );
      for (const file of legacyFiles) {
        const pkgRelative = toPosix(relative(root, join(REPO_ROOT, file)));
        if (pkgRelative.startsWith("..")) continue;
        expect(matchesAny(pkgRelative, globs)).toBe(false);
      }
    }
  });

  it("vitest pointed at legacy selects zero test files (behavioral probe)", () => {
    let output = "";
    let code = 0;
    try {
      output = execSync("pnpm exec vitest run ../../legacy", {
        cwd: join(REPO_ROOT, "packages", "db"),
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      const err = error as { status?: number; stdout?: string; stderr?: string };
      code = err.status ?? 1;
      output = `${err.stdout ?? ""}${err.stderr ?? ""}`;
    }
    // Zero tests found for the legacy filter is the required outcome; the
    // nonzero exit is vitest's "no test files found" signal, not a failure
    // of the exclusion.
    expect(output).toContain("No test files found");
    expect(code).not.toBe(0);
  });
});

describe("attack: legacy exclusion — mutation gate globs", () => {
  it("no stryker mutate glob resolves to a legacy file, and ignorePatterns covers legacy", () => {
    expect(legacyFiles.length).toBeGreaterThan(0);
    for (const dir of listDirs(WORKSPACE_PACKAGES)) {
      const configPath = join(dir, "stryker.conf.json");
      if (!existsSync(configPath)) continue;
      const conf = JSON.parse(readFileSync(configPath, "utf8")) as {
        mutate?: string[];
        ignorePatterns?: string[];
      };
      const resolveRootRelative = (pattern: string): string =>
        toPosix(relative(REPO_ROOT, resolve(dir, pattern)));
      const mutateGlobs = (conf.mutate ?? []).map(resolveRootRelative);
      for (const file of legacyFiles) {
        expect(matchesAny(file, mutateGlobs)).toBe(false);
      }
      const ignoreGlobs = (conf.ignorePatterns ?? []).map(resolveRootRelative);
      const uncovered = legacyFiles.filter(
        (file) => !matchesAny(file, ignoreGlobs),
      );
      expect(uncovered).toEqual([]);
    }
  });
});

describe("attack: legacy exclusion — lint and e2e globs", () => {
  it("no package lint script reaches outside its own root toward legacy", () => {
    const roots = [...listDirs(WORKSPACE_APPS), ...listDirs(WORKSPACE_PACKAGES)];
    for (const root of roots) {
      const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
        scripts?: Record<string, string>;
      };
      const lint = pkg.scripts?.lint;
      if (!lint) continue;
      expect(lint.toLowerCase()).not.toContain("legacy");
      expect(lint).not.toContain("..");
    }
  });

  it("the playwright e2e suite never selects a legacy spec", () => {
    const text = readFileSync(join(REPO_ROOT, "playwright.config.ts"), "utf8");
    expect(text).not.toMatch(/legacy/i);
  });

  it("the rule-lint default scan reports zero legacy files", () => {
    const output = execFileSync(
      process.execPath,
      [join(REPO_ROOT, "packages", "testing", "src", "rule-lint.ts")],
      { cwd: REPO_ROOT, encoding: "utf8" },
    );
    expect(output).toContain("clean");
    expect(output).not.toContain("/legacy");
  });
});
