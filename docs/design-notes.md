# Design notes

Why each decision was made, what was tried and dropped, and what the numbers changed.

## 1. Three buckets, and nothing is ever called fine
**Chose:** ACTION REQUIRED, CHECK MANUALLY, DECLARED ≥ FIXED, each finding with a reason code. DECLARED ≥ FIXED always says "runtime not verified".
**Because:** a version in a repo is not what runs in production. The worst thing this tool could do is tell someone they're fine when they aren't, so the default for anything unprovable is CHECK MANUALLY.
**Tried first / what went wrong:** the first plan treated `setup-php php-version: 8.3.30` and `.php-version` as exact pins. setup-php and the tools that read `.php-version` install whatever patch is current or pre-installed, so a declared version at or above the fix could still run an older 8.3. Both are now floating.

## 2. Exit codes 3 and 4
**Chose:** 1 for ACTION REQUIRED, 3 for anything that needs a human, 4 when nothing was found. The Action fails on all three by default.
**Because:** with only 0 and 1, a repo the tool couldn't read, or one full of floating tags, would get a green check on the day people most want one to mean something.
**Tried first / what went wrong:** composer constraints are in almost every PHP repo and are always CHECK MANUALLY, so every repo would stay at 3 forever. A constraint now stops counting once a production runtime is declared. A dev-only pin (`.tool-versions`) plus composer still exits 3 ("no production runtime declared"). The plan only required that rule when composer was present; the code applies it whenever no production runtime is declared, which is stricter.

## 3. A remote fix table that can only add information
**Chose:** the CLI fetches `fixes/fixes.json` from `main` so the table can be corrected without an npm release. A remote table is rejected unless it validates, its revision is not older, it doesn't lower or null any bundled fix, and it doesn't add "not affected".
**Because:** a typo or a bad push on `main` would otherwise change every user's verdicts at once. Every fixed version must also be above the builds that shipped before the fix (8.2.34, 8.3.35, 8.4.26, 8.5.11).

## 4. The first corpus run failed in useful ways
**Chose:** label the corpus by hand from a grep over config files, commit the labels, then run the tool.
**What happened:** the first run found 58 of 69 labeled declarations with 3 false positives. The misses and false positives:
- `Dockerfile-fpm` didn't match the Dockerfile name pattern.
- setup-php versions set in `env:` and read with `${{ env.php-version }}` came out as unresolved.
- PHP versions passed as inputs to reusable workflows (`with: php-versions: "['8.3', '8.4']"`) weren't read.
- `matrix.exclude` entries were read as declared versions, a false positive.
- Laravel Sail's `apt-get install $(for ext ...; do echo "php8.0-$ext"; done)` was split at the `;` inside `$( )`, so the package was lost.
- One label was missing: the labeling grep for one repo didn't include `sail/runtimes` yet. It was added and recorded as a correction.

After fixing them, the same repos went to 70 of 70. Since that is tuned on the same repos, I labeled 4 more repos and measured them once: 36 of 42, 1 false positive, against grep's 16 of 42. The held-out misses were setup-php referenced by full URL (`uses: https://github.com/shivammathur/setup-php@v2`, common on Forgejo), Debian's `libapache2-mod-php`, and an Arch `pacman -S` install. Those are fixed in the release, and the README reports the held-out number from before the fixes.

## 5. Unverifiable firm verdicts instead of false "fixed"
**Chose:** compare against a naive version check by counting firm verdicts ("vulnerable" or "fixed") on sources that can't prove the runtime, EOL excluded and reported separately.
**Because:** the corpus is pinned to commits from before the fix existed, so no repo can declare a fixed version, and a "false fixed" count would be 0 for both. The naive check isn't wrong to say an image built yesterday from `php:8.3-fpm` is unfixed; the point is that the repo can't tell you, so a firm verdict is a guess. False "fixed" is still a hard test, over synthetic fixtures.

## 6. Line-based YAML and Dockerfile reading
**Chose:** no YAML parser, no runtime dependencies.
**Because:** `npx` of a fresh package on CVE day should pull nothing else. The cost is that anchors, `extends:` and `include:` aren't followed; the README says so.

## 7. The rc publish
**Chose:** publish `0.1.0-rc.0` from the workflow early in the day to test the token, 2FA and provenance hours before the release.
**What happened:** the first try failed with `EOTP`. The token could log in but wasn't allowed to publish without a one-time password. It needs a granular token with "bypass two-factor authentication". Finding that at 09:40 instead of 14:05 was the point of the early publish.
