// Builds the report (findings, counts, exit code) and renders it as text, JSON or Markdown.
import type { Bucket, Finding } from "./types.js";
import type { LoadedFixes } from "./fixes.js";
import { classify, exitCode, RUNTIME_CHECK, type ExitResult } from "./verdict.js";
import { FIX_GUIDE } from "./fixes-guide.js";

// Bumped only if a field is renamed or removed; new fields can be added within a version.
export const JSON_SCHEMA_VERSION = 1;
import type { ScanResult } from "./scan.js";

export interface Report {
  tool: string;
  version: string;
  fixTable: { origin: string; revision: number; status: string; publishedAt: string | null; source: string };
  warnings: string[];
  counts: Record<Bucket, number>;
  exit: ExitResult;
  filesRead: number;
  skipped: string[];
  findings: Finding[];
  runtimeCheck: string;
  repo?: { name: string; branch: string }; // set for --repo
}

export function buildReport(version: string, s: ScanResult, fx: LoadedFixes): Report {
  const findings = s.declarations.map((d) => classify(d, fx.table));
  const counts: Record<Bucket, number> = { action: 0, manual: 0, fixed: 0 };
  for (const x of findings) counts[x.bucket]++;
  return {
    tool: "php2shell-repo-audit",
    version,
    fixTable: {
      origin: fx.origin,
      revision: fx.table.revision,
      status: fx.table.status,
      publishedAt: fx.table.publishedAt,
      source: fx.table.source,
    },
    warnings: fx.warnings,
    counts,
    exit: exitCode(findings, s.skipped.length),
    filesRead: s.filesRead,
    skipped: s.skipped,
    findings,
    runtimeCheck: RUNTIME_CHECK,
  };
}

export const BUCKETS: Array<[Bucket, string]> = [
  ["action", "ACTION REQUIRED"],
  ["manual", "CHECK MANUALLY"],
  ["fixed", "DECLARED ≥ FIXED"],
];

export function tableLine(r: Pick<Report, "fixTable">): string {
  const t = r.fixTable;
  const state =
    t.status === "pending"
      ? "pending, php.net has not published fixed versions"
      : `published${t.publishedAt ? " " + t.publishedAt : ""}, ${t.source}`;
  return `fix table rev ${t.revision}: ${state} (${t.origin})`;
}

export const paint = (color: boolean) => (code: string, s: string) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
const BUCKET_COLOR: Record<Bucket, string> = { action: "1;31", manual: "1;33", fixed: "1;36" };

// The three buckets with aligned columns. `indent` lets the org view nest them under a repo.
export function renderBuckets(findings: Finding[], color: boolean, indent = ""): string[] {
  const c = paint(color);
  const out: string[] = [];
  const loc = (f: Finding) => `${f.file}:${f.line}`;
  const locW = Math.max(...findings.map((f) => loc(f).length));
  const textW = Math.min(28, Math.max(...findings.map((f) => f.text.length)));
  for (const [b, title] of BUCKETS) {
    const fs = findings.filter((f) => f.bucket === b);
    out.push("", indent + c(BUCKET_COLOR[b], `${title} (${fs.length})`));
    for (const f of fs) {
      const text = f.text.length > textW ? f.text.slice(0, textW - 1) + "…" : f.text;
      out.push(`${indent}  ${loc(f).padEnd(locW)}  ${f.context.padEnd(4)}  ${text.padEnd(textW)}  ${f.reason}: ${f.message}`);
    }
  }
  return out;
}

export function renderText(r: Report, color: boolean): string {
  const c = paint(color);
  const out: string[] = [];
  out.push(`${r.tool} ${r.version}  ·  ${tableLine(r)}`);
  if (r.repo) out.push(`repo ${r.repo.name} (${r.repo.branch}), read through the GitHub API`);
  out.push("Reads PHP versions declared in this repo. It does not check running servers.");
  for (const w of r.warnings) out.push(c("33", `warning: ${w}`));
  if (r.findings.length === 0) {
    out.push("", r.exit.why + ".");
    return out.join("\n") + "\n";
  }
  out.push(...renderBuckets(r.findings, color));
  if (r.skipped.length) out.push("", c("33", `skipped or unparsed: ${r.skipped.length} file(s): ${r.skipped.join(", ")}`));
  out.push("", `The docker run check: ${r.runtimeCheck}`);
  out.push(`exit ${r.exit.code}: ${r.exit.why}`);
  return out.join("\n") + "\n";
}

