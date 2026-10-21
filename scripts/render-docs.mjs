// Regenerates every generated block in README.md and writes llms.txt, from fixes/fixes.json and the
// built CLI. Text that depends on whether php.net has published lives only in these blocks, so the
// release can't leave "pending" wording behind.
// Usage: node scripts/render-docs.mjs [--with-verdicts] [--check]
//   --with-verdicts  also fill the verdicts block from results/firm-verdicts.json (release run)
//   --check          fail if "pending" or "has not published" wording is left outside the sample blocks,
//                    or llms.txt says anything is safe
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { FIX_GUIDE } from "../dist/src/fixes-guide.js";

const args = process.argv.slice(2);
const REPO = "https://github.com/Amsozzer1/php2shell-repo-audit";
const table = JSON.parse(readFileSync("fixes/fixes.json", "utf8"));
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const published = table.status === "published";
const advisory = table.source;
const date = table.publishedAt;
const branches = Object.keys(table.branches).sort((a, b) => Number(b.split(".")[1]) - Number(a.split(".")[1]));
const fixedOf = (b) => {
  const e = table.branches[b];
  return e.fixed ?? (e.affected === false ? "not affected" : "no fixed version named");
};
const fixedList = branches.map((b) => `${b}: ${fixedOf(b)}`).join(", ");
const npx = published ? `npx php2shell-repo-audit@${pkg.version}` : "npx php2shell-repo-audit";

function cli(extra) {
  try {
    return execFileSync("node", ["dist/src/cli.js", "examples/demo-repo", "--offline", ...extra], {
      encoding: "utf8",
      env: { ...process.env, NO_COLOR: "1" },
    });
  } catch (e) {
    return e.stdout; // exit 1 is expected: the demo repo has an EOL image
  }
}

const INTRO_REST =
  "The first question is which of your repos and images run a PHP that needs the fix. `grep \"FROM php:\"` finds some Dockerfile lines. It misses CI versions, distro packages, version files and images that bundle PHP, and it doesn't tell you which lines matter: a floating tag like `php:8.3-fpm` is only fixed after you rebuild, a Debian package can be patched without its version changing, and a composer constraint isn't a runtime at all. This tool reads those files in one repo or a GitHub org. It does not check running servers.";

const EOL_SENTENCE =
  "5.x, 7.x, 8.0 and 8.1 get no official php.net release, so the tool marks them ACTION REQUIRED. php.net published source backport branches for 7.4, 8.0 and 8.1, and some distros and LTS vendors backport; the message for each finding says which applies. Distro packages, Sail runtimes and ARG defaults on those branches stay in CHECK MANUALLY, because a vendor or the build may change them.";

