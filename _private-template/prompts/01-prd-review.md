# 01 · PRD review and debate

Paste this into Claude Code at the repo root once `.private/PRD.md` and `.private/company.md` are filled in.

---

I'm applying to a bunch of startups, and to stand out I build a small project that's very close to what each company does, then send it to the founder. The PRD for this one is in `.private/PRD.md`, and what I know about the company is in `.private/company.md`. I haven't read the PRD closely, so treat it as a draft.

**Step 1: check it's worth building.** Read both files and tell me plainly:
- Does the PRD actually match what the company does and what the role asks for? Verify the company with a web search and show me sources.
- Does the tech stack match the role's listed stack?
- Is the scope doable in about a day of Claude Code work (the plan says [2–3 hours / 1 day])? If not, what would you cut?
- Is there a clear "money shot": one side-by-side or before/after that makes the point without narration?
- Are there 2–4 numbers we can actually measure against an obvious baseline?

If any of that fails, stop and tell me before step 2.

**Step 2: try to break it.** Once step 1 checks out, spin up three agents that each read the PRD from a different angle and try to break it:
1. **The founder:** would this make me want to talk to this person? Does it show they understand our problem, or is it a generic demo? Anything that reads as naive about our domain?
2. **The senior engineer:** is the design sound? Will the measurements hold up, is the baseline fair, is anything faked or unmeasurable, what will break in the build?
3. **The scope cutter:** what can be dropped without losing the money shot? What will blow past the time budget? What's gold-plating?

Run them in rounds. Each round, every agent files objections, and a moderator (you) merges the valid ones into a new version of the PRD. Save each round as `.private/prd-rounds/vN.md` with a short list of what changed and why.

**Stopping rule:** stop when all three agents file no new blocking objections, or after 5 rounds, whichever comes first. After round 3, agents may only file objections that would make a claim false, a measurement wrong, or the build fail. Wording and polish go into a "later" list, not a new round.

The converged version becomes `.private/PRD.md`, and that's the PRD we build. Then summarise for me in a few lines: what changed from my draft, the final money shot, the numbers we'll measure, and the time estimate.
