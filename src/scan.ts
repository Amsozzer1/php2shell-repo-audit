// Walks a repo and runs every detector on the files it applies to.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Declaration } from "./types.js";
import { SKIP_DIRS, walk } from "./walk.js";
import { detectDockerfile, isDockerfile } from "./detectors/docker.js";
import { detectYaml, isYaml } from "./detectors/yaml.js";
import { detectComposer, detectVersionFile, isComposer, isVersionFile } from "./detectors/files.js";

export interface ScanResult {
  declarations: Declaration[];
  filesRead: number;
  skipped: string[]; // candidate files that were too big or unreadable
}

export const isCandidate = (rel: string) => isDockerfile(rel) || isYaml(rel) || isVersionFile(rel) || isComposer(rel);

// True for paths inside folders the walk skips (node_modules, vendor, .git, ...).
export const inSkippedDir = (rel: string) => rel.split("/").slice(0, -1).some((p) => SKIP_DIRS.has(p));

export function detectFile(rel: string, content: string): Declaration[] {
  if (isDockerfile(rel)) return detectDockerfile(rel, content);
  if (isYaml(rel)) return detectYaml(rel, content);
  if (isVersionFile(rel)) return detectVersionFile(rel, content);
  if (isComposer(rel)) return detectComposer(rel, content);
  return [];
}

export function sortDeclarations(ds: Declaration[]): Declaration[] {
  return ds.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line));
}

export function scan(root: string): ScanResult {
  const { files, oversized } = walk(root, isCandidate);
  const skipped = [...oversized];
  const declarations: Declaration[] = [];
  for (const rel of files) {
    let content: string;
    try {
      content = readFileSync(join(root, rel), "utf8");
    } catch {
      skipped.push(rel);
      continue;
    }
    declarations.push(...detectFile(rel, content));
  }
  return { declarations: sortDeclarations(declarations), filesRead: files.length, skipped };
}
