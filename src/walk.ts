// File walk. Skips dependency and VCS folders, and files over 1 MB (recorded so the run can say so).
import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

export const SKIP_DIRS = new Set(["node_modules", "vendor", ".git", ".corpus", ".hg", ".svn"]);
export const SIZE_CAP = 1024 * 1024;

export interface WalkResult {
  files: string[]; // relative paths with forward slashes
  oversized: string[];
}

export function walk(root: string, isCandidate: (rel: string) => boolean): WalkResult {
  const files: string[] = [];
  const oversized: string[] = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const abs = join(dir, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) stack.push(abs);
        continue;
      }
      if (!e.isFile()) continue;
      const rel = relative(root, abs).split(sep).join("/");
      if (!isCandidate(rel)) continue;
      if (statSync(abs).size > SIZE_CAP) oversized.push(rel);
      else files.push(rel);
    }
  }
  files.sort();
  oversized.sort();
  return { files, oversized };
}