const blocks = {
  intro: published
    ? `php2shell is two critical bugs in PHP itself; php.net published the fixed versions on ${date} in its [advisory](${advisory}). ${INTRO_REST}`
    : `php2shell is two critical bugs in PHP itself; php.net publishes the fixed versions at 14:00 UTC on 21 Oct 2026. ${INTRO_REST}`,

  compare: published
    ? `Compare what you see with the fixed versions in [php.net's advisory](${advisory}): ${fixedList}. Fix table in this repo: rev ${table.revision}, ${date}.`
    : "Compare what you see with the fixed versions in [php.net's advisory](https://www.php.net/archive/2026.php) when it is published at 14:00 UTC on 21 Oct 2026.",

  "release-note": published
    ? ""
    : "0.1.0 is published after php.net's advisory at 14:00 UTC. Until then, `npx php2shell-repo-audit` runs the release candidate, whose fix table has no fixed versions yet, so nothing is marked fixed.",

  "how-it-works": [
    "- Walks the repo (skipping `node_modules`, `vendor`, `.git` and files over 1 MB) and reads Dockerfiles and Containerfiles, YAML files (compose, Kubernetes, GitHub Actions, GitLab CI, Forgejo), `.php-version`, `.tool-versions` and `composer.json`. YAML is read line by line, without a YAML library.",
    "- Each declaration gets a kind (official `php` image, digest, ARG default, image that bundles PHP, distro package, Sail runtime, setup-php, version file, composer) and a context (prod, ci, dev).",
    published
      ? `- A fix table from php.net (\`fixes/fixes.json\`, rev ${table.revision}, from the [advisory](${advisory}) of ${date}) decides the bucket: ${fixedList}. On a branch with no fixed version in the table, exact pins stay in CHECK MANUALLY.`
      : "- A fix table from php.net (`fixes/fixes.json`) decides the bucket. php.net has not published fixed versions yet, so every branch is pending and nothing can be marked fixed.",
    "- The verdict rules only allow DECLARED ≥ FIXED for an exact version in an official image tag or `.tool-versions`. Everything that can't prove the runtime goes to CHECK MANUALLY with a reason. EOL branches (5.x, 7.x, 8.0, 8.1) are ACTION REQUIRED, because php.net ships no official release for them. The exceptions are distro and Sail installs and ARG defaults, which say end of life in the message but stay in CHECK MANUALLY, because a vendor may patch them or the build may override them.",
    "- A remote fix table is only used if it validates and can't weaken anything: it can't lower or remove a fixed version, can't add \"not affected\", can't have an older revision, and every fixed version must be newer than the builds that shipped before the fix.",
  ].join("\n"),

  "fixed-versions": published
    ? [
        `php.net published the fixed versions on ${date} in its [advisory](${advisory}):`,
        "",
        "| Branch | Fixed in |",
        "|---|---|",
        ...branches.map((b) => `| ${b} | ${fixedOf(b)} |`),
        "",
        `This tool reads them from [\`fixes/fixes.json\`](${REPO}/blob/main/fixes/fixes.json) (rev ${table.revision}), filled by hand from that advisory and checked against php.net's per-branch release data. ${EOL_SENTENCE}`,
        "",
        `If you can't update right now, php.net lists [mitigations in the advisory](${advisory}) that reduce exposure but don't fix it.`,
      ].join("\n")
    : `php.net publishes the fixed version for each branch in its advisory at 14:00 UTC on 21 Oct 2026. This tool reads them from [\`fixes/fixes.json\`](${REPO}/blob/main/fixes/fixes.json), which is filled by hand from that advisory; until it is, every branch in the table is \`pending\` and nothing can be marked fixed. ${EOL_SENTENCE}`,

  "fix-guide": (() => {
    const order = ["eol", "vulnerable", "floating-rebuild", "pending-fix", "distro-vendor", "third-party-image", "build-arg", "digest", "constraint-only", "unresolved", "unknown-branch", "declared-fixed", "not-affected"];
    const missing = Object.keys(FIX_GUIDE).filter((k) => !order.includes(k));
    if (missing.length) throw new Error(`fix-guide order is missing ${missing.join(", ")}`);
    return ["| Reason | What to do |", "|---|---|", ...order.map((r) => `| \`${r}\` | ${FIX_GUIDE[r]} |`)].join("\n");
  })(),

  sample: "```text\n$ php2shell-repo-audit examples/demo-repo\n" + cli([]).replace(/ \(bundled\)$/m, "") + "```",

  json: (() => {
    const j = JSON.parse(cli(["--json"]));
    const total = j.findings.length;
    j.findings = j.findings.slice(0, 2);
    return [
      `Real output for \`examples/demo-repo\` with the fix table in this repo (\`--offline\`), with \`findings\` trimmed to 2 of ${total}:`,
      "",
      "```json",
      JSON.stringify(j, null, 2),
      "```",
      "",
      "| Field | Meaning |",
      "|---|---|",
      "| `schemaVersion` | Shape version of this output, currently 1 |",
      "| `tool`, `version` | Tool name and version |",
      "| `fixTable` | The fix table used: `origin` (remote, bundled or file), `revision`, `status` (pending or published), `publishedAt`, `source` (php.net advisory URL) |",
      "| `warnings` | Problems loading the remote fix table, if any |",
      "| `counts` | `actionRequired`, `checkManually`, `declaredFixed` |",
      "| `exitCode`, `exitReason` | The process exit code and why (see Exit codes) |",
      "| `filesRead` | Candidate files read |",
      "| `skipped` | Candidate files skipped (too big or unreadable) |",
      "| `runtimeCheck` | The `docker run` command that shows the real PHP version of an image |",
      "| `findings[]` | One object per declaration |",
      "| `findings[].bucket` | `action`, `manual` or `fixed` (DECLARED ≥ FIXED) |",
      "| `findings[].reason` | Reason code (see What to do for each finding) |",
      "| `findings[].file`, `.line` | Where the declaration is, relative to the scanned folder |",
      "| `findings[].context` | `prod`, `ci` or `dev`, guessed from the path |",
      "| `findings[].kind` | Declaration kind, e.g. `official-image`, `setup-php`, `distro`, `composer` |",
      "| `findings[].declared` | The declaration as written, shortened |",
      "| `findings[].version` | The version string as declared, or null |",
      "| `findings[].branch` | PHP branch, e.g. `8.3`, or null |",
      "| `findings[].message` | Why it landed in this bucket |",
      "| `findings[].fix` | What to do about it |",
    ].join("\n");
  })(),
};

if (args.includes("--with-verdicts")) {
  const v = JSON.parse(readFileSync("results/firm-verdicts.json", "utf8"));
  const u = v.unverifiableFirmVerdicts;
  const lines = [
    `Measured against php.net's fix table (${v.measuredWith.date}, \`results/firm-verdicts.json\`), over findings that match a label:`,
    "",
    "| | This tool | Naive version compare |",
    "|---|---|---|",
    `| Unverifiable firm verdicts (version-dependent, not EOL, source can't prove the runtime) | ${u.tool} of ${u.M} (0 by design) | ${u.naive} of ${u.M} |`,
    `| EOL findings (counted separately: no official php.net release, so ACTION REQUIRED is certain) | ${v.eolFindings.findings} found, ${v.eolFindings.toolActionRequired} ACTION REQUIRED (the rest are distro or Sail installs, kept in CHECK MANUALLY with an end-of-life note) | ${v.eolFindings.naiveFirm} firm |`,
  ];
  if (u.leftOutNullBranch) lines.push("", `${u.leftOutNullBranch} findings on branches with no fixed version in the table are left out of the first row.`);
  blocks.verdicts = lines.join("\n");
}

