// Output for --org: the same three buckets, grouped by repo, plus a Markdown summary for an incident channel.
import type { LoadedFixes } from "./fixes.js";
import { plural, type OrgScan } from "./org.js";
import type { Bucket } from "./types.js";
import { buildReport, findingJson, JSON_SCHEMA_VERSION, paint, renderBuckets, tableLine, type Report } from "./report.js";
import { RUNTIME_CHECK } from "./verdict.js";

export interface OrgReport {
  tool: string;
  version: string;
  org: string;
  fixTable: Report["fixTable"];
  warnings: string[];
  repos: Array<{ name: string; branch: string; report: Report }>;
  noDeclarations: string[];
  skippedRepos: OrgScan["skippedRepos"];
  counts: Record<Bucket, number>;
  exit: { code: 0 | 1 | 3 | 4; why: string };
  requests: number;
}

const rank = (r: Report) => (r.counts.action ? 0 : r.counts.manual || r.exit.code === 3 ? 1 : 2);

export function buildOrgReport(version: string, s: OrgScan, fx: LoadedFixes): OrgReport {
  const all = s.repos.map((r) => ({ name: r.name, branch: r.branch, report: buildReport(version, r.scan, fx) }));
  const withPhp = all.filter((r) => r.report.findings.length > 0 || r.report.skipped.length > 0);
  withPhp.sort((a, b) => rank(a.report) - rank(b.report) || (a.name < b.name ? -1 : 1));
  const counts: Record<Bucket, number> = { action: 0, manual: 0, fixed: 0 };
  for (const r of withPhp) for (const k of ["action", "manual", "fixed"] as const) counts[k] += r.report.counts[k];

  let exit: OrgReport["exit"];
  const codes = withPhp.map((r) => r.report.exit.code);
  if (withPhp.length === 0) exit = { code: 4, why: "0 PHP declarations found in any repo: this tool could not see your PHP runtimes" };
  else if (codes.includes(1)) exit = { code: 1, why: `action required in ${codes.filter((c) => c === 1).length} repo(s)` };
  else if (codes.some((c) => c === 3 || c === 4)) exit = { code: 3, why: `${codes.filter((c) => c === 3 || c === 4).length} repo(s) need a manual check` };
  else exit = { code: 0, why: "nothing needs action or a manual check in what these repos declare" };

  const first = all[0]?.report;
  return {
    tool: "php2shell-repo-audit",
    version,
    org: s.org,
    fixTable: first?.fixTable ?? {
      origin: fx.origin,
      revision: fx.table.revision,
      status: fx.table.status,
      publishedAt: fx.table.publishedAt,
      source: fx.table.source,
    },
    warnings: fx.warnings,
    repos: withPhp,
    noDeclarations: all.filter((r) => !withPhp.includes(r)).map((r) => r.name),
    skippedRepos: s.skippedRepos,
    counts,
    exit,
    requests: s.requests,
  };
}

function scope(r: OrgReport): string {
  const skipped = [];
  if (r.skippedRepos.archived.length) skipped.push(`${r.skippedRepos.archived.length} archived`);
  if (r.skippedRepos.forks.length) skipped.push(plural(r.skippedRepos.forks.length, "fork"));
  const n = r.repos.length + r.noDeclarations.length;
  return `${plural(n, "repo")} scanned${skipped.length ? ` (skipped ${skipped.join(", ")})` : ""}, ${r.repos.length} declare PHP`;
}

export function renderOrgText(r: OrgReport, color: boolean): string {
  const c = paint(color);
  const out: string[] = [];
  out.push(`${r.tool} ${r.version}  ·  org ${r.org}  ·  ${tableLine(r)}`);
  out.push("Reads PHP versions declared on each repo's default branch. It does not check running servers.");
  for (const w of r.warnings) out.push(c("33", `warning: ${w}`));
  out.push(`${scope(r)}.`);
  for (const repo of r.repos) {
    const rep = repo.report;
    out.push("", c("1", `== ${repo.name} (${repo.branch})  ACTION REQUIRED ${rep.counts.action} · CHECK MANUALLY ${rep.counts.manual} · DECLARED ≥ FIXED ${rep.counts.fixed}`));
    if (rep.findings.length) out.push(...renderBuckets(rep.findings, color, "  "));
    if (rep.skipped.length) out.push("", c("33", `  skipped or unparsed: ${rep.skipped.join(", ")}`));
    if (rep.exit.code === 3 && rep.counts.manual === 0) out.push("", `  ${rep.exit.why}`);
  }
  if (r.noDeclarations.length) out.push("", `No PHP declarations found in ${r.noDeclarations.length} repo(s): ${r.noDeclarations.join(", ")}`);
  out.push("", `Total: ACTION REQUIRED ${r.counts.action} · CHECK MANUALLY ${r.counts.manual} · DECLARED ≥ FIXED ${r.counts.fixed}`);
  out.push(`The docker run check: ${RUNTIME_CHECK}`);
  out.push(`exit ${r.exit.code}: ${r.exit.why}`);
  return out.join("\n") + "\n";
}

