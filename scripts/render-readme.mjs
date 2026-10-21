// Regenerates the generated blocks in README.md:
//   <!-- sample:start --> ... <!-- sample:end -->     demo-repo output for the given fix table
//   <!-- verdicts:start --> ... <!-- verdicts:end -->  verdict numbers from results/firm-verdicts.json (only if --with-verdicts)
// Usage: node scripts/render-readme.mjs --fixes <table.json> [--with-verdicts]
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const fixes = args[args.indexOf("--fixes") + 1];
if (!args.includes("--fixes") || !fixes) throw new Error("--fixes <table.json> is required");

function replaceBlock(text, name, body) {
  const re = new RegExp(`(<!-- ${name}:start -->\\n)[\\s\\S]*?(<!-- ${name}:end -->)`);
  if (!re.test(text)) throw new Error(`README.md has no ${name} block`);
  return text.replace(re, `$1${body}$2`);
}

let sample;
try {
  sample = execFileSync("node", ["dist/src/cli.js", "examples/demo-repo", "--offline", "--fixes", fixes], {
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
  });
} catch (e) {
  sample = e.stdout; // exit 1 is expected: the demo repo has an EOL image
}

let readme = readFileSync("README.md", "utf8");
readme = replaceBlock(readme, "sample", "```text\n$ php2shell-repo-audit examples/demo-repo\n" + sample.replace(/ \(file\)$/m, "") + "```\n");

if (args.includes("--with-verdicts")) {
  const v = JSON.parse(readFileSync("results/firm-verdicts.json", "utf8"));
  const u = v.unverifiableFirmVerdicts;
  const lines = [
    `Measured against php.net's fix table (${v.measuredWith.date}, \`results/firm-verdicts.json\`), over findings that match a label:`,
    "",
    "| | This tool | Naive version compare |",
    "|---|---|---|",
    `| Unverifiable firm verdicts (version-dependent, not EOL, source can't prove the runtime) | ${u.tool} of ${u.M} (0 by design) | ${u.naive} of ${u.M} |`,
    `| EOL findings (counted separately: no fix will ship, so the verdict is certain) | ${v.eolFindings.findings} found, ${v.eolFindings.toolActionRequired} ACTION REQUIRED (the rest are distro or Sail installs, kept in CHECK MANUALLY with an end-of-life note) | ${v.eolFindings.naiveFirm} firm |`,
  ];
  if (u.leftOutNullBranch) lines.push("", `${u.leftOutNullBranch} findings on branches php.net named no fix for are left out of the first row.`);
  readme = replaceBlock(readme, "verdicts", lines.join("\n") + "\n");
}
writeFileSync("README.md", readme);
console.log("README.md updated");
