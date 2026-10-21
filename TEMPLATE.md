# Spec-work project template

Starting point for a project built for one company and sent to its founder. `setup.sh` deletes this file.

## Start a new project

1. On GitHub: **Use this template → Create a new repository** (public, named after the project, never the company).
2. Clone it, open in VS Code, run `./setup.sh`. That moves the planning files into `.private/` (gitignored) and removes the template files.
3. Fill in `.private/company.md`, `.private/forbidden.txt` (words the hook blocks) and a rough `.private/PRD.md`.
4. In the repo's GitHub settings, add an Actions variable `FORBIDDEN` with the words to avoid, separated by `|` (e.g. `acme|acmebot|targeting`). CI fails if any appear in tracked files.
5. Run the prompts in order:

| Prompt | What it does |
|---|---|
| `.private/prompts/01-prd-review.md` | Checks the PRD fits the company, role, stack and time budget, then runs a 3-agent debate (max 5 rounds) until it converges |
| `.private/prompts/02-build.md` | Builds milestone by milestone, measures the numbers, records the GIF |
| `.private/prompts/03-review.md` | Fresh-session review as the founder would see it |
| `.private/prompts/04-video.md` | The demo video workflow |
| `.private/prompts/05-send.md` | Numbers check, tracking link, email draft, Notion updates |

## One-time account check

GitHub credits a commit to an account only when the author email is verified on it. The hooks author every commit as `ahmed@amsozzer.com`, so that address must be in GitHub **Settings > Emails** (verified), with "Block command line pushes that expose my email" off. CI's authorship job fails if any commit isn't credited to `Amsozzer1`.

## Guardrails

- `.githooks/commit-msg` strips `Co-Authored-By` / "Generated with" lines and refuses commits not authored by Ahmed M. Sozzer.
- `.githooks/pre-commit` blocks any word in `.private/forbidden.txt`.
- CI re-checks both on GitHub (authorship job and the `FORBIDDEN` leak check), so a commit made without the hooks still fails.

## What's public vs private

| Public (tracked) | Private (`.private/`, gitignored) |
|---|---|
| Code, `README.md`, `CLAUDE.md`, `docs/`, `results/`, CI | `company.md`, `forbidden.txt`, `PRD.md`, `prd-rounds/`, `prompts/` |

Nothing in the public repo names the company or says it was built for them. The email does that.
