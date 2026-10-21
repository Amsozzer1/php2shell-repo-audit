# PRD: php2shell-repo-audit

A CLI and GitHub Action that lists the PHP versions a repo declares and sorts them by what needs the php2shell fix (CVE-2026-109618, CVE-2026-109619). Built for PHP's fix release on 21 Oct 2026.

## Problem

On fix day, teams that keep their setup in git need to know which repos and images run a PHP that needs the update. The usual first step, `grep "FROM php:"`, finds some Dockerfile lines and misses CI versions, version files, distro packages and images that bundle PHP. It also can't say which lines matter: a floating tag is only fixed after a rebuild, a distro package can be patched without its version changing, and a composer constraint isn't a runtime. The php2shell tools that existed checked servers; none read the repo.

**Users:** Laravel, WordPress, Symfony and Drupal shops, agencies with many client repos, and platform teams running PHP in Docker.

## Goals

- Find the PHP version declarations in a repo, a GitHub repo or a whole GitHub org.
- Sort each one into ACTION REQUIRED, CHECK MANUALLY or DECLARED ≥ FIXED, with a reason code and a step to take.
- Never say a repo is fine. A version in git is not the runtime in production.
- Work as `npx` with no runtime dependencies, as a GitHub Action, and as JSON for scripts.

## Non-goals

Checking running servers, testing for the bug, detecting distro backports, changing any file, and reading Helm, Kustomize or PaaS config.

## What it reads

| Source | Examples |
|---|---|
| Dockerfiles and Containerfiles | `FROM php:8.3-fpm`, ARG defaults, multi-stage builds, digests, apt/apk/dnf/yum/pacman installs, ondrej PPA, remi |
| YAML | compose, Kubernetes and CI image lines, GitLab `image: name:`, Laravel Sail runtimes |
| CI | setup-php `php-version`, including matrices, `env:` values and reusable-workflow inputs |
| Version files | `.php-version`, `.tool-versions` |
| composer.json | `require.php`, `config.platform.php` |
| Images that bundle PHP | wordpress, drupal, nextcloud, frankenphp, bitnami, serversideup and similar |

## Verdicts

| Bucket | When |
|---|---|
| ACTION REQUIRED | EOL branch (5.x, 7.x, 8.0, 8.1); an exact pin below the fix; a declared pre-release below the fix |
| DECLARED ≥ FIXED | An exact official image tag or `.tool-versions` pin at or above the fix. Always "runtime not verified" |
| CHECK MANUALLY | Everything that can't prove the runtime: floating tags, setup-php, `.php-version`, distro packages, Sail, third-party images, ARG defaults, digests, composer constraints, unresolved variables, unknown branches, branches with no fixed version yet |

- EOL findings name php.net's source backport branch where one exists (7.4, 8.0, 8.1).
- CI and dev findings say they are lower exposure than a web-serving runtime. The bucket doesn't change.
- Every finding carries a `fix` string: the step to take for its reason code.

## Exit codes

`0` nothing needs action or a manual check in what the repo declares, and a production runtime is declared; `1` something is ACTION REQUIRED; `3` something needs a manual check, a candidate file was skipped, or no production runtime is declared; `4` no PHP declarations found; `2` error. The Action fails on 1, 3 and 4 by default.

## Fix table

`fixes/fixes.json` holds the fixed version per branch, filled from php.net's advisory and checked against php.net's release data before each release. The CLI fetches the current copy from `main` and falls back to the bundled one. A remote copy can only add information: it can't lower or remove a fix, have an older revision, or mark a branch "not affected". Every fixed version must be newer than the builds that shipped before the fix. Release candidates are accepted only on a branch with no final release yet (8.6).

## Interface

- `npx php2shell-repo-audit [path]`, plus `--repo owner/name` and `--org name` through the GitHub API (read-only, rate-limit aware). A token is optional for public repos.
- `--check-upstream`: asks Docker Hub whether a floating official tag has been rebuilt with the fix. The finding stays in CHECK MANUALLY.
- `--json` (schemaVersion 1), `--markdown` (job summary, or an incident-channel summary with `--org`), `--offline`, `--fixes <file>`.
- Composite GitHub Action with `fail-on: manual | action` and a job summary.

## Measurement

10 public repos pinned to commits, with declarations labeled line by line before the tool ran on each one.

| | This tool | `grep -rnE "FROM +php:"` |
|---|---|---|
| Held-out recall (4 repos, measured once) | 36 / 42, 1 false positive | 16 / 42 |
| First-run recall on the other 6 repos | 58 / 69, 3 false positives | 31 / 69 |
| Firm "vulnerable" or "fixed" verdicts on sources that can't prove the runtime | 0 of 95 (by design) | 95 of 95 (naive version compare) |

111 of the 112 labeled declarations can't prove which PHP build runs. Method and raw output: `results/numbers.md`.

## Release

`scripts/release.sh <version>`: tests, the php.net cross-check, version bump, re-measurement, regenerated README blocks and `llms.txt` (the release fails if any pre-release wording is left), commit, tag, push and a GitHub Release. The tag push publishes to npm through trusted publishing with provenance.

## Later

SARIF output, an `inspect <image>` command, PaaS detectors, `mise.toml`, an accept file for checked findings, and `.env` and compose `extends:` resolution.
