import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Declaration, FixTable } from "../src/types.js";

// Compiled tests live in dist/test; fixtures stay in test/fixtures.
export const FIXTURES = fileURLToPath(new URL("../../test/fixtures/", import.meta.url));
export const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

export function table(name: "pending" | "hypothetical" | "below-declared"): FixTable {
  return JSON.parse(readFileSync(`${FIXTURES}fixes.${name}.json`, "utf8")) as FixTable;
}

export function decl(kind: Declaration["kind"], version: string | null, extra: Partial<Declaration> = {}): Declaration {
  return { file: "x", line: 1, text: "x", kind, context: "prod", version, ...extra };
}
