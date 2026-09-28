import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Roadmap 06 Deliverable 3 / Definition of done: "The room grid reflects only
 * server-side status; no client code path mutates room status (grep + test
 * proof)." This file is the grep half, executable so it cannot rot: every
 * Frontdesk client source file is scanned for the PostgREST write shapes that
 * could reach the rooms table (or any status write at all). Reads and
 * mutations belong to the claim-scoped tRPC procedures; a `.update(`/`.upsert(`
 * /`.rpc(` call in client code is a defect by definition (vault-15,
 * spec/domain-rules.md §4).
 *
 * The other half is the database's: `rooms` carries no UPDATE policy for any
 * role (supabase/tests/02_tenant_isolation_test.sql), so even a path that
 * appeared here would be refused by RLS.
 */
function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, files);
    } else {
      files.push(full);
    }
  }
  return files;
}

const SRC = join(import.meta.dirname ?? ".", "..", "src");
const CLIENT_SOURCES = walk(SRC).filter((file) => /\.(ts|tsx)$/.test(file) && !/\.d\.ts$/.test(file));

// The only sanctioned write channels are the outbox dispatcher's procedure
// names (which resolve to tRPC mutations) and the tRPC client itself.
const FORBIDDEN_ROOM_WRITE_PATTERNS: Array<{ pattern: RegExp; why: string }> = [
  { pattern: /\.from\(\s*["'`]rooms["'`]/, why: "direct PostgREST access to rooms from client code" },
  { pattern: /\.update\(/, why: "a client-side row update (no update path exists for any role)" },
  { pattern: /\.upsert\(/, why: "a client-side row upsert (no update path exists for any role)" },
  { pattern: /\.delete\(/, why: "a client-side row delete (no delete path exists for any role)" },
  { pattern: /\.rpc\(/, why: "a client-side RPC call (transitions are procedure-owned)" },
];

describe("no client code path mutates room status (grep proof)", () => {
  it("scans the client source tree", () => {
    expect(CLIENT_SOURCES.length).toBeGreaterThan(10);
  });

  it("finds no PostgREST write shape in any client source file", () => {
    const violations: string[] = [];
    for (const file of CLIENT_SOURCES) {
      const text = readFileSync(file, "utf8");
      for (const { pattern, why } of FORBIDDEN_ROOM_WRITE_PATTERNS) {
        if (pattern.test(text)) {
          violations.push(`${file}: ${why}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("keeps the room grid a pure renderer: RoomGrid receives rows and renders them", () => {
    const grid = readFileSync(join(SRC, "features", "rooms", "RoomGrid.tsx"), "utf8");
    // No mutation library calls, no fetch, no client instances — only props.
    expect(grid).not.toMatch(/useMutation|useCheckIn|useCheckOut|fetch\(|createClient\(/);
    expect(grid).toMatch(/room\.status/);
  });
});
