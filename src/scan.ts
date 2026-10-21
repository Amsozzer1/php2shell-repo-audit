// Walks a repo and runs every detector on the files it applies to.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Declaration } from "./types.js";
import { walk } from "./walk.js";
import { detectDockerfile, isDockerfile } from "./detectors/docker.js";
import { detectYaml, isYaml } from "./detectors/yaml.js";
import { detectComposer, detectVersionFile, isComposer, isVersionFile } from "./detectors/files.js";

export interface ScanResult {
  declarations: Declaration[];
  filesRead: number;
  skipped: string[]; // candidate files that were too big or unreadable
}

const isCandidate = (rel: string) => isDockerfile(rel) || isYaml(rel) || isVersionFile(rel) || isComposer(rel);

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
    if (isDockerfile(rel)) declarations.push(...detectDockerfile(rel, content));
    else if (isYaml(rel)) declarations.push(...detectYaml(rel, content));
    else if (isVersionFile(rel)) declarations.push(...detectVersionFile(rel, content));
    else if (isComposer(rel)) declarations.push(...detectComposer(rel, content));
  }
  declarations.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line));
  return { declarations, filesRead: files.length, skipped };
}
