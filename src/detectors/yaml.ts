// Line-based YAML reading (no parser dependency): image lines in compose, Kubernetes and CI files,
// Laravel Sail runtimes, and shivammathur/setup-php php-version values with matrix lookups.
import type { Context, Declaration } from "../types.js";
import { imageDeclaration, stripYamlValue } from "./common.js";

export function isYaml(rel: string): boolean {
  return /\.ya?ml$/i.test(rel);
}

export function yamlContext(rel: string): Context {
  const r = rel.toLowerCase();
  const name = r.split("/").pop() ?? r;
  if (
    r.startsWith(".github/workflows/") || r.startsWith(".github/actions/") || r.includes(".circleci/") ||
    name === ".gitlab-ci.yml" || r.startsWith(".gitlab/ci/") || name === "bitbucket-pipelines.yml" ||
    name === ".drone.yml" || name === "azure-pipelines.yml" || name === ".travis.yml" || r.startsWith(".buildkite/")
  )
    return "ci";
  return "prod";
}

const indentOf = (s: string) => s.length - s.trimStart().length;

function isComment(line: string) {
  return /^\s*#/.test(line);
}

// Values of a matrix key in this file: `php: ['8.2', '8.3']`, a block list, and `include:` entries.
function matrixValues(lines: string[], key: string): Array<{ value: string; line: number }> | null {
  const out: Array<{ value: string; line: number }> = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*matrix:\s*$/.test(lines[i]!) && !/^\s*matrix:\s*#/.test(lines[i]!)) continue;
    const base = indentOf(lines[i]!);
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j]!;
      if (l.trim() === "" || isComment(l)) continue;
      if (indentOf(l) <= base) break;
      const km = new RegExp(`^\\s*(?:-\\s*)?["']?${key}["']?:\\s*(.*)$`).exec(l);
      if (!km) continue;
      const v = km[1]!.trim();
      if (v.startsWith("[")) {
        const inner = v.slice(1, v.indexOf("]") >= 0 ? v.indexOf("]") : undefined);
        for (const item of inner.split(",")) {
          const s = stripYamlValue(item);
          if (s) out.push({ value: s, line: j + 1 });
        }
      } else if (v === "" || v.startsWith("#")) {
        const kIndent = indentOf(l);
        for (let k = j + 1; k < lines.length; k++) {
          const li = lines[k]!;
          if (li.trim() === "" || isComment(li)) continue;
          if (indentOf(li) < kIndent || (indentOf(li) === kIndent && !li.trim().startsWith("-"))) break;
          const item = /^\s*-\s*(.+)$/.exec(li);
          if (!item) break;
          out.push({ value: stripYamlValue(item[1]!), line: k + 1 });
        }
      } else if (/\$\{\{|fromJSON/i.test(v)) {
        return null;
      } else {
        out.push({ value: stripYamlValue(v), line: j + 1 });
      }
    }
  }
  return out.length ? out : null;
}

function setupPhp(file: string, lines: string[]): Declaration[] {
  const out: Declaration[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*(?:-\s*)?uses:\s*["']?shivammathur\/setup-php@/.test(lines[i]!)) continue;
    // Step bounds: from the line that starts the step ("- ") to the next line at or above its indent.
    let start = i;
    while (start > 0 && !/^\s*-\s/.test(lines[start]!)) start--;
    const stepIndent = indentOf(lines[start]!);
    let end = start + 1;
    while (end < lines.length) {
      const l = lines[end]!;
      if (l.trim() !== "" && !isComment(l) && indentOf(l) <= stepIndent) break;
      end++;
    }
    for (let j = start; j < end; j++) {
      const pv = /^\s*php-version:\s*(.+)$/.exec(lines[j]!);
      if (!pv) continue;
      const raw = stripYamlValue(pv[1]!);
      const mx = /^\$\{\{\s*matrix\.([\w-]+)\s*\}\}$/.exec(raw);
      if (mx) {
        const vals = matrixValues(lines, mx[1]!);
        if (!vals) {
          out.push({ file, line: j + 1, text: `setup-php ${raw}`, kind: "unresolved", context: "ci", version: null });
          continue;
        }
        for (const v of vals) out.push({ file, line: v.line, text: `setup-php ${v.value}`, kind: "setup-php", context: "ci", version: v.value });
      } else if (/\$\{\{/.test(raw)) {
        out.push({ file, line: j + 1, text: `setup-php ${raw}`, kind: "unresolved", context: "ci", version: null });
      } else {
        out.push({ file, line: j + 1, text: `setup-php ${raw}`, kind: "setup-php", context: "ci", version: raw });
      }
    }
  }
  return out;
}

export function detectYaml(file: string, content: string): Declaration[] {
  const lines = content.split(/\r?\n/);
  const context = yamlContext(file);
  const out: Declaration[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    if (isComment(l)) continue;
    const sail = /vendor\/laravel\/sail\/runtimes\/(\d+\.\d+)/.exec(l);
    if (sail) {
      out.push({ file, line: i + 1, text: `sail runtime ${sail[1]}`, kind: "sail", context: "dev", version: sail[1]! });
      continue;
    }
    const m = /^\s*(?:-\s*)?(image|container):\s*(.*)$/.exec(l);
    if (!m) continue;
    let value = stripYamlValue(m[2]!);
    let line = i + 1;
    if (value === "" || value === "|" || value === ">") {
      // GitLab `image:` followed by `name:`; `container:` followed by `image:` is caught on its own line.
      if (m[1] !== "image") continue;
      const base = indentOf(l);
      for (let j = i + 1; j < lines.length; j++) {
        const lj = lines[j]!;
        if (lj.trim() === "" || isComment(lj)) continue;
        if (indentOf(lj) <= base) break;
        const nm = /^\s*name:\s*(.+)$/.exec(lj);
        if (nm) {
          value = stripYamlValue(nm[1]!);
          line = j + 1;
          break;
        }
      }
      if (!value) continue;
    }
    if (value.startsWith("{") || value.startsWith("[")) continue;
    if (/^sail-\d/.test(value)) continue; // image built from the Sail runtime counted above
    const d = imageDeclaration(value, {}, { file, line, context, prefix: `${m[1]}: ` });
    if (d) out.push(d);
  }
  out.push(...setupPhp(file, lines));
  return out;
}
