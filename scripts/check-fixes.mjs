// Cross-checks a fix table against php.net's per-branch release data before a release.
// Usage: node scripts/check-fixes.mjs [fixes/fixes.json] [--allow-json-lag]
//   - the table must validate and have status "published"
//   - null branches are skipped (php.net didn't name a fix for them)
//   - each fixed version must be <= that branch's latest release on php.net
// If php.net's release data hasn't caught up with the advisory yet, this fails with "retry".
// --allow-json-lag turns that into a warning; only use it with the advisory URL in the commit message.
import { readTableFile } from "../dist/src/fixes.js";
import { compareExact, parseVersion } from "../dist/src/version.js";

const args = process.argv.slice(2);
const allowLag = args.includes("--allow-json-lag");
const path = args.find((a) => !a.startsWith("--")) ?? "fixes/fixes.json";

const table = readTableFile(path); // throws on any validation error
let failed = false;
if (table.status !== "published") {
  console.error(`FAIL ${path}: status is ${table.status}, expected published`);
  process.exit(1);
}
for (const [branch, entry] of Object.entries(table.branches)) {
  if (entry.fixed === null) {
    console.log(`skip ${branch}: no fixed version in the table`);
    continue;
  }
  const url = `https://www.php.net/releases/?json&version=${branch}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const latest = (await res.json()).version;
  const cmp = compareExact(parseVersion(entry.fixed), parseVersion(latest));
  if (cmp <= 0) {
    console.log(`ok   ${branch}: fixed ${entry.fixed}, php.net latest ${latest}`);
  } else if (allowLag) {
    console.warn(`WARN ${branch}: fixed ${entry.fixed} is newer than php.net latest ${latest} (release data lagging, allowed)`);
  } else {
    console.error(`FAIL ${branch}: fixed ${entry.fixed} is newer than php.net latest ${latest}. php.net release data not updated yet, retry in a few minutes.`);
    failed = true;
  }
}
process.exit(failed ? 1 : 0);