// Wraps on spaces; continuation lines keep the line's indent plus two spaces.
function wrap(line: string, width: number): string[] {
  const indent = /^ */.exec(line)![0];
  const out: string[] = [];
  let cur = "";
  for (const word of line.trimStart().split(" ")) {
    const lead = cur ? cur + " " : out.length ? indent + "  " : indent;
    if (cur && lead.length + word.length > width) {
      out.push(cur);
      cur = indent + "  " + word;
    } else cur = lead + word;
  }
  out.push(cur);
  return out;
}

// For terminals narrower than the column layout: each finding is the declared line, then where and why.
// Full messages are in --json or a wider terminal.
export function renderTextCompact(r: Report, color: boolean, width: number): string {
  const c = paint(color);
  const out: string[] = [];
  const add = (line: string) => out.push(...wrap(line, width));
  const t = r.fixTable;
  add(`${r.tool} ${r.version}`);
  if (r.repo) add(`repo ${r.repo.name} (${r.repo.branch})`);
  add(`fix table rev ${t.revision}: ${t.status === "pending" ? "pending" : `published${t.publishedAt ? " " + t.publishedAt : ""}`} (${t.origin})`);
  add("Reads repo files. Doesn't check servers.");
  for (const w of r.warnings) add(`warning: ${w}`);
  if (r.findings.length === 0) {
    out.push("");
    add(r.exit.why + ".");
    return out.join("\n") + "\n";
  }
  for (const [b, title] of BUCKETS) {
    const fs = r.findings.filter((f) => f.bucket === b);
    out.push("", c(BUCKET_COLOR[b], `${title} (${fs.length})`));
    for (const f of fs) {
      add(`  ${f.text}`);
      add(`    ${f.file}:${f.line} · ${f.reason}`);
    }
  }
  if (r.skipped.length) {
    out.push("");
    add(`skipped or unparsed: ${r.skipped.length} file(s)`);
  }
  out.push("");
  add(`exit ${r.exit.code}: ${r.exit.why} · --json for details`);
  return out.join("\n") + "\n";
}

export function renderJson(r: Report): string {
  return JSON.stringify(
    {
      schemaVersion: JSON_SCHEMA_VERSION,
      tool: r.tool,
      version: r.version,
      ...(r.repo ? { repo: r.repo } : {}),
      fixTable: r.fixTable,
      warnings: r.warnings,
      counts: { actionRequired: r.counts.action, checkManually: r.counts.manual, declaredFixed: r.counts.fixed },
      exitCode: r.exit.code,
      exitReason: r.exit.why,
      filesRead: r.filesRead,
      skipped: r.skipped,
      runtimeCheck: r.runtimeCheck,
      findings: r.findings.map(findingJson),
    },
    null,
    2,
  ) + "\n";
}

export function findingJson(f: Finding) {
  return {
    bucket: f.bucket,
    reason: f.reason,
    file: f.file,
    line: f.line,
    context: f.context,
    kind: f.kind,
    declared: f.text,
    version: f.version,
    branch: f.branch,
    message: f.message,
    fix: FIX_GUIDE[f.reason],
    ...(f.upstream ? { upstream: f.upstream } : {}),
  };
}

const md = (s: string) => s.replace(/\|/g, "\\|").replace(/`/g, "'");

export function renderSummary(r: Report): string {
  const out: string[] = [];
  out.push(`### php2shell-repo-audit ${r.version}`, "");
  out.push(`${tableLine(r)}. Reads PHP versions declared in this repo; it does not check running servers.`, "");
  out.push(`**ACTION REQUIRED ${r.counts.action} · CHECK MANUALLY ${r.counts.manual} · DECLARED ≥ FIXED ${r.counts.fixed}** (exit ${r.exit.code}: ${r.exit.why})`, "");
  if (r.findings.length) {
    out.push("| Bucket | Where | Context | Declared | Reason |", "|---|---|---|---|---|");
    for (const [b, title] of BUCKETS) {
      for (const f of r.findings.filter((x) => x.bucket === b)) {
        out.push(`| ${title} | \`${md(f.file)}:${f.line}\` | ${f.context} | \`${md(f.text)}\` | ${f.reason}: ${md(f.message)} |`);
      }
    }
    out.push("");
  }
  if (r.skipped.length) out.push(`Skipped or unparsed: ${r.skipped.map((s) => "`" + md(s) + "`").join(", ")}`, "");
  out.push(`The docker run check: \`${r.runtimeCheck}\``, "");
  return out.join("\n");
}
