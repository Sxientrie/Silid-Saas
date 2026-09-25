import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  ADDON_CATALOGUE,
  CANTEEN_CATALOGUE,
  CANTEEN_CATEGORY_ORDER,
  CURRENCY,
} from "@silid/db";
import {
  defaultAddonCatalogue,
  defaultCanteenCatalogue,
} from "../src/catalogue";

/**
 * Deliverable 6: the catalogue module serves the money reference fixture —
 * and no peso figure is re-typed in client or server code outside the
 * fixture (spec/domain-rules.md §7, MONEY REFERENCE RULE). The grep below
 * enforces the import test mechanically.
 */
describe("defaultAddonCatalogue — served from the fixture", () => {
  it("returns every fixture addon at the fixture price, byte-equal by reference value", () => {
    const addons = defaultAddonCatalogue();
    expect(addons).toHaveLength(Object.keys(ADDON_CATALOGUE).length);
    for (const item of addons) {
      expect(item.price).toBe(ADDON_CATALOGUE[item.id as keyof typeof ADDON_CATALOGUE]);
    }
  });

  it("marks the extension charge as the one cashier-unpostable item (vault-09)", () => {
    const addons = defaultAddonCatalogue();
    expect(addons.find((item) => item.id === "extension_charge")).toMatchObject({
      cashierPostable: false,
    });
    expect(addons.filter((item) => item.id !== "extension_charge").every((item) => item.cashierPostable)).toBe(true);
  });
});

describe("defaultCanteenCatalogue — served from the fixture", () => {
  it("returns every fixture item with fixture label, price, and category", () => {
    const canteen = defaultCanteenCatalogue();
    expect(canteen).toHaveLength(Object.keys(CANTEEN_CATALOGUE).length);
    for (const item of canteen) {
      const fixture = CANTEEN_CATALOGUE[item.id as keyof typeof CANTEEN_CATALOGUE];
      expect(item.label).toBe(fixture.label);
      expect(item.price).toBe(fixture.price);
      expect(item.category).toBe(fixture.category);
    }
  });

  it("orders items by the fixture's category order, then by label", () => {
    const canteen = defaultCanteenCatalogue();
    const categories = [...new Set(canteen.map((item) => item.category))];
    expect(categories).toEqual([...CANTEEN_CATEGORY_ORDER]);
    const others = canteen.filter((item) => item.category === "Others");
    const labels = others.map((item) => item.label);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)));
  });

  it("carries the fixture currency", () => {
    expect(CURRENCY).toBe("PHP");
  });
});

/**
 * The no-re-typed-pesos grep: scan this package's (and the schemas and
 * audit packages') non-fixture sources for peso-shaped literals in
 * money-named contexts. A price written by hand outside the fixture is a
 * defect by definition.
 */
describe("no peso figure is re-typed outside the fixture", () => {
  const scannedRoots = [
    resolve(import.meta.dirname, ".."), // packages/api
    resolve(import.meta.dirname, "../../schemas"), // packages/schemas
    resolve(import.meta.dirname, "../../audit"), // packages/audit
  ];
  // The grep probes the REAL workspace tree on disk. Inside a Stryker
  // sandbox copy the sibling package directories do not exist; the scan
  // self-skips there (it has no mutants to kill in a sandbox anyway).
  const realTree = scannedRoots.every((root) => existsSync(resolve(root, "src")));

  it.skipIf(!realTree)("finds zero money literals in money-named contexts outside the fixture", () => {
    const violations: string[] = [];
    for (const root of scannedRoots) {
      const srcDir = resolve(root, "src");
      for (const file of listTsFiles(srcDir)) {
        if (file.endsWith("money-reference.ts")) continue; // the fixture itself
        const text = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
        for (const [index, line] of text.split(/\r?\n/).entries()) {
          for (const match of line.matchAll(/(?:₱\s?(\d[\d,.]*)|([A-Za-z_]*(?:price|charge|surcharge|total|amount|php)[A-Za-z_]*)\s*[:=]\s*(\d[\d_]*(?:\.\d+)?))/gi)) {
            const figure = match[1] ?? match[3];
            violations.push(`${file}:${index + 1} — ${line.trim()} (figure ${figure})`);
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });
});

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listTsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}
