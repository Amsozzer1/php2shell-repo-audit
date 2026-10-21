// Loads the fix table: remote copy from the repo's main branch, falling back to the copy
// bundled in the package. A remote table is only used if it can't make any verdict less strict.
import { readFileSync } from "node:fs";
import type { FixTable } from "./types.js";
import { compareExact, parseVersion } from "./version.js";

export const REMOTE_URL =
  "https://raw.githubusercontent.com/Amsozzer1/php2shell-repo-audit/main/fixes/fixes.json";
export const BUNDLED_PATH = new URL("../../fixes/fixes.json", import.meta.url);

// Latest builds before the fix release (php.net, 24 Sep 2026). Any "fixed" value must be above these.
export const FLOORS: Record<string, string> = {
  "8.2": "8.2.34",
  "8.3": "8.3.35",
  "8.4": "8.4.26",
  "8.5": "8.5.11",
};

export type TableOrigin = "remote" | "bundled" | "file";

export interface LoadedFixes {
  table: FixTable;
  origin: TableOrigin;
  warnings: string[];
}

export function validateTable(x: unknown): string[] {
  const errs: string[] = [];
  if (typeof x !== "object" || x === null || Array.isArray(x)) return ["not a JSON object"];
  const t = x as Record<string, unknown>;
  if (t.schemaVersion !== 1) errs.push("schemaVersion must be 1");
  if (!Number.isInteger(t.revision) || (t.revision as number) < 1) errs.push("revision must be a positive integer");
  if (t.status !== "pending" && t.status !== "published") errs.push("status must be pending or published");
  if (t.publishedAt !== null && typeof t.publishedAt !== "string") errs.push("publishedAt must be null or a string");
  if (!Array.isArray(t.eol) || !t.eol.every((e) => typeof e === "string" && /^\d+(\.\d+)?$/.test(e)))
    errs.push("eol must be a list of majors or branches");
  if (typeof t.branches !== "object" || t.branches === null || Array.isArray(t.branches)) {
    errs.push("branches must be an object");
    return errs;
  }
  let nonNull = 0;
  for (const [branch, entry] of Object.entries(t.branches as Record<string, unknown>)) {
    if (!(branch in FLOORS)) {
      errs.push(`unknown branch ${branch}`);
      continue;
    }
    if (typeof entry !== "object" || entry === null) {
      errs.push(`${branch}: entry must be an object`);
      continue;
    }
    const e = entry as Record<string, unknown>;
    if ("affected" in e && e.affected !== false) errs.push(`${branch}: affected may only be false`);
    if (e.fixed === null) continue;
    if (typeof e.fixed !== "string") {
      errs.push(`${branch}: fixed must be null or X.Y.Z`);
      continue;
    }
    const v = parseVersion(e.fixed);
    if (!v || v.patch === null || v.pre !== null || `${v.major}.${v.minor}` !== branch) {
      errs.push(`${branch}: fixed ${e.fixed} is not an X.Y.Z release on this branch`);
      continue;
    }
    if (compareExact(v, parseVersion(FLOORS[branch]!)!) <= 0)
      errs.push(`${branch}: fixed ${e.fixed} is not above the pre-release floor ${FLOORS[branch]}`);
    if (e.affected === false) errs.push(`${branch}: affected false cannot have a fixed version`);
    nonNull++;
  }
  if (t.status === "pending" && nonNull > 0) errs.push("status pending but a fixed version is set");
  if (t.status === "published" && nonNull === 0) errs.push("status published but no fixed version is set");
  return errs;
}

// Extra rules for a remote table: it may only add information, never remove or weaken it.
export function remoteVsBundled(remote: FixTable, bundled: FixTable): string[] {
  const errs: string[] = [];
  if (remote.revision < bundled.revision) errs.push(`remote revision ${remote.revision} is older than bundled ${bundled.revision}`);
  for (const [branch, b] of Object.entries(bundled.branches)) {
    const r = remote.branches[branch];
    if (b.fixed !== null) {
      if (!r || r.fixed === null) errs.push(`remote removes the fixed version for ${branch}`);
      else if (compareExact(parseVersion(r.fixed)!, parseVersion(b.fixed)!) < 0)
        errs.push(`remote lowers the fixed version for ${branch}`);
    }
  }
  for (const [branch, r] of Object.entries(remote.branches)) {
    if (r.affected === false && bundled.branches[branch]?.affected !== false)
      errs.push(`remote marks ${branch} as not affected`);
  }
  return errs;
}

export function readTableFile(path: string | URL): FixTable {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  const errs = validateTable(parsed);
  if (errs.length) throw new Error(`invalid fix table ${String(path)}: ${errs.join("; ")}`);
  return parsed as FixTable;
}

export interface LoadOptions {
  offline?: boolean;
  fixesPath?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  bundledPath?: string | URL;
}

export async function loadFixes(opts: LoadOptions = {}): Promise<LoadedFixes> {
  if (opts.fixesPath) return { table: readTableFile(opts.fixesPath), origin: "file", warnings: [] };
  const bundled = readTableFile(opts.bundledPath ?? BUNDLED_PATH);
  if (opts.offline) return { table: bundled, origin: "bundled", warnings: [] };

  const doFetch = opts.fetchImpl ?? fetch;
  let remote: unknown;
  try {
    const res = await doFetch(REMOTE_URL, { signal: AbortSignal.timeout(opts.timeoutMs ?? 3000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    remote = JSON.parse(await res.text());
  } catch (err) {
    return { table: bundled, origin: "bundled", warnings: [`remote fix table unavailable (${(err as Error).message}), using bundled copy`] };
  }
  const errs = validateTable(remote);
  if (errs.length === 0) errs.push(...remoteVsBundled(remote as FixTable, bundled));
  if (errs.length) return { table: bundled, origin: "bundled", warnings: [`remote fix table rejected (${errs.join("; ")}), using bundled copy`] };
  return { table: remote as FixTable, origin: "remote", warnings: [] };
}
