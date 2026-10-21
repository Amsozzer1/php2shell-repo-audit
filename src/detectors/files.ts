// .php-version, .tool-versions and composer.json.
import type { Declaration } from "../types.js";

const base = (rel: string) => rel.split("/").pop() ?? rel;

export function isVersionFile(rel: string): boolean {
  return base(rel) === ".php-version" || base(rel) === ".tool-versions";
}

export function isComposer(rel: string): boolean {
  return base(rel) === "composer.json";
}

export function detectVersionFile(file: string, content: string): Declaration[] {
  const out: Declaration[] = [];
  const lines = content.split(/\r?\n/);
  if (base(file) === ".php-version") {
    const i = lines.findIndex((l) => l.trim() !== "" && !l.trim().startsWith("#"));
    if (i >= 0) {
      const v = lines[i]!.trim().replace(/^php-?/i, "");
      out.push({ file, line: i + 1, text: v, kind: "php-version-file", context: "dev", version: v });
    }
    return out;
  }
  lines.forEach((l, i) => {
    const m = /^\s*php\s+(.+?)\s*(?:#.*)?$/.exec(l);
    if (!m) return;
    for (const v of m[1]!.split(/\s+/)) {
      out.push({ file, line: i + 1, text: `php ${v}`, kind: "tool-versions", context: "dev", version: v });
    }
  });
  return out;
}

// require.php and config.platform.php. Read line by line so line numbers are exact.
export function detectComposer(file: string, content: string): Declaration[] {
  const out: Declaration[] = [];
  const lines = content.split(/\r?\n/);
  lines.forEach((l, i) => {
    const m = /"php"\s*:\s*"([^"]*)"/.exec(l);
    if (!m) return;
    let section: string | null = null;
    for (let j = i; j >= 0 && section === null; j--) {
      const s = /"(require|require-dev|platform|conflict|provide|replace|suggest)"\s*:/.exec(lines[j]!);
      if (s) section = s[1]!;
    }
    if (section !== "require" && section !== "platform") return;
    out.push({ file, line: i + 1, text: `"php": "${m[1]}"`, kind: "composer", context: "prod", version: m[1]! });
  });
  return out;
}
