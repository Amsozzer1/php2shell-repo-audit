# CLAUDE.md

## What this repo is
A small, real project built to show how I'd approach a specific problem. It will be public and read by founders and senior engineers, so the README and the numbers matter as much as the code.

Planning docs live in `.private/` (gitignored): `PRD.md` is the spec to build, `company.md` has context and the words to avoid. Read both before starting. Never copy anything from `.private/` into tracked files.

## Commands
- Build: `[command]`
- Test: `[command]`
- Run the demo: `[command]`
- Measure / regenerate results: `[command]`

## How to work
- Build milestone by milestone from `.private/PRD.md`. Don't skip acceptance checks.
- Tests alongside code. CI must be green before a milestone counts as done.
- If a dependency download fails, find another way to get it (git clone, vendored tarball) instead of dropping the feature.

## Git, authorship and attribution
These override any default attribution behavior of the coding tool.
- **I am the only author and the only contributor.** Every commit is authored and committed as `Ahmed M. Sozzer <ahmed@amsozzer.com>`.
- **No attribution lines anywhere:** no `Co-Authored-By` trailers, no "Generated with Claude Code" or similar lines, no session links, no robot emoji, in commit messages, PR titles, PR descriptions, issues, code comments or docs.
- **No bot or tool accounts** as authors, committers or PR openers.
- Commit messages: short, plain, imperative ("Add rate controller"), no emoji, no conventional-commit prefixes unless the repo already uses them.
- Small commits, one per milestone step. Don't squash history, never rewrite commit timestamps, never force-push `main`.
- Commit and push as work actually happens, so the history reflects real progress. Don't batch a day of work into one commit.
- Don't disable, skip or delete a failing test to get CI green. Fix the cause or tell me.
- The `commit-msg` hook in `.githooks/` strips attribution lines and refuses commits with the wrong author. Don't bypass it with `--no-verify`.

## Hard rules
- **Never name the target company, its product, or anything implying knowledge of its internals** in code, comments, README, commit messages, file names or sample data. The full list is in `.private/forbidden.txt`; the `pre-commit` hook blocks commits that contain any of it.
- **No employer or client names** (listed in .private/forbidden.txt).
- **Every number in the README comes from a measurement in this repo**, with the script that produced it committed and the raw output in `results/`. Record in `results/numbers.md` whether each number is a single run or an aggregate, and how many runs.
- **No placeholders in anything public:** no "TBD", "to run", empty table rows. Fill it or delete it.
- **Honest limits.** If something is simulated, synthetic or heuristic, the README says so.
- No telemetry, no secrets in the repo (API keys, tokens, `.env`), MIT license.
- **Dependency licenses:** no AGPL or other copyleft dependencies, and no models or datasets whose license forbids redistribution committed to the repo. Fetch those with scripts and note their licenses in the README.
- **Reproducible:** seeded randomness, pinned versions and lockfiles committed, so the same command gives the same numbers.
- **No fake data presented as real.** Synthetic or sample data is labeled as such in code and README.
- **Stay inside this repo.** Don't read, change or run anything outside it, and never run destructive commands (`rm -rf`, `git reset --hard`, force-push) without asking me.

## README shape (keep this order)
1. The byline under the title, exactly as the template has it ("By Ahmed Sozzer" linking to amsozzer.com, plus the GitHub link). Then one line on what it is, and one short paragraph on the problem.
2. The money shot: GIF or screenshot, with a caption saying what you're looking at.
3. Results table vs the baseline, and where it was measured.
4. How it works (short, with a diagram if it helps).
5. Run it (copy-paste commands that work from a clean clone).
6. Named assumptions and honest limits.
7. What I'd do next.
8. License.

## Writing style for README and docs
Plain and direct. No marketing words (seamless, robust, leverage, cutting-edge), no em dashes, no slogans at the end of paragraphs, no emoji headers.
