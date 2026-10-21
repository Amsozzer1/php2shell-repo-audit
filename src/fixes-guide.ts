// What to do for each reason code. Shown in the README ("What to do for each finding") and as
// `fix` on every finding in --json. The tool doesn't change anything; these are steps for a person.
import type { Reason } from "./types.js";

export const RUNTIME_CHECK_CMD = "docker run --rm --entrypoint php <image> -r 'echo PHP_VERSION;'";

export const FIX_GUIDE: Record<Reason, string> = {
  eol: "php.net has no official release for this branch. Upgrade to a supported branch (8.2 or newer), use your distro's or LTS vendor's backport, or for 7.4, 8.0 and 8.1 build from php.net's source backport branch (`PHP-<branch>-CVE-2026-109618-109619` in php-src). Rebuild and redeploy.",
  vulnerable: "Change the pin to the fixed version for this branch (named in the finding's message), rebuild and redeploy.",
  "pending-fix": "php.net has no fixed version in the table for this branch yet. Re-run after the advisory; if the pin is below the fix, change it.",
  "floating-rebuild": "After the release, rebuild with `docker build --pull .` and redeploy, or re-run the CI job for setup-php. Then confirm with `" + RUNTIME_CHECK_CMD + "`.",
  "distro-vendor": "Install your vendor's security update (`apt-get update && apt-get install --only-upgrade 'php*'`, `apk upgrade`, or `dnf upgrade 'php*'`), rebuild, and check the package version against the vendor's security tracker.",
  "third-party-image": "Check the image maintainer's release for a rebuild on the fixed PHP, pull it with `docker pull <image>`, redeploy, and confirm with `" + RUNTIME_CHECK_CMD + "`.",
  "build-arg": "Find the value your build actually passes (`--build-arg`, compose `args:`, CI) and check that version; the default in the file can be overridden.",
  digest: "Run `" + RUNTIME_CHECK_CMD + "` on the pinned digest. If it's below the fix, move to a rebuilt image and update the digest.",
  "constraint-only": "Nothing to change for the runtime. A composer constraint doesn't choose the PHP that runs; check the other findings or the running image.",
  unresolved: "Find where the variable or matrix value is set (CI, compose, .env) and check that version by hand.",
  "unknown-branch": "Check this version by hand against php.net's advisory. It is a dev build, or a version (or pre-release) on a branch with no entry in the fix table.",
  "declared-fixed": "Nothing to change in what the repo declares. Confirm the deployed runtime with `" + RUNTIME_CHECK_CMD + "`.",
  "not-affected": "Nothing to change in what the repo declares. Confirm the deployed runtime with `" + RUNTIME_CHECK_CMD + "`.",
};