export function renderOrgJson(r: OrgReport): string {
  return JSON.stringify(
    {
      schemaVersion: JSON_SCHEMA_VERSION,
      tool: r.tool,
      version: r.version,
      org: r.org,
      fixTable: r.fixTable,
      warnings: r.warnings,
      counts: { actionRequired: r.counts.action, checkManually: r.counts.manual, declaredFixed: r.counts.fixed },
      exitCode: r.exit.code,
      exitReason: r.exit.why,
      skippedRepos: r.skippedRepos,
      noDeclarations: r.noDeclarations,
      apiRequests: r.requests,
      repos: r.repos.map((x) => ({
        name: x.name,
        defaultBranch: x.branch,
        exitCode: x.report.exit.code,
        exitReason: x.report.exit.why,
        counts: { actionRequired: x.report.counts.action, checkManually: x.report.counts.manual, declaredFixed: x.report.counts.fixed },
        filesRead: x.report.filesRead,
        skipped: x.report.skipped,
        findings: x.report.findings.map(findingJson),
      })),
    },
    null,
    2,
  ) + "\n";
}

const code = (s: string) => "`" + s.replace(/`/g, "'") + "`";

// Short enough to paste into a chat channel: action items in full, manual checks per repo.
export function renderOrgMarkdown(r: OrgReport): string {
  const out: string[] = [];
  out.push(`**php2shell (CVE-2026-109618, CVE-2026-109619): PHP versions declared in ${code(r.org)}**`);
  out.push(`${scope(r)}. Fix table rev ${r.fixTable.revision}: ${r.fixTable.status === "pending" ? "pending, php.net has not published fixed versions" : `published${r.fixTable.publishedAt ? " " + r.fixTable.publishedAt : ""}`}.`);
  out.push(`ACTION REQUIRED **${r.counts.action}** · CHECK MANUALLY **${r.counts.manual}** · DECLARED ≥ FIXED **${r.counts.fixed}**. Read from repo files only; running servers were not checked.`);
  const action = r.repos.flatMap((x) => x.report.findings.filter((f) => f.bucket === "action").map((f) => ({ repo: x.name, f })));
  if (action.length) {
    out.push("", "**ACTION REQUIRED**");
    for (const { repo, f } of action) out.push(`- ${code(repo)} ${code(`${f.file}:${f.line}`)} ${code(f.text)}: ${f.reason}, ${f.message}`);
  }
  const manualRepos = r.repos.filter((x) => x.report.counts.manual > 0 || x.report.skipped.length > 0);
  if (manualRepos.length) {
    out.push("", "**CHECK MANUALLY**");
    for (const x of manualRepos) {
      const fs = x.report.findings.filter((f) => f.bucket === "manual");
      const items = fs.map((f) => `${code(f.text)} (${f.reason})`);
      if (x.report.skipped.length) items.push(`${x.report.skipped.length} file(s) not read`);
      out.push(`- ${code(x.name)}: ${items.join(", ")}`);
    }
  }
  const fixed = r.repos.filter((x) => x.report.counts.fixed > 0);
  if (fixed.length) {
    out.push("", "**DECLARED ≥ FIXED** (runtime not verified)");
    for (const x of fixed) out.push(`- ${code(x.name)}: ${x.report.findings.filter((f) => f.bucket === "fixed").map((f) => code(f.text)).join(", ")}`);
  }
  if (r.noDeclarations.length) out.push("", `No PHP declarations found in ${r.noDeclarations.length} repo(s).`);
  out.push("", `Check a built image: ${code(RUNTIME_CHECK)}`);
  return out.join("\n") + "\n";
}
