// Cross-checks a fix table against php.net's release data before a release.
// Usage: node scripts/check-fixes.mjs [fixes/fixes.json] [--allow-json-lag] [--confirm-rc <version>]...
//   - the table must validate and have status "published"
//   - null branches are skipped (php.net didn't name a fix for them)
//   - a final release (8.3.36-style) must be <= that branch's latest on https://www.php.net/releases/?json&version=<branch>
//   - a release candidate (8.6.0RC4-style) must be listed on https://www.php.net/release-candidates.php?format=json
//     (the JSON qa.php.net now redirects to). That page only lists the current RC per version, so a fixed RC
//     can be missing for a while after the advisory, or after the next RC replaces it.
// If php.net's data hasn't caught up, this fails with "retry".
//   --allow-json-lag        turns a lagging final release into a warning (advisory URL in the commit message)
//   --confirm-rc <version>  accepts that exact RC without finding it on php.net, with a warning; only after
//                           reading the advisory yourself
import { readTableFile } from "../dist/src/fixes.js";
import { compareExact, parseVersion } from "../dist/src/version.js";

const args = process.argv.slice(2);
const allowLag = args.includes("--allow-json-lag");
const confirmedRc = new Set();
for (let i = 0; i < args.length; i++) if (args[i] === "--confirm-rc") confirmedRc.add(String(args[++i] ?? "").toUpperCase());
const path = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--confirm-rc") ?? "fixes/fixes.json";

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

let rcVersions = null;
async function listedRcs() {
  if (rcVersions) return rcVersions;
  const d = await getJson("https://www.php.net/release-candidates.php?format=json");
  rcVersions = new Set();
  for (const [k, v] of Object.entries(d)) {
    if (k === "releases") for (const r of Object.values(v)) r?.version && rcVersions.add(String(r.version).toUpperCase());
    else if (v?.release?.version) rcVersions.add(String(v.release.version).toUpperCase());
  }
  return rcVersions;
}

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
  const fixed = parseVersion(entry.fixed);
  if (fixed.pre) {
    const listed = await listedRcs();
    const want = entry.fixed.toUpperCase();
    if (listed.has(want)) {
      console.log(`ok   ${branch}: fixed ${entry.fixed} is listed on php.net's release-candidates page`);
    } else if (confirmedRc.has(want)) {
      console.warn(`WARN ${branch}: fixed ${entry.fixed} is not listed on php.net's release-candidates page (it shows ${[...listed].filter((v) => v.startsWith(branch + ".")).join(", ") || "nothing"} for ${branch}); accepted because of --confirm-rc ${entry.fixed}`);
    } else {
      console.error(`FAIL ${branch}: fixed ${entry.fixed} is a release candidate that php.net's release-candidates page doesn't list (it shows ${[...listed].filter((v) => v.startsWith(branch + ".")).join(", ") || "nothing"} for ${branch}). Retry in a few minutes, or, after checking the advisory names exactly ${entry.fixed}, pass --confirm-rc ${entry.fixed}.`);
      failed = true;
    }
    continue;
  }
  const data = await getJson(`https://www.php.net/releases/?json&version=${branch}`);
  const latest = typeof data.version === "string" ? data.version : null;
  if (latest && compareExact(fixed, parseVersion(latest)) <= 0) {
    console.log(`ok   ${branch}: fixed ${entry.fixed}, php.net latest ${latest}`);
  } else if (allowLag) {
    console.warn(`WARN ${branch}: fixed ${entry.fixed} is newer than php.net latest ${latest ?? "(no release listed)"} (release data lagging, allowed)`);
  } else {
    console.error(`FAIL ${branch}: fixed ${entry.fixed} is newer than php.net latest ${latest ?? "(no release listed)"}. php.net release data not updated yet, retry in a few minutes.`);
    failed = true;
  }
}
process.exit(failed ? 1 : 0);
