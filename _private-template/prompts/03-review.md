# 03 · Founder-eye review

Paste into a fresh Claude session (not the one that built it), so the work isn't grading itself.

---

Review this repo the way the founder in `.private/company.md` would after clicking the link from my email. Clone it fresh from GitHub, don't use the local copy, and report ready / not ready with only the fixes that matter.

Check:
- **Runs:** build and tests pass from a clean clone; CI is green on GitHub. If a download is blocked, work around it rather than skipping the check.
- **README, top to bottom:** problem and money shot near the top; results table with a baseline and where it was measured; named assumptions; honest limits; what's next.
- **No placeholders:** "TBD", "to run", empty rows or cells anywhere public.
- **Their language:** does the README use the company's own vocabulary for the problem (from `company.md`) without naming them? Is anything obviously naive about their domain?
- **Leaks:** grep for the words-to-avoid list, my employer and client names.
- **Numbers:** every README number traces to `results/numbers.md` and a committed script.
- **Live demo** (if any): loads; note cold-start time.
- **History and identity:** commit author consistent ("Ahmed M. Sozzer"); every commit links to the GitHub account Amsozzer1 on GitHub (not shown as an unlinked name), and the repo lists Amsozzer1 as a contributor; note if all commits are from one day; note any Co-Authored-By lines.
- **Credit:** the README byline names me and links to amsozzer.com.
- **Unpushed work:** compare local and remote before calling anything missing.
