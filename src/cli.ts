#!/usr/bin/env node
// php2shell-repo-audit [path] [--json] [--summary] [--offline] [--fixes <file>]
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { loadFixes } from "./fixes.js";
import { scan } from "./scan.js";
import { buildReport, renderJson, renderSummary, renderText } from "./report.js";

const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { version: string };

const HELP = `php2shell-repo-audit ${pkg.version}

Lists the PHP versions a repo declares and sorts them by what needs the php2shell fix
(CVE-2026-109618, CVE-2026-109619). It reads files only; it does not check running servers.

Usage: php2shell-repo-audit [path] [options]

Options:
  --json           JSON output
  --summary        Markdown output (used for the GitHub Action job summary)
  --offline        don't fetch the fix table, use the bundled copy
  --fixes <file>   use this fix table file
  --version        print the version
  --help           print this help

Exit codes:
  0  nothing needs action or a manual check in what this repo declares
  1  something is ACTION REQUIRED
  3  something needs a manual check, a candidate file was skipped, or no production runtime is declared
  4  no PHP declarations found
  2  error

Set NO_COLOR to turn colour off.
`;

async function main(argv: string[]): Promise<number> {
  let path = ".";
  let format: "text" | "json" | "summary" = "text";
  let offline = false;
  let fixesPath: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--help" || a === "-h") {
      process.stdout.write(HELP);
      return 0;
    } else if (a === "--version" || a === "-v") {
      process.stdout.write(pkg.version + "\n");
      return 0;
    } else if (a === "--json") format = "json";
    else if (a === "--summary") format = "summary";
    else if (a === "--offline") offline = true;
    else if (a === "--fixes") {
      fixesPath = argv[++i];
      if (!fixesPath) throw new Error("--fixes needs a file");
    } else if (a.startsWith("-")) throw new Error(`unknown option ${a}`);
    else path = a;
  }
  const root = resolve(path);
  if (!statSync(root).isDirectory()) throw new Error(`${path} is not a directory`);

  const fixes = await loadFixes({ offline, fixesPath });
  const report = buildReport(pkg.version, scan(root), fixes);
  if (format === "json") process.stdout.write(renderJson(report));
  else if (format === "summary") process.stdout.write(renderSummary(report));
  else process.stdout.write(renderText(report, Boolean(process.stdout.isTTY) && !process.env.NO_COLOR));
  return report.exit.code;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err: Error) => {
    process.stderr.write(`php2shell-repo-audit: ${err.message}\n`);
    process.exit(2);
  },
);
