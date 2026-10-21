// Measures the tool against the hand labels in results/labels.json and against two baselines:
//   recall:   grep -rnE "FROM +php:" <repo>
//   verdicts: a naive version compare over the same declarations the tool finds
// Usage: node scripts/measure.mjs --fixes <table.json> [--out results]
// Always runs offline with an explicit table, so numbers never depend on the remote copy.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { scan } from "../dist/src/scan.js";
import { classify } from "../dist/src/verdict.js";
import { readTableFile } from "../dist/src/fixes.js";
import { isEol, parseVersion, compareExact } from "../dist/src/version.js";

const args = process.argv.slice(2);
const fixesPath = args[args.indexOf("--fixes") + 1];
if (!args.includes("--fixes") || !fixesPath) throw new Error("--fixes <table.json> is required");
const outDir = args.includes("--out") ? args[args.indexOf("--out") + 1] : "results";
const table = readTableFile(fixesPath);
const labels = JSON.parse(readFileSync("results/labels.json", "utf8"));
const corpus = JSON.parse(readFileSync("results/corpus.json", "utf8"));

// Sources whose declared version can't prove which PHP build runs.
const UNPROVABLE = new Set([
  "php-image:floating", "php-image:arg", "php-image:digest", "third-party-image", "ci-image:floating",
  "version-file:minor", "setup-php", "distro", "sail", "composer",
]);
const labelType = (l) => l.split(":").slice(2).join(":");
const labelKey = (l) => l.split(":").slice(0, 2).join(":");

