// Builds the report (findings, counts, exit code) and renders it as text, JSON or Markdown.
import type { Bucket, Finding } from "./types.js";
import type { LoadedFixes } from "./fixes.js";
import { classify, exitCode, RUNTIME_CHECK, type ExitResult } from "./verdict.js";
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

const BUCKETS: Array<[Bucket, string]> = [
  ["action", "ACTION REQUIRED"],
  ["manual", "CHECK MANUALLY"],
  ["fixed", "DECLARED ≥ FIXED"],
];

export function tableLine(r: Report): string {
  const t = r.fixTable;
  const state =
    t.status === "pending"
      ? "pending, php.net has not published fixed versions"
      : `published${t.publishedAt ? " " + t.publishedAt : ""}, ${t.source}`;
  return `fix table rev ${t.revision}: ${state} (${t.origin})`;
}

export function renderText(r: Report, color: boolean): string {
  const c = (code: string, s: string) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
  const bucketColor: Record<Bucket, string> = { action: "1;31", manual: "1;33", fixed: "1;36" };
  const out: string[] = [];
  out.push(`${r.tool} ${r.version}  ·  ${tableLine(r)}`);
  out.push("Reads PHP versions declared in this repo. It does not check running servers.");
  for (const w of r.warnings) out.push(c("33", `warning: ${w}`));
  if (r.findings.length === 0) {
    out.push("", r.exit.why + ".");
    return out.join("\n") + "\n";
  }
  const loc = (f: Finding) => `${f.file}:${f.line}`;
  const locW = Math.max(...r.findings.map((f) => loc(f).length));
  const textW = Math.min(28, Math.max(...r.findings.map((f) => f.text.length)));
  for (const [b, title] of BUCKETS) {
    const fs = r.findings.filter((f) => f.bucket === b);
    out.push("", c(bucketColor[b], `${title} (${fs.length})`));
    for (const f of fs) {
      const text = f.text.length > textW ? f.text.slice(0, textW - 1) + "…" : f.text;
      out.push(`  ${loc(f).padEnd(locW)}  ${f.context.padEnd(4)}  ${text.padEnd(textW)}  ${f.reason}: ${f.message}`);
    }
  }
  if (r.skipped.length) out.push("", c("33", `skipped or unparsed: ${r.skipped.length} file(s): ${r.skipped.join(", ")}`));
  out.push("", `The docker run check: ${r.runtimeCheck}`);
  out.push(`exit ${r.exit.code}: ${r.exit.why}`);
  return out.join("\n") + "\n";
}

export function renderJson(r: Report): string {
  return JSON.stringify(
    {
      tool: r.tool,
      version: r.version,
      fixTable: r.fixTable,
      warnings: r.warnings,
      counts: { actionRequired: r.counts.action, checkManually: r.counts.manual, declaredFixed: r.counts.fixed },
      exitCode: r.exit.code,
      exitReason: r.exit.why,
      filesRead: r.filesRead,
      skipped: r.skipped,
      runtimeCheck: r.runtimeCheck,
      findings: r.findings.map((f) => ({
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
      })),
    },
    null,
    2,
  ) + "\n";
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
