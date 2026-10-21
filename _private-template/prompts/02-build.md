# 02 · Build

Paste into Claude Code once the PRD has converged.

---

Build the project in `.private/PRD.md`, milestone by milestone, starting with M0. Follow `CLAUDE.md`.

- Fill in the commands section of `CLAUDE.md` as soon as they exist.
- After each milestone: run its acceptance check, commit, push, and confirm CI is green before moving on.
- Measure the numbers the PRD lists with committed scripts, save raw output in `results/`, and fill `results/numbers.md` (single run or aggregate, how many runs).
- Record `docs/demo.gif` of the money shot.
- If a measurement contradicts the plan, keep the measurement, change the design, and write down what happened in `docs/design-notes.md`. "The first run failed" is worth keeping in the README.
- Before the last push: grep tracked files for every word in the words-to-avoid list in `.private/company.md`, and for my employer and client names. Report what you checked.

When done, tell me: milestones finished, the final numbers vs baseline, anything cut, and anything left as a placeholder (there shouldn't be any).
