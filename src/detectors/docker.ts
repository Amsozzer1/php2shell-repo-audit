// Dockerfile / Containerfile: FROM lines (official php, images that bundle PHP, ARG defaults, digests)
// and RUN lines that install PHP from distro or third-party repositories.
import type { Declaration } from "../types.js";
import { imageDeclaration } from "./common.js";

export function isDockerfile(rel: string): boolean {
  const name = (rel.split("/").pop() ?? "").toLowerCase();
  return (
    name === "dockerfile" || name.startsWith("dockerfile.") || name.endsWith(".dockerfile") ||
    name === "containerfile" || name.startsWith("containerfile.") || name.endsWith(".containerfile")
  );
}

interface Logical {
  text: string;
  line: number;
  parts: Array<{ line: number; text: string }>;
}

// Joins backslash continuations. Comment lines inside a continuation are dropped, as Docker does.
function logicalLines(content: string): Logical[] {
  const out: Logical[] = [];
  let cur: Logical | null = null;
  content.split(/\r?\n/).forEach((rawLine, i) => {
    const line = i + 1;
    const trimmed = rawLine.trim();
    if (cur && trimmed.startsWith("#")) return;
    if (!cur && (trimmed === "" || trimmed.startsWith("#"))) return;
    const cont = /\\\s*$/.test(rawLine);
    const text = rawLine.replace(/\\\s*$/, "");
    if (!cur) cur = { text, line, parts: [] };
    else cur.text += " " + text.trim();
    cur.parts.push({ line, text });
    if (!cont) {
      out.push(cur);
      cur = null;
    }
  });
  if (cur) out.push(cur);
  return out;
}

function parseArgs(rest: string, into: Record<string, string | undefined>) {
  for (const m of rest.matchAll(/([A-Za-z_][A-Za-z0-9_]*)(?:=("[^"]*"|'[^']*'|\S*))?/g)) {
    const v = m[2]?.replace(/^["']|["']$/g, "");
    into[m[1]!] = v === undefined || v === "" ? into[m[1]!] : v;
  }
}

const INSTALL = /\b(?:apt-get|apt|aptitude)\s+(?:\S+\s+)*?install\b|\bapk\s+(?:\S+\s+)*?add\b|\b(?:dnf|yum|microdnf)\s+(?:\S+\s+)*?install\b/;
const PHP_PKG = /^php(?:(\d)\.?(\d{1,2}))?(?:$|[-=])/i;

// Packages per command segment, so "apt-get install curl && apk add php83" is read correctly.
function phpPackages(run: string): Array<{ pkg: string; branch: string | null }> {
  const found: Array<{ pkg: string; branch: string | null }> = [];
  for (const seg of run.split(/&&|\|\||;|\|/)) {
    const m = INSTALL.exec(seg);
    if (m) {
      const after = seg.slice(m.index + m[0].length).trim().split(/\s+/);
      for (const tok of after) {
        if (!tok || tok.startsWith("-")) continue;
        const clean = tok.replace(/^["']|["']$/g, "");
        const p = PHP_PKG.exec(clean);
        if (p) found.push({ pkg: clean, branch: p[1] ? `${p[1]}.${p[2]}` : null });
      }
    }
    // remi / AppStream module streams: dnf module enable php:remi-8.3 or php:8.2
    const mod = /\bmodule\s+(?:enable|install|reset)\s+php:(?:remi-)?(\d\.\d{1,2})/.exec(seg);
    if (mod) found.push({ pkg: `php:${mod[1]}`, branch: mod[1]! });
  }
  return found;
}

export function detectDockerfile(file: string, content: string): Declaration[] {
  const out: Declaration[] = [];
  const globalArgs: Record<string, string | undefined> = {};
  const stages = new Set<string>();
  let seenFrom = false;
  for (const l of logicalLines(content)) {
    const m = /^\s*([A-Za-z]+)\s+(.*)$/.exec(l.text);
    if (!m) continue;
    const instr = m[1]!.toUpperCase();
    const rest = m[2]!.trim();
    if (instr === "ARG") {
      if (!seenFrom) parseArgs(rest, globalArgs);
      continue;
    }
    if (instr === "FROM") {
      seenFrom = true;
      const toks = rest.split(/\s+/).filter((t) => !t.startsWith("--"));
      const image = toks[0];
      if (!image) continue;
      const isStageRef = stages.has(image.toLowerCase());
      if (toks[1]?.toLowerCase() === "as" && toks[2]) stages.add(toks[2].toLowerCase());
      if (isStageRef || image.toLowerCase() === "scratch") continue;
      // FROM only sees ARGs declared before the first FROM.
      const d = imageDeclaration(image, globalArgs, { file, line: l.line, context: "prod", prefix: "FROM " });
      if (d) out.push(d);
      continue;
    }
    if (instr === "RUN") {
      const byBranch = new Map<string, string>();
      for (const p of phpPackages(rest)) {
        const key = p.branch ?? "";
        if (!byBranch.has(key)) byBranch.set(key, p.pkg);
      }
      for (const [branch, pkg] of byBranch) {
        const part = l.parts.find((x) => x.text.includes(pkg)) ?? l.parts[0]!;
        const tool = /\bapk\b/.test(rest) ? "apk add" : /\b(dnf|yum|microdnf)\b/.exec(rest)?.[0] ?? "apt-get install";
        out.push({
          file,
          line: part.line,
          text: `${tool.includes(" ") ? tool : tool + " install"} ${pkg}`,
          kind: "distro",
          context: "prod",
          version: branch || null,
        });
      }
    }
  }
  return out;
}
