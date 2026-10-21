# php2shell-repo-audit: which PHP versions do your Dockerfiles, CI and composer.json declare, and which need the php2shell fix (CVE-2026-109618, CVE-2026-109619)?

By [Ahmed Sozzer](https://amsozzer.com) · [github.com/Amsozzer1](https://github.com/Amsozzer1)

[![npm version](https://img.shields.io/npm/v/php2shell-repo-audit)](https://www.npmjs.com/package/php2shell-repo-audit) [![CI](https://github.com/Amsozzer1/php2shell-repo-audit/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Amsozzer1/php2shell-repo-audit/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/license-MIT-blue)](https://github.com/Amsozzer1/php2shell-repo-audit/blob/main/LICENSE)

php2shell-repo-audit is a CLI and GitHub Action that lists the PHP versions it finds declared in your repos (Dockerfiles, compose, Kubernetes, CI, composer.json) and sorts them by what needs the php2shell fix for CVE-2026-109618 and CVE-2026-109619.

<!-- intro:start -->
php2shell is two critical bugs in PHP itself; php.net publishes the fixed versions at 14:00 UTC on 21 Oct 2026. The first question is which of your repos and images run a PHP that needs the fix. `grep "FROM php:"` finds some Dockerfile lines. It misses CI versions, distro packages, version files and images that bundle PHP, and it doesn't tell you which lines matter: a floating tag like `php:8.3-fpm` is only fixed after you rebuild, a Debian package can be patched without its version changing, and a composer constraint isn't a runtime at all. This tool reads those files in one repo or a GitHub org. It does not check running servers.
<!-- intro:end -->

## Check in 60 seconds, without this tool

```sh
# on a server or container
php -r 'echo PHP_VERSION, PHP_EOL;'
dpkg -l 'php*' 2>/dev/null | grep ^ii    # Debian/Ubuntu packages (vendors backport fixes without changing the version)
apk info -v 2>/dev/null | grep ^php      # Alpine packages

# for a built image
docker run --rm --entrypoint php <image> -r 'echo PHP_VERSION, PHP_EOL;'

# images on a floating tag (php:8.3-fpm) only pick up the fix after a rebuild and redeploy
docker build --pull .
```

<!-- compare:start -->
Compare what you see with the fixed versions in [php.net's advisory](https://www.php.net/archive/2026.php) when it is published at 14:00 UTC on 21 Oct 2026.
<!-- compare:end -->

## Run it on a repo or a GitHub org

<!-- release-note:start -->
0.1.0 is published after php.net's advisory at 14:00 UTC. Until then, `npx php2shell-repo-audit` runs the release candidate, whose fix table has no fixed versions yet, so nothing is marked fixed.
<!-- release-note:end -->

```sh
npx php2shell-repo-audit path/to/repo
```

Node 20 or newer. No runtime dependencies. On a local repo the only network call fetches the fix table from this repo (`fixes/fixes.json` on `main`, 3 second timeout); `--offline` uses the copy bundled in the package.

To inventory the repos in a GitHub organization or user account, read-only:

```sh
npx php2shell-repo-audit --org your-org                         # buckets grouped by repo
npx php2shell-repo-audit --org your-org --markdown > php2shell.md   # short summary to paste into an incident channel
```

- The token comes from `GH_TOKEN`, `GITHUB_TOKEN` or `gh auth token`. It only makes GET requests. For private repos, a fine-grained token with read access to Contents and Metadata is enough. It only sees repos the token can read, so check the repo count it prints against what you expect.
- It reads each repo's default branch: one git trees call per repo, then one call per file the detectors read. Nothing else is downloaded.
- Archived repos and forks are skipped (`--include-forks` includes forks).
- It reads the rate-limit headers, waits for the reset when few requests are left or a limit is hit, and prints progress to stderr. For GitHub Enterprise, set `GITHUB_API_URL`.

As a GitHub Action:

```yaml
- uses: actions/checkout@v4
- uses: Amsozzer1/php2shell-repo-audit@v0.1.0
  with:
    path: .
    fail-on: manual   # or "action" to fail only on ACTION REQUIRED
```

It writes the findings to the job summary. You can also pin to the full commit SHA of the v0.1.0 tag instead of the tag name.

![Terminal: grep finds 3 lines in the demo repo, then php2shell-repo-audit finds the 7 declarations in the demo repo and sorts them](https://raw.githubusercontent.com/Amsozzer1/php2shell-repo-audit/main/docs/demo.gif)

*The demo repo is synthetic (`examples/demo-repo/`). First `grep -rnE "FROM +php:"`, the usual "inventory your Dockerfiles" step, finds 3 lines. Then the tool finds the 7 declarations in the demo repo: three Dockerfiles, a Debian package install, a setup-php version in CI, `.tool-versions` and composer. It sorts them into ACTION REQUIRED, CHECK MANUALLY and DECLARED ≥ FIXED, with a reason for each. The last scene runs `--org --markdown` on a made-up org (`example-org`), served from recorded API fixtures by `scripts/mock-github.mjs`.*

Output on the demo repo:

<!-- sample:start -->
```text
$ php2shell-repo-audit examples/demo-repo
php2shell-repo-audit 0.1.0  ·  fix table rev 1: pending, php.net has not published fixed versions
Reads PHP versions declared in this repo. It does not check running servers.

ACTION REQUIRED (1)
  docker/legacy/Dockerfile:1   prod  FROM php:8.1-fpm            eol: no official php.net release for 8.1; upgrade, use your vendor's backport, or build from php.net's backport branch PHP-8.1-CVE-2026-109618-109619

CHECK MANUALLY (6)
  .github/workflows/ci.yml:10  ci    setup-php 8.3               floating-rebuild: setup-php installs the current or pre-installed 8.3 patch, not a pinned build
  .tool-versions:2             dev   php 8.4.20                  pending-fix: php.net has not published the fixed 8.4 version
  Dockerfile:1                 prod  FROM php:8.3-fpm            floating-rebuild: rebuild with --pull and redeploy after the release, then confirm with the docker run check
  composer.json:6              prod  "php": "^8.2"               constraint-only: a composer constraint is not the runtime
  docker/api/Dockerfile:1      prod  FROM php:8.3.30-fpm         pending-fix: php.net has not published the fixed 8.3 version
  docker/worker/Dockerfile:3   prod  apt-get install php8.2-cli  distro-vendor: vendors backport fixes without changing the version; check your vendor's security tracker

DECLARED ≥ FIXED (0)

The docker run check: docker run --rm --entrypoint php <image> -r 'echo PHP_VERSION;'
exit 1: action required
```
<!-- sample:end -->

## Results

Measured on 10 public PHP repos pinned to commit SHAs on 21 Oct 2026 (`results/corpus.json`), against declarations I labeled by hand (`results/labels.json`) before running the tool on each repo. Labels are line level with no versions; no per-repo verdicts are published. Recall is measured over the file types the labeling grep covers: Dockerfiles, Containerfiles, YAML, `.php-version`, `.tool-versions` and `composer.json`.

| Set | Approach | Declarations found | False positives |
|---|---|---|---|
| Held out (4 repos, 42 labels), measured once | **This tool** | **36 / 42 (86%)** | 1 |
| | Baseline: `grep -rnE "FROM +php:"` | 16 / 42 (38%) | 0 |
| Tuning (6 repos, 69 labels at the time), first run | **This tool** | 58 / 69 (84%) | 3 |
| | Baseline: `grep -rnE "FROM +php:"` | 31 / 69 (45%) | 0 |

The first run on the tuning repos found real gaps (Dockerfile names like `Dockerfile-fpm`, setup-php versions set through `env:` or passed to reusable workflows, `matrix.exclude` entries read as versions). I fixed them and the tuning set went to 70/70, but that number was tuned on the same repos, so it isn't in the table. The held-out repos were labeled after those fixes and measured once. Their 6 misses (setup-php referenced by full URL, Debian's `libapache2-mod-php`, an Arch `pacman` install) are fixed in this release too, which makes the held-out number a measurement of the code before those fixes. The tuning set has 70 labels now: one label the labeling pass missed was added after the first run (recorded under `corrections` in `results/labels.json`), so the first run is scored out of 69 and later runs out of 70. Every run is in [`results/runs/`](https://github.com/Amsozzer1/php2shell-repo-audit/blob/main/results/runs/README.md).

**111 of the 112 labeled declarations can't prove which PHP build runs.** They are floating image tags, setup-php versions, distro packages, Sail runtimes, images that bundle PHP, templated tags and composer constraints. Only one is an exact pin (`.tool-versions` with a patch version). That is why most findings land in CHECK MANUALLY.

<!-- verdicts:start -->
<!-- verdicts:end -->

Full numbers and how each was produced: [`results/numbers.md`](https://github.com/Amsozzer1/php2shell-repo-audit/blob/main/results/numbers.md).

## How it works

<!-- how-it-works:start -->
- Walks the repo (skipping `node_modules`, `vendor`, `.git` and files over 1 MB) and reads Dockerfiles and Containerfiles, YAML files (compose, Kubernetes, GitHub Actions, GitLab CI, Forgejo), `.php-version`, `.tool-versions` and `composer.json`. YAML is read line by line, without a YAML library.
- Each declaration gets a kind (official `php` image, digest, ARG default, image that bundles PHP, distro package, Sail runtime, setup-php, version file, composer) and a context (prod, ci, dev).
- A fix table from php.net (`fixes/fixes.json`) decides the bucket. php.net has not published fixed versions yet, so every branch is pending and nothing can be marked fixed.
- The verdict rules only allow DECLARED ≥ FIXED for an exact version in an official image tag or `.tool-versions`. Everything that can't prove the runtime goes to CHECK MANUALLY with a reason. EOL branches (5.x, 7.x, 8.0, 8.1) are ACTION REQUIRED, because php.net ships no official release for them. The exceptions are distro and Sail installs and ARG defaults, which say end of life in the message but stay in CHECK MANUALLY, because a vendor may patch them or the build may override them.
- A remote fix table is only used if it validates and can't weaken anything: it can't lower or remove a fixed version, can't add "not affected", can't have an older revision, and every fixed version must be newer than the builds that shipped before the fix.
<!-- how-it-works:end -->

| Bucket | Reason codes |
|---|---|
| ACTION REQUIRED | `eol`, `vulnerable` (exact version below the fix) |
| CHECK MANUALLY | `floating-rebuild`, `pending-fix`, `distro-vendor`, `third-party-image`, `build-arg`, `digest`, `constraint-only`, `unresolved`, `unknown-branch` |
| DECLARED ≥ FIXED | `declared-fixed`, `not-affected` (always "runtime not verified") |

## What this does not catch

- Servers and shared hosting that aren't described in git: cPanel, Plesk, `.htaccess` PHP handlers.
- PaaS and managed runtimes: Platform.sh, Upsun, DDEV, Laravel Vapor, Bref, App Engine, Azure App Service, Elastic Beanstalk, Forge, Laravel Cloud, Heroku, Railway and Nixpacks.
- Distro backports. A Debian or RHEL package can be fixed without its version changing, so distro installs always go to CHECK MANUALLY.
- Helm and Kustomize templates, compose `extends:`, GitLab `include:`, and versions set in `.env` files.
- Anything built outside the repo, and the image that is actually deployed. For that, use the `docker run` line above.
- Images it doesn't recognize as bundling PHP. It recognizes `wordpress`, `drupal`, `joomla`, `nextcloud`, `matomo`, `phpmyadmin`, `composer`, `dunglas/frankenphp`, `laravelsail/*`, `bitnami/php-fpm`, `bitnami/wordpress`, `bitnami/laravel`, `serversideup/php`, `webdevops/php*`, `thecodingmachine/php`, `shinsenter/*`, `chialab/php`, and any image whose last name part contains `php`.

## What to do for each finding

The tool doesn't change anything. Each finding has a reason code; this is what to do about it. The same text is in `--json` as `fix` on every finding. If you can't update right now, php.net lists [mitigations in its advisory](https://www.php.net/archive/2026.php#2026-10-21-5) that reduce exposure but don't fix it.

<!-- fix-guide:start -->
| Reason | What to do |
|---|---|
| `eol` | php.net has no official release for this branch. Upgrade to a supported branch (8.2 or newer), use your distro's or LTS vendor's backport, or for 7.4, 8.0 and 8.1 build from php.net's source backport branch (`PHP-<branch>-CVE-2026-109618-109619` in php-src). Rebuild and redeploy. |
| `vulnerable` | Change the pin to the fixed version for this branch (named in the finding's message), rebuild and redeploy. |
| `floating-rebuild` | After the release, rebuild with `docker build --pull .` and redeploy, or re-run the CI job for setup-php. Then confirm with `docker run --rm --entrypoint php <image> -r 'echo PHP_VERSION;'`. |
| `pending-fix` | php.net has no fixed version in the table for this branch yet. Re-run after the advisory; if the pin is below the fix, change it. |
| `distro-vendor` | Install your vendor's security update (`apt-get update && apt-get install --only-upgrade 'php*'`, `apk upgrade`, or `dnf upgrade 'php*'`), rebuild, and check the package version against the vendor's security tracker. |
| `third-party-image` | Check the image maintainer's release for a rebuild on the fixed PHP, pull it with `docker pull <image>`, redeploy, and confirm with `docker run --rm --entrypoint php <image> -r 'echo PHP_VERSION;'`. |
| `build-arg` | Find the value your build actually passes (`--build-arg`, compose `args:`, CI) and check that version; the default in the file can be overridden. |
| `digest` | Run `docker run --rm --entrypoint php <image> -r 'echo PHP_VERSION;'` on the pinned digest. If it's below the fix, move to a rebuilt image and update the digest. |
| `constraint-only` | Nothing to change for the runtime. A composer constraint doesn't choose the PHP that runs; check the other findings or the running image. |
| `unresolved` | Find where the variable or matrix value is set (CI, compose, .env) and check that version by hand. |
| `unknown-branch` | Check this version by hand against php.net's advisory. It is a dev build, or a version (or pre-release) on a branch with no entry in the fix table. |
| `declared-fixed` | Nothing to change in what the repo declares. Confirm the deployed runtime with `docker run --rm --entrypoint php <image> -r 'echo PHP_VERSION;'`. |
| `not-affected` | Nothing to change in what the repo declares. Confirm the deployed runtime with `docker run --rm --entrypoint php <image> -r 'echo PHP_VERSION;'`. |
<!-- fix-guide:end -->

## php2shell questions

### How do I check if my repos are affected by php2shell (CVE-2026-109618, CVE-2026-109619)?

php2shell-repo-audit can't tell whether a running server is affected; it lists the PHP versions your repos declare and sorts them by what needs the fix. Run `npx php2shell-repo-audit path/to/repo` for one repo, or `npx php2shell-repo-audit --org your-org` for a GitHub organization. It lists the PHP versions it finds declared in git (Dockerfiles, compose, Kubernetes manifests, CI, version files, composer.json) and puts each one in ACTION REQUIRED, CHECK MANUALLY or DECLARED ≥ FIXED against php.net's fix table, with a reason code and a context (prod, ci, dev). Setups it does not read are listed under "What this does not catch".

### Does it check my servers or running containers?

No. php2shell-repo-audit reads files in git, and with `--org` it only makes read-only GET requests to the GitHub REST API. On a local repo the only network call fetches the fix table (`fixes/fixes.json` on `main`); `--offline` uses the bundled copy. To see the PHP build that actually runs, use the `php -r`, `dpkg -l`/`apk info` and `docker run` commands in "Check in 60 seconds". For distro builds, the package version checked against your vendor's security tracker is what counts, not `PHP_VERSION`.

### Does it test for the php2shell bug itself?

No. It compares the PHP versions a repo declares with the fixed versions php.net publishes, and it never says a repo is fine. DECLARED ≥ FIXED always means "runtime not verified".

### Which PHP versions fix CVE-2026-109618 and CVE-2026-109619?

<!-- fixed-versions:start -->
php.net publishes the fixed version for each branch in its advisory at 14:00 UTC on 21 Oct 2026. This tool reads them from [`fixes/fixes.json`](https://github.com/Amsozzer1/php2shell-repo-audit/blob/main/fixes/fixes.json), which is filled by hand from that advisory; until it is, every branch in the table is `pending` and nothing can be marked fixed. 5.x, 7.x, 8.0 and 8.1 get no official php.net release, so the tool marks them ACTION REQUIRED. php.net published source backport branches for 7.4, 8.0 and 8.1, and some distros and LTS vendors backport; the message for each finding says which applies. Distro packages, Sail runtimes and ARG defaults on those branches stay in CHECK MANUALLY, because a vendor or the build may change them.
<!-- fixed-versions:end -->

### Is `php:8.3-fpm` fixed?

Not by itself. A floating tag says nothing about the build you run: you get the fix only after the official image is rebuilt on the fixed release and you rebuild with `docker build --pull` and redeploy. Push the rebuilt image under a new tag or digest, or make sure the deploy pulls it; restarting the same container, or reusing the tag with `imagePullPolicy: IfNotPresent`, keeps the old build. Then confirm with the `docker run` check. The tool reports these lines as CHECK MANUALLY with the reason `floating-rebuild`.

### Does updating Laravel, WordPress, Symfony or Drupal fix php2shell?

Updating the framework's code does not. php2shell is in the PHP runtime, so the fix is a new PHP build: a rebuilt image, a new setup-php run or a distro package update. Pulling a rebuilt official `wordpress` or `drupal` image can, because those images bundle PHP; confirm with the `docker run` check. Changing `require.php` in `composer.json` does not change the runtime either; the tool reports composer constraints as `constraint-only`.

### Does a Debian or Ubuntu package version show the fix?

Not reliably. Distro vendors backport fixes without changing the upstream version, so apt, apk, dnf, yum, pacman, ondrej PPA and remi installs always go to CHECK MANUALLY (`distro-vendor`). Check your vendor's security tracker.

### How do I run it across a GitHub org?

Run `npx php2shell-repo-audit --org your-org --markdown > php2shell.md` for a short summary to paste into an incident channel. It reads each repo's default branch with a token from `GH_TOKEN`, `GITHUB_TOKEN` or `gh auth token`, skips forks unless you pass `--include-forks`, and waits out GitHub's rate limits. It only sees repos the token can read. Private repos outside the token's access are not listed, so check the repo count it prints against what you expect. It does not read archived repos, other branches or deployed tags. A service built from any of those is not in the summary, so treat the list as a starting point, not the whole estate.

### How do I run a php2shell check in GitHub Actions?

php2shell-repo-audit ships a GitHub Action: add `uses: Amsozzer1/php2shell-repo-audit@v0.1.0` after `actions/checkout`, or pin to the full commit SHA of the v0.1.0 tag. The Action writes the findings to the job summary and fails on exit code 1 (ACTION REQUIRED), 3 (a manual check is needed, a file was skipped, or no production runtime is declared) and 4 (no PHP found), and on 2 if the tool itself errors (see Exit codes). A passing job means only that nothing this repo declares needs action or a manual check. It says nothing about the images or servers you actually run. With `fail-on: action`, exit code 3 passes too. That covers manual checks, skipped files and a repo with no production runtime declared, so the job can be green while no runtime has been verified at all.

### How is this different from grep or host-side php2shell checkers?

Host-side checkers inspect servers, SSH hosts and pulled images; php2shell-repo-audit reads the repo before deploy and needs no server access. On 4 held-out public repos with 42 declarations I labeled by hand, the tool found 36 and `grep -rnE "FROM +php:"` found 16. That is a small set, labeled by one person, and recall only covers the file types the labels covered; the 6 misses were fixed after that single run. The tool also sorts what it finds: 111 of the 112 declarations labeled across all 10 corpus repos can't prove which PHP build runs, so most land in CHECK MANUALLY with a reason. Method and runs: [`results/numbers.md`](https://github.com/Amsozzer1/php2shell-repo-audit/blob/main/results/numbers.md).

### What output formats does it support?

php2shell-repo-audit prints plain text, JSON (`--json`) and Markdown (`--markdown`, also `--summary`). With `--org`, `--markdown` prints a short summary for an incident channel. The GitHub Action adds the Markdown summary to the job summary.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Nothing needs action or a manual check in what this repo declares, and at least one production runtime is declared. This is not a statement about your servers. |
| 1 | Something is ACTION REQUIRED |
| 3 | Something needs a manual check, a candidate file was skipped, or no production runtime is declared |
| 4 | No PHP declarations found: the tool couldn't see your runtime |
| 2 | Error |

A composer constraint alone doesn't keep the check at 3 when the repo also declares a production runtime. With `--org`, repos that declare no PHP are listed and don't change the exit code; 4 means no repo declares PHP. The Action fails on 1, 3 and 4 by default; `fail-on: action` turns 3 into a pass, and 4 always fails. Flags: `--json`, `--markdown` (also `--summary`), `--offline`, `--fixes <file>`. Set `NO_COLOR` to turn colour off. In a terminal narrower than 100 columns the text output switches to a compact layout (declared line, then file, line and reason); `--json` has the full messages.

## JSON output

`--json` prints one object. The shape is stable within 0.x: `schemaVersion` is 1, fields may be added, and a field is only renamed or removed with a new `schemaVersion`. With `--org`, the same finding objects are grouped under `repos[]`.

<!-- json:start -->
Real output for `examples/demo-repo` with the fix table in this repo (`--offline`), with `findings` trimmed to 2 of 7:

```json
{
  "schemaVersion": 1,
  "tool": "php2shell-repo-audit",
  "version": "0.1.0",
  "fixTable": {
    "origin": "bundled",
    "revision": 1,
    "status": "pending",
    "publishedAt": null,
    "source": "https://www.php.net/archive/2026.php"
  },
  "warnings": [],
  "counts": {
    "actionRequired": 1,
    "checkManually": 6,
    "declaredFixed": 0
  },
  "exitCode": 1,
  "exitReason": "action required",
  "filesRead": 7,
  "skipped": [],
  "runtimeCheck": "docker run --rm --entrypoint php <image> -r 'echo PHP_VERSION;'",
  "findings": [
    {
      "bucket": "manual",
      "reason": "floating-rebuild",
      "file": ".github/workflows/ci.yml",
      "line": 10,
      "context": "ci",
      "kind": "setup-php",
      "declared": "setup-php 8.3",
      "version": "8.3",
      "branch": "8.3",
      "message": "setup-php installs the current or pre-installed 8.3 patch, not a pinned build",
      "fix": "After the release, rebuild with `docker build --pull .` and redeploy, or re-run the CI job for setup-php. Then confirm with `docker run --rm --entrypoint php <image> -r 'echo PHP_VERSION;'`."
    },
    {
      "bucket": "manual",
      "reason": "pending-fix",
      "file": ".tool-versions",
      "line": 2,
      "context": "dev",
      "kind": "tool-versions",
      "declared": "php 8.4.20",
      "version": "8.4.20",
      "branch": "8.4",
      "message": "php.net has not published the fixed 8.4 version",
      "fix": "php.net has no fixed version in the table for this branch yet. Re-run after the advisory; if the pin is below the fix, change it."
    }
  ]
}
```

| Field | Meaning |
|---|---|
| `schemaVersion` | Shape version of this output, currently 1 |
| `tool`, `version` | Tool name and version |
| `fixTable` | The fix table used: `origin` (remote, bundled or file), `revision`, `status` (pending or published), `publishedAt`, `source` (php.net advisory URL) |
| `warnings` | Problems loading the remote fix table, if any |
| `counts` | `actionRequired`, `checkManually`, `declaredFixed` |
| `exitCode`, `exitReason` | The process exit code and why (see Exit codes) |
| `filesRead` | Candidate files read |
| `skipped` | Candidate files skipped (too big or unreadable) |
| `runtimeCheck` | The `docker run` command that shows the real PHP version of an image |
| `findings[]` | One object per declaration |
| `findings[].bucket` | `action`, `manual` or `fixed` (DECLARED ≥ FIXED) |
| `findings[].reason` | Reason code (see What to do for each finding) |
| `findings[].file`, `.line` | Where the declaration is, relative to the scanned folder |
| `findings[].context` | `prod`, `ci` or `dev`, guessed from the path |
| `findings[].kind` | Declaration kind, e.g. `official-image`, `setup-php`, `distro`, `composer` |
| `findings[].declared` | The declaration as written, shortened |
| `findings[].version` | The version string as declared, or null |
| `findings[].branch` | PHP branch, e.g. `8.3`, or null |
| `findings[].message` | Why it landed in this bucket |
| `findings[].fix` | What to do about it |
<!-- json:end -->

## Build and test from a clean clone

```sh
# requirements: Node 20+, git
git clone https://github.com/Amsozzer1/php2shell-repo-audit && cd php2shell-repo-audit
npm ci                                   # also builds dist/
npm test                                 # unit, fixture and end-to-end tests
node dist/src/cli.js examples/demo-repo  # the demo

# reproduce the corpus numbers
./scripts/fetch-corpus.sh                # clones the 10 repos at their pinned SHAs into .corpus/ (gitignored)
node scripts/measure.mjs --fixes fixes/fixes.json
```

The corpus repos are cloned, not committed. Their licenses are listed in `results/corpus.json`; three are AGPL-3.0 or GPL-2.0, which is why they are fetched by script.

## Named assumptions

- An exact patch version in an official `php:` image tag is the PHP version in that image. The docker-library images are built from source at that version.
- asdf installs the exact version in `.tool-versions`. Other tools that read `.php-version` (setup-php, Symfony CLI, Herd) use whatever patch is installed, so `.php-version` is treated as floating.
- setup-php installs the current or pre-installed patch for a branch, whatever the `php-version` input says.
- The fix table is filled by hand from php.net's advisory and cross-checked against php.net's per-branch release data (`scripts/check-fixes.mjs`).

## Honest limits

- It reads declarations, not runtimes. DECLARED ≥ FIXED always means "runtime not verified".
- YAML and Dockerfiles are read with line-based rules, not full parsers. Anchors, `extends:`, `include:` and values computed at run time are not followed, and come out as `unresolved` or not at all.
- The corpus is 10 repos, labeled by one person (me). The held-out set is 4 repos and 42 labels, which is small.
- Context (prod, ci, dev) is a guess from the file path. A compose file used only on laptops is still marked prod.
- `--org` reads default branches only, and only the files the GitHub trees API lists. For very large repos the API truncates that list; the repo is then reported as not fully read. Requests are sequential, so a large org takes a while.
- The demo repo is synthetic. The test fix tables in `test/fixtures/` are hypothetical (X.Y.97 to X.Y.99) and exist only for tests.

## What I'd do next

- An `inspect <image>` command that runs `php` inside an image and checks for distro packages, so the real runtime can be checked in CI.
- Detectors for Platform.sh, Upsun, DDEV, Vapor, Bref and App Engine config files.
- SARIF output for the GitHub Security tab.
- Parallel requests for `--org`, within the rate limits.
- An accept file for findings someone has already checked by hand.

## License

MIT
