// Declaration + fix table -> bucket, reason and message. The rules favour CHECK MANUALLY whenever
// the repo can't prove which PHP build actually runs. Nothing here ever says a repo is fine.
import type { Bucket, Declaration, Finding, FixTable, Reason } from "./types.js";
import { branchOf, compareExact, isEol, parseVersion, type PhpVersion } from "./version.js";
import { OLD_BASE_OS } from "./images.js";

export const RUNTIME_CHECK = "docker run --rm --entrypoint php <image> -r 'echo PHP_VERSION;'";
const CHECK = "the docker run check";

function f(d: Declaration, bucket: Bucket, reason: Reason, branch: string | null, message: string): Finding {
  return { ...d, bucket, reason, branch, message };
}

// Official image tags with no version ("fpm", "cli", "latest") follow the newest PHP release.
const FLOATING_WORDS = /^(latest|fpm|cli|apache|zts|alpine|bookworm|trixie|bullseye|buster|stretch|jessie)([-.].*)?$/i;

function floatingMessage(d: Declaration, branch: string | null): string {
  const b = branch ? ` ${branch}` : "";
  switch (d.kind) {
    case "setup-php":
      return `setup-php installs the current or pre-installed${b} patch, not a pinned build`;
    case "php-version-file":
      return `tools that read .php-version use whatever${b} patch is installed`;
    case "tool-versions":
      return `minor-only version resolves to whatever${b} patch is installed`;
    default: {
      let m = "rebuild with --pull and redeploy after the release, then confirm with " + CHECK;
      if (d.note && OLD_BASE_OS.test(d.note)) m += `; tags on an old base OS (${d.note}) may no longer be rebuilt`;
      return m;
    }
  }
}

function eolNote(v: PhpVersion | null, eol: string[]): string {
  return v && isEol(v, eol) ? ` (${branchOf(v) ?? v.major + ".x"} is end of life)` : "";
}

// php.net's 21 Oct 2026 advisory: no official release for 8.1 and older, but source backport branches
// in php-src for 7.4, 8.0 and 8.1; some distros and LTS vendors backport too.
export const BACKPORT_BRANCHES = new Set(["7.4", "8.0", "8.1"]);

export function eolMessage(branch: string): string {
  const build = BACKPORT_BRANCHES.has(branch) ? `, or build from php.net's backport branch PHP-${branch}-CVE-2026-109618-109619` : "";
  return `no official php.net release for ${branch}; upgrade, use your vendor's backport${build}`;
}

export function classify(d: Declaration, table: FixTable): Finding {
  const v = d.version ? parseVersion(d.version.replace(/^[\^~>=<\s]+/, "")) : null;
  const branch = v ? branchOf(v) : null;

  switch (d.kind) {
    case "composer":
      return f(d, "manual", "constraint-only", branch, "a composer constraint is not the runtime");
    case "distro":
    case "sail":
      return f(d, "manual", "distro-vendor", branch,
        "vendors backport fixes without changing the version; check your vendor's security tracker" + eolNote(v, table.eol));
    case "third-party-image":
      return f(d, "manual", "third-party-image", branch,
        (branch ? `bundles PHP ${branch}${eolNote(v, table.eol)}; ` : "bundles PHP; ") + "check the image maintainer's release, then confirm with " + CHECK);
    case "digest":
      return f(d, "manual", "digest", branch, "pinned by digest; check the image with " + CHECK);
    case "unresolved":
      return f(d, "manual", "unresolved", null, "version comes from a variable or matrix this tool can't resolve");
    case "build-arg":
      return f(d, "manual", "build-arg", branch,
        `default ${d.version ?? "?"} can be overridden at build` + eolNote(v, table.eol));
    default:
      break;
  }

  // Version-bearing kinds: official-image, setup-php, php-version-file, tool-versions.
  const raw = (d.version ?? "").trim();
  if (!v) {
    const floats = d.kind === "official-image" ? raw === "" || FLOATING_WORDS.test(raw) : /^(latest|highest)$/i.test(raw);
    if (floats) return f(d, "manual", "floating-rebuild", null, floatingMessage(d, null));
    return f(d, "manual", "unknown-branch", null, `version "${raw}" is not a PHP release this tool knows`);
  }
  if (isEol(v, table.eol))
    return f(d, "action", "eol", branch, eolMessage(branch ?? `${v.major}.x`));
  if (v.minor === null) {
    if (v.major === 8) return f(d, "manual", "floating-rebuild", null, floatingMessage(d, null));
    return f(d, "manual", "unknown-branch", null, `${v.raw} is not a branch in the fix table`);
  }
  const entry = table.branches[branch!];
  // A pre-release (8.6.0RC3, 8.6-rc) is only judged when its branch is in the table.
  if (!entry)
    return f(d, "manual", "unknown-branch", branch, v.pre ? `${v.raw} is a pre-release on a branch with no entry in the fix table; check it manually` : `${branch} is not a branch in the fix table`);

  const exact = (d.kind === "official-image" || d.kind === "tool-versions") && v.patch !== null;
  if (!exact) {
    // A non-exact source (setup-php, .php-version) that explicitly names a pre-release below the fix
    // is asking for a build older than the fix: ACTION REQUIRED. Anything else stays manual.
    if (v.pre && v.patch !== null && entry.fixed !== null && compareExact(v, parseVersion(entry.fixed)!) < 0)
      return f(d, "action", "vulnerable", branch, `declares pre-release ${v.raw}, below the fix in ${entry.fixed}; upgrade`);
    return f(d, "manual", "floating-rebuild", branch, floatingMessage(d, branch));
  }

  if (entry.affected === false)
    return f(d, "fixed", "not-affected", branch, "advisory lists this branch as not affected; runtime not verified");
  if (entry.fixed === null)
    return f(d, "manual", "pending-fix", branch, `php.net has not published the fixed ${branch} version`);
  if (compareExact(v, parseVersion(entry.fixed)!) < 0)
    return f(d, "action", "vulnerable", branch, `fixed in ${entry.fixed}, upgrade`);
  return f(d, "fixed", "declared-fixed", branch, `declares ${v.raw}, at or above ${entry.fixed}; runtime not verified`);
}

export interface ExitResult {
  code: 0 | 1 | 3 | 4;
  why: string;
}

// 4: nothing found. 1: anything ACTION REQUIRED. 3: anything needs a human (manual findings,
// skipped candidate files, or no production runtime declared at all). 0 otherwise.
export function exitCode(findings: Finding[], skippedCandidates: number): ExitResult {
  if (findings.length === 0) return { code: 4, why: "0 PHP declarations found: this tool could not see your PHP runtime" };
  if (findings.some((x) => x.bucket === "action")) return { code: 1, why: "action required" };
  const hasProdRuntime = findings.some((x) => x.context === "prod" && x.kind !== "composer");
  // A composer constraint only stops counting as "needs a check" when a production runtime is declared.
  const manual = findings.filter((x) => x.bucket === "manual" && x.reason !== "constraint-only");
  if (manual.length) return { code: 3, why: `${manual.length} finding(s) need a manual check` };
  if (!hasProdRuntime) return { code: 3, why: "no production runtime declared" };
  if (skippedCandidates > 0) return { code: 3, why: `${skippedCandidates} candidate file(s) were skipped or not parsed` };
  return { code: 0, why: "nothing needs action or a manual check in what this repo declares" };
}
