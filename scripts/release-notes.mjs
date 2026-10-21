// Prints the GitHub Release notes for a version, from fixes/fixes.json and the committed results.
// Usage: node scripts/release-notes.mjs <version>
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const version = process.argv[2];
if (!version) throw new Error("usage: node scripts/release-notes.mjs <version>");
const t = JSON.parse(readFileSync("fixes/fixes.json", "utf8"));
if (t.status !== "published") throw new Error("fix table is not published");
const sha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const branches = Object.keys(t.branches).sort((a, b) => Number(b.split(".")[1]) - Number(a.split(".")[1]));
const row = (b) => `| ${b} | ${t.branches[b].fixed ?? (t.branches[b].affected === false ? "not affected" : "no fixed version named")} |`;

console.log(`php2shell-repo-audit ${version} lists the PHP versions your repos declare and sorts them by what needs the php2shell fix for CVE-2026-109618 and CVE-2026-109619, using the fixed versions from [php.net's advisory](${t.source}).

## Fix table in this release (rev ${t.revision}, ${t.publishedAt})

| Branch | Fixed in |
|---|---|
${branches.map(row).join("\n")}

5.x, 7.x, 8.0 and 8.1 get no official php.net release and are ACTION REQUIRED; php.net published source backport branches for 7.4, 8.0 and 8.1, and some vendors backport. If you can't update right now, the advisory lists mitigations that reduce exposure but don't fix it. The table is filled by hand from the advisory and checked against php.net's per-branch release data (\`scripts/check-fixes.mjs\`).

## Run it

\`\`\`sh
npx php2shell-repo-audit@${version} path/to/repo
npx php2shell-repo-audit@${version} --org your-org --markdown > php2shell.md
\`\`\`

\`\`\`yaml
- uses: actions/checkout@v4
- uses: Amsozzer1/php2shell-repo-audit@${sha} # v${version}
\`\`\`

It reads files in git, and with \`--org\` the GitHub REST API (read-only). It does not check running servers and does not test for the bug. It never says a repo is fine: DECLARED ≥ FIXED always means "runtime not verified".

## Measured

On 4 held-out public repos with 42 declarations labeled by hand, the tool found 36 and \`grep -rnE "FROM +php:"\` found 16. That is a small set, labeled by one person, and recall only covers the file types the labels covered. Method: [results/numbers.md](https://github.com/Amsozzer1/php2shell-repo-audit/blob/v${version}/results/numbers.md).

npm: [php2shell-repo-audit@${version}](https://www.npmjs.com/package/php2shell-repo-audit/v/${version}), published from the release workflow with provenance.`);