// Lines the labeler was shown: the labeling grep. Unlabeled tool findings outside it are reported
// separately, not counted as false positives, because the labeler never saw them.
function candidateLines(dir) {
  const out = execFileSync(
    "git",
    ["grep", "-niE", "php|sail/runtimes", "--", "*Dockerfile*", "*Containerfile*", "*.yml", "*.yaml", "*.php-version", "*.tool-versions", "*composer.json", ":!vendor", ":!node_modules"],
    { cwd: dir, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  return new Set(out.split("\n").filter(Boolean).map((l) => l.split(":").slice(0, 2).join(":")));
}

function grepBaseline(dir) {
  let out = "";
  try {
    out = execFileSync("grep", ["-rnE", "--exclude-dir=.git", "FROM +php:", "."], { cwd: dir, encoding: "utf8" });
  } catch (e) {
    if (e.status !== 1) throw e;
  }
  return new Set(out.split("\n").filter(Boolean).map((l) => l.replace(/^\.\//, "").split(":").slice(0, 2).join(":")));
}

// The naive check: first X.Y[.Z] in the declaration, compared to the table. Firm verdict whenever it can compare.
function naive(text) {
  const m = /(\d+)\.(\d+)(?:\.(\d+))?/.exec(text);
  if (!m) return { verdict: null, branch: null };
  const v = parseVersion(m[0]);
  const branch = `${m[1]}.${m[2]}`;
  if (isEol(v, table.eol)) return { verdict: "vulnerable", branch, eol: true };
  const fixed = table.branches[branch]?.fixed;
  if (!fixed) return { verdict: null, branch };
  const exact = { ...v, patch: v.patch ?? 0 };
  return { verdict: compareExact(exact, parseVersion(fixed)) < 0 ? "vulnerable" : "fixed", branch };
}

const perRepo = [];
const byType = {};
const blank = () => ({ labeled: 0, toolFound: 0, toolFP: 0, toolOutsideGrep: 0, grepFound: 0, grepFP: 0, unprovableLabeled: 0 });
const tot = blank();
const bySet = { tuning: blank(), "held-out": blank() };
const outside = [];
const firm = { M: 0, toolN: 0, naiveN: 0, skippedNullBranch: 0 };
const eol = { findings: 0, toolActionRequired: 0, naiveFirm: 0 };

for (const repo of corpus.repos) {
  const dir = join(".corpus", repo.name.replace("/", "__"));
  const lab = labels.repos[repo.name] ?? [];
  const labByKey = new Map(lab.map((l) => [labelKey(l), labelType(l)]));
  const res = scan(dir);
  const toolKeys = new Set(res.declarations.map((d) => `${d.file}:${d.line}`));
  const grepKeys = grepBaseline(dir);
  const cand = candidateLines(dir);
  const row = { repo: repo.name, set: repo.set, labeled: lab.length, toolFound: 0, toolFP: 0, toolOutsideGrep: 0, grepFound: 0, grepFP: 0, unprovableLabeled: 0 };
  for (const [k, t] of labByKey) {
    byType[t] ??= { labeled: 0, tool: 0, grep: 0 };
    byType[t].labeled++;
    if (toolKeys.has(k)) (row.toolFound++, byType[t].tool++);
    if (grepKeys.has(k)) (row.grepFound++, byType[t].grep++);
    if (UNPROVABLE.has(t)) row.unprovableLabeled++;
  }
  for (const k of toolKeys) {
    if (labByKey.has(k)) continue;
    if (cand.has(k)) row.toolFP++;
    else {
      row.toolOutsideGrep++;
      const d = res.declarations.find((x) => `${x.file}:${x.line}` === k);
      outside.push(`${repo.name} ${k} ${d.kind} ${d.text}`);
    }
  }
  for (const k of grepKeys) if (!labByKey.has(k)) row.grepFP++;
  for (const key of Object.keys(row)) {
    if (key in tot) tot[key] += row[key];
    if (key in bySet[repo.set]) bySet[repo.set][key] += row[key];
  }
  perRepo.push(row);

  // Verdicts: only tool findings that match a label, so false positives can't inflate the count.
  const seen = new Set();
  for (const d of res.declarations) {
    const k = `${d.file}:${d.line}`;
    const t = labByKey.get(k);
    if (!t) continue;
    const f = classify(d, table);
    const n = naive(d.text);
    const key = `${k}:${n.branch}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (n.branch === null) continue; // not version-dependent
    if (n.eol) {
      eol.findings++;
      if (f.bucket === "action") eol.toolActionRequired++;
      eol.naiveFirm++;
      continue;
    }
    if (!UNPROVABLE.has(t)) continue;
    if (!table.branches[n.branch]?.fixed) {
      firm.skippedNullBranch++;
      continue;
    }
    firm.M++;
    if (f.bucket === "action" || f.bucket === "fixed") firm.toolN++;
    if (n.verdict) firm.naiveN++;
  }
}

const recall = {
  measuredWith: { fixes: fixesPath, tableStatus: table.status, node: process.version, date: new Date().toISOString().slice(0, 10) },
  candidates: labels.candidates,
  totals: tot,
  bySet,
  outsideLabelingGrep: outside,
  byType,
  perRepo,
};
const verdicts = {
  measuredWith: recall.measuredWith,
  definition:
    "Unverifiable firm verdicts: among tool findings that match a label, are version-dependent, are not on an EOL branch, and come from a source that can't prove the runtime (M), the number where a check commits to vulnerable or fixed (N). Findings on branches with no fixed version in the table (null, or not in the table) are left out.",
  unverifiableFirmVerdicts: { M: firm.M, tool: firm.toolN, naive: firm.naiveN, leftOutNullBranch: firm.skippedNullBranch },
  eolFindings: eol,
  cantProveRuntime: { unprovable: tot.unprovableLabeled, labeled: tot.labeled },
};
writeFileSync(join(outDir, "recall.json"), JSON.stringify(recall, null, 2) + "\n");
writeFileSync(join(outDir, "firm-verdicts.json"), JSON.stringify(verdicts, null, 2) + "\n");

for (const [name, t] of [["all", tot], ...Object.entries(bySet)])
  console.log(`recall ${name.padEnd(9)} tool ${t.toolFound}/${t.labeled} (false positives ${t.toolFP}, outside grep ${t.toolOutsideGrep})   grep ${t.grepFound}/${t.labeled} (false positives ${t.grepFP})`);
for (const o of outside) console.log(`  outside labeling grep: ${o}`);
for (const [t, v] of Object.entries(byType)) console.log(`  ${t.padEnd(20)} labeled ${v.labeled}  tool ${v.tool}  grep ${v.grep}`);
for (const r of perRepo) console.log(`  ${r.set.padEnd(8)} ${r.repo.padEnd(26)} labeled ${r.labeled}  tool ${r.toolFound} (+${r.toolFP})  grep ${r.grepFound} (+${r.grepFP})`);
console.log(`can't prove runtime: ${tot.unprovableLabeled}/${tot.labeled} labeled declarations`);
console.log(`unverifiable firm verdicts (of ${firm.M}): tool ${firm.toolN}  naive ${firm.naiveN}  (left out, branch has no fixed version in the table: ${firm.skippedNullBranch})`);
console.log(`EOL findings: ${eol.findings} (tool ACTION REQUIRED ${eol.toolActionRequired}, naive firm ${eol.naiveFirm})`);