function setBlock(text, name, body) {
  const re = new RegExp(`(<!-- ${name}:start -->\\n)[\\s\\S]*?(<!-- ${name}:end -->)`);
  if (!re.test(text)) throw new Error(`README.md has no ${name} block`);
  return text.replace(re, (_m, a, b) => a + (body ? body + "\n" : "") + b);
}

let readme = readFileSync("README.md", "utf8");
for (const [name, body] of Object.entries(blocks)) readme = setBlock(readme, name, body);
readme = readme.replace(/npx php2shell-repo-audit(@[0-9][^\s`]*)?/g, npx);
writeFileSync("README.md", readme);

// llms.txt: built from the README's own text so the two can't drift.
const section = (title) => {
  const i = readme.indexOf(`\n## ${title}\n`);
  if (i < 0) throw new Error(`README has no "${title}" section`);
  const rest = readme.slice(i + title.length + 5);
  return rest.slice(0, rest.search(/\n## /) >= 0 ? rest.search(/\n## /) : undefined);
};
const definition = readme.split("\n").find((l) => l.startsWith("php2shell-repo-audit is a CLI"));
const exitRows = [...section("Exit codes").matchAll(/^\| (\d) \| (.+) \|$/gm)].map((m) => `- \`${m[1]}\`: ${m[2]}`);
const notCaught = section("What this does not catch")
  .split("\n")
  .filter((l) => l.startsWith("- "))
  .map((l) => l.replace("use the `docker run` line above", "use `docker run --rm --entrypoint php <image> -r 'echo PHP_VERSION;'`"));
const anchor = (t) => t.toLowerCase().replace(/[^a-z0-9 -]/g, "").replace(/ /g, "-");
const link = (t) => `- [${t}](${REPO}#${anchor(t)})`;
const llms = [
  "# php2shell-repo-audit",
  "",
  `> ${definition}`,
  "",
  "php2shell is CVE-2026-109618 and CVE-2026-109619. The tool reads files in git (with --org, the GitHub REST API, read-only). It does not check running servers and does not test for the bug.",
  published
    ? `Fix table: rev ${table.revision}, from php.net's advisory of ${date} (${advisory}): ${fixedList}.`
    : "Fix table: php.net's fixed versions are due at 14:00 UTC on 21 Oct 2026; until they are in the table, nothing is marked fixed.",
  "",
  "## Commands",
  `- One repo: \`${npx} path/to/repo\``,
  `- A GitHub org or user account (read-only): \`${npx} --org your-org\``,
  `- Summary for an incident channel: \`${npx} --org your-org --markdown\``,
  `- JSON (schemaVersion 1, a \`fix\` string on every finding): \`${npx} path/to/repo --json\``,
  ...(published ? [`- GitHub Action: \`uses: Amsozzer1/php2shell-repo-audit@v${pkg.version}\``] : []),
  "",
  "## Exit codes",
  ...exitRows,
  "",
  "## What this does not catch",
  ...notCaught,
  "",
  "## README sections",
  ...["Check in 60 seconds, without this tool", "Run it on a repo or a GitHub org", "What to do for each finding", "Exit codes", "JSON output", "php2shell questions", "Results"].map(link),
  `- [Fix table](${REPO}/blob/main/fixes/fixes.json)`,
  "",
].join("\n");
writeFileSync("llms.txt", llms);

if (args.includes("--check")) {
  const errs = [];
  if (llms.split("\n").length > 40) errs.push(`llms.txt has ${llms.split("\n").length} lines (max 40)`);
  if (/\bsafe\b|not vulnerable/i.test(llms)) errs.push("llms.txt says safe or not vulnerable");
  if (exitRows.length !== 5) errs.push(`expected 5 exit code rows, found ${exitRows.length}`);
  const outside = readme.replace(/<!-- (sample|json):start -->[\s\S]*?<!-- \1:end -->/g, "");
  const stale = /\bpending\b(?!-fix)|has not published|publishes the fixed versions? (for each branch )?(in its advisory )?at 14:00|is published after php\.net|when it is published/i;
  for (const [i, line] of [...outside.split("\n").entries(), ...llms.split("\n").map((l, i) => [`llms.txt:${i + 1}`, l])]) {
    if (stale.test(line)) errs.push(`stale wording (${typeof i === "number" ? "README" : i}): ${line.slice(0, 120)}`);
  }
  if (errs.length) {
    console.error(errs.map((e) => "FAIL " + e).join("\n"));
    process.exit(1);
  }
}
console.log(`README.md and llms.txt updated (${published ? "published" : "pending"} table)`);
