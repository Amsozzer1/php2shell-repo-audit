#!/usr/bin/env node
// php2shell-repo-audit [path] [--json] [--markdown] [--offline] [--fixes <file>]
// php2shell-repo-audit --org <name> [--include-forks] [--json] [--markdown] ...
// php2shell-repo-audit --repo <owner/name> [--json] [--markdown] ...
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { loadFixes } from "./fixes.js";
import { scan } from "./scan.js";
import { buildReport, renderJson, renderSummary, renderText, renderTextCompact } from "./report.js";
import { GitHub, resolveToken } from "./github.js";
import { getRepo, scanOrg, scanRepo } from "./org.js";
import { checkUpstream, DockerHub } from "./upstream.js";
import type { Finding } from "./types.js";
import { buildOrgReport, renderOrgJson, renderOrgMarkdown, renderOrgText } from "./org-report.js";

const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { version: string };

const HELP = `php2shell-repo-audit ${pkg.version}

Lists the PHP versions a repo declares and sorts them by what needs the php2shell fix
(CVE-2026-109618, CVE-2026-109619). It reads files only; it does not check running servers.

Usage: php2shell-repo-audit [path] [options]
       php2shell-repo-audit --org <name> [options]

Options:
  --org <name>     scan the default branch of every repo in a GitHub org or user account
                   (read-only; token from GH_TOKEN, GITHUB_TOKEN or \`gh auth token\`;
                   skips archived repos and forks)
  --include-forks  with --org, scan forks too
  --repo <o/name>  scan one GitHub repo's default branch through the API, without cloning
                   (a token is optional for public repos; without one GitHub allows 60 requests an hour)
  --check-upstream for floating official php tags (php:8.3-fpm), ask Docker Hub whether the tag
                   has been rebuilt with the fixed version (anonymous, rate limited; findings stay
                   in CHECK MANUALLY, because your own image is old until you rebuild it)
  --json           JSON output
  --markdown       Markdown output (job summary; with --org, a summary for an incident channel)
  --offline        don't fetch the fix table, use the bundled copy
  --fixes <file>   use this fix table file
  --version        print the version
  --help           print this help

Exit codes:
  0  nothing needs action or a manual check in what this repo declares
  1  something is ACTION REQUIRED
  3  something needs a manual check, a candidate file was skipped, or no production runtime is declared
  4  no PHP declarations found (with --org: in any repo)
  2  error

Set NO_COLOR to turn colour off.
`;

async function main(argv: string[]): Promise<number> {
  let path = ".";
  let format: "text" | "json" | "summary" = "text";
  let offline = false;
  let fixesPath: string | undefined;
  let org: string | undefined;
  let repo: string | undefined;
  let includeForks = false;
  let upstream = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--help" || a === "-h") {
      process.stdout.write(HELP);
      return 0;
    } else if (a === "--version" || a === "-v") {
      process.stdout.write(pkg.version + "\n");
      return 0;
    } else if (a === "--json") format = "json";
    else if (a === "--summary" || a === "--markdown") format = "summary";
    else if (a === "--include-forks") includeForks = true;
    else if (a === "--check-upstream") upstream = true;
    else if (a === "--repo") {
      repo = argv[++i];
      if (!repo || repo.startsWith("-")) throw new Error("--repo needs owner/name");
    }
    else if (a === "--org") {
      org = argv[++i];
      if (!org || org.startsWith("-")) throw new Error("--org needs an org or user name");
    }
    else if (a === "--offline") offline = true;
    else if (a === "--fixes") {
      fixesPath = argv[++i];
      if (!fixesPath) throw new Error("--fixes needs a file");
    } else if (a.startsWith("-")) throw new Error(`unknown option ${a}`);
    else path = a;
  }
  const fixes = await loadFixes({ offline, fixesPath });
  const color = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
  // Terminals narrower than the column layout get the compact layout.
  const cols = process.stdout.isTTY ? process.stdout.columns : 0;
  const narrow = cols && cols < 100 ? cols : 0;

  if (org && repo) throw new Error("use --org or --repo, not both");
  const hub = upstream ? new DockerHub() : null;
  const enrich = async (findings: Finding[], warnings: string[]) => {
    if (hub) await checkUpstream(findings, fixes.table, hub, (w) => warnings.push(w));
  };

  if (org || repo) {
    const token = resolveToken();
    if (!token) process.stderr.write("no GitHub token (GH_TOKEN, GITHUB_TOKEN or `gh auth login`): public repos only, 60 API requests an hour\n");
    const gh = new GitHub({ token, baseUrl: process.env.GITHUB_API_URL });
    if (repo) {
      const r = await getRepo(gh, repo);
      const report = buildReport(pkg.version, await scanRepo(gh, r), fixes);
      report.repo = { name: r.full_name, branch: r.default_branch };
      await enrich(report.findings, report.warnings);
      if (format === "json") process.stdout.write(renderJson(report));
      else if (format === "summary") process.stdout.write(renderSummary(report));
      else if (narrow) process.stdout.write(renderTextCompact(report, color, narrow));
      else process.stdout.write(renderText(report, color));
      return report.exit.code;
    }
    const report = buildOrgReport(pkg.version, await scanOrg(gh, org!, { includeForks }), fixes);
    await enrich(report.repos.flatMap((x) => x.report.findings), report.warnings);
    if (format === "json") process.stdout.write(renderOrgJson(report));
    else if (format === "summary") process.stdout.write(renderOrgMarkdown(report));
    else process.stdout.write(renderOrgText(report, color));
    return report.exit.code;
  }

  const root = resolve(path);
  if (!statSync(root).isDirectory()) throw new Error(`${path} is not a directory`);
  const report = buildReport(pkg.version, scan(root), fixes);
  await enrich(report.findings, report.warnings);
  if (format === "json") process.stdout.write(renderJson(report));
  else if (format === "summary") process.stdout.write(renderSummary(report));
  else if (narrow) process.stdout.write(renderTextCompact(report, color, narrow));
  else process.stdout.write(renderText(report, color));
  return report.exit.code;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err: Error) => {
    process.stderr.write(`php2shell-repo-audit: ${err.message}\n`);
    process.exit(2);
  },
);
