# Demo video workflow: reusable prompt

Paste everything below the line into a new session, and fill in the brackets first.

---

I'm applying to a company with a project I built, and I want a short video about it: my face in the corner, demo footage and visuals in the main area, captions, and my own voiceover. Work with me in four phases, in order. Don't skip ahead: each phase ends when I say so.

## Inputs

- **Project:** [path to the repo or folder]
- **Company and role:** [company name, role title, link to the posting if I have one]
- **Target length:** [e.g. 90–120 seconds]
- **Where it'll be shown:** [e.g. LinkedIn, email to the founders, YouTube unlisted]
- **Mode:** [produced (default) or Loom: see "Loom mode" below]
- **Words to avoid for this company:** [e.g. "targeting", "weapon", their product's name, anything that implies I know their internals. Leave blank if none.]
- **My profile file:** [path to my profile file, e.g. `footage/profile.md`. If it doesn't exist yet, create it in Phase 3 from my answers.]
- **Previous run's tools:** [default `footage/tools`. Reuse and adapt those scripts rather than starting over.]

## Ground rules (all phases)

- **Never invent a number, a result or a fact about me or the company.** Every number on screen or in the script comes from something measured in the project (logs, test output, benchmark files) or something I told you. If the project has no measured results, tell me and help me measure them first.
- **Every number has one source, and the source is labelled.** For each number, record whether it's from a single demo run or an aggregate measurement (median, p95, over how many runs). On screen, label single-run numbers "in this run" and aggregates "median, measured" (or whatever they actually are). Keep a `numbers.md` table: number, where it's said or shown, source file, single run or aggregate.
- **The video, README and outreach email must agree.** Before Phase 4 is done, check every number in the video against the project README and the email or message I'm sending with it. If two numbers describe different things (a demo run vs a median), both need labels so they don't look like a contradiction. Flag anything that doesn't line up.
- **Respect the words-to-avoid list** in the script, on-screen text, captions, cards and file names.
- **Verify what the company does** with a web search before writing any line about them, and show me the sources.
- **Label visuals honestly.** If something is a visualisation rendered from logs after the fact, say so on screen; don't present it as a live capture. If a demo is simulated, the script says so.
- **Show me before you move on.** After producing visual assets, look at frames yourself (contact sheets, extracted stills) and fix what's wrong before telling me it's done: text cut off, labels covering content, unreadable sizes, wrong colours.
- **The script is the only thing I look at.** I read it naturally from practice. I won't watch the screen, follow a cue sheet, point at anything, pause for a visual or hit a mark. Keeping footage, cards, numbers and annotations in sync with my voice is entirely your job, done in the edit from my recording.
- Keep everything reproducible: put scripts in a `tools/` folder, so any change is a rerun, not a redo.
- Keep all video work outside the project's git repo unless I say otherwise.

## Phase 1: Understand the story

1. Read the project: the README, design notes, results, and the code, enough to explain it simply.
2. Tell me in a few sentences:
   - **The problem**, in plain words.
   - **The "money shot":** the single side-by-side or before/after moment that makes the point without narration.
   - **The 2–4 real numbers** that back it up, with where each comes from and whether each is a single run or an aggregate.
3. List the demos you'd record and what each one shows. Wait for my OK.

## Phase 2: Generate the assets

Record real footage of the project running, and build supporting visuals. Aim for far more footage than the final video needs.

- **Demo recordings.** Run the real thing and capture its UI at 1920×1080 / 30 fps (headless Chrome through the DevTools screencast works well for web UIs). Drive any changes from a scripted timeline, and log the timestamp of every change, so you know exactly what happens when. Record the same scenario several ways (e.g. the project vs the obvious baseline) so the clips line up on the same clock.
- **Two versions of every clip:** clean, and captioned (a small label saying what's happening, e.g. which mode or condition is active, in a strip that never covers the content).
- **Composites:** side-by-sides and grids of aligned clips, especially the money shot.
- **Cold open:** a 4–5 second silent clip of the money shot with short on-screen text that makes the point without sound (e.g. "Same bad link. Left: TCP, 25 s behind. Right: Emberlink, live." adapted to the project, using only labelled real numbers). Export its best frame as the **thumbnail**. This is a visual rule only: the script order in Phase 3 doesn't change.
- **Stills** at every key moment.
- **Code cards:** syntax-highlighted images of the 5–9 most important functions, cut from the real source by start/end markers so they always match the code.
- **Terminal recordings** (e.g. with `vhs`): tests passing, the key commands, the results.
- **Charts and a results card** from real data. Use one y-axis per chart, and colour-blind-safe colours. Label every stat as single-run or aggregate.
- **`manifest.json` and `SHOTLIST.md`:** every asset, its duration, and a timestamped list of what happens in it (for my voiceover and for editing).

Before telling me Phase 2 is done, show me the 3–5 best frames and point out anything in them that could mislead.

## Phase 3: Write the script with me

1. **Read my profile file** (name, where I'm based, background, day-to-day stack, what I build outside work, what I like building). If it doesn't exist, ask me those once and save the answers there. Then **ask me only the company-specific questions** (one short message):
   - How I came across the company.
   - Which part of my background to lead with for this role (e.g. embedded for a robotics company, full-stack for a SaaS one).
2. **Write about 150 words per minute of target length**, in this order:
   1. Who I am (2–3 sentences), leading with the background I picked.
   2. How I found the company, what they build, and what the role asks for.
   3. "So instead of just saying I can do that, I built something" (or my own version of that).
   4. **The setup:** explain the situation *before* showing any footage, so the viewer knows what they're looking at.
   5. The money shot, with the real numbers. Say "in this run" for single-run numbers.
   6. How it works, in plain words (3–5 sentences, no jargon a smart non-specialist wouldn't follow).
   7. What it's built with.
   8. Where the code is, and a one-line close.
3. **Deliver it as a plain `.txt`**: only the words I'll read, short lines, blank lines between paragraphs. No cues, stage directions or timing marks of any kind; I won't act on them.
4. **It must sound like me, not like an AI.** Before handing any version over, check it for these and rewrite any you find:
   - Staccato openers ("Same X. Same Y. Same Z.") and short dramatic fragments in a row.
   - Lists of three everywhere, especially triples of adjectives or examples.
   - Colon reveals and slogans ("It comes down to one idea: …").
   - Signposting ("Here's the moment that matters", "Let's break it down", "To be clear…").
   - Every paragraph ending on a quotable line.
   - Generic closers ("Thanks for watching", "The future is bright").
   - "Not just X, it's Y" constructions.
   - Words like crucial, pivotal, seamless, robust, leverage, delve, testament.
   - Em dashes.
   - An even, polished rhythm. Mix short and long sentences; contractions and a few "so" / "basically" are fine.
5. **Fact-check the script before I record.** Check every number and claim in it against `numbers.md` and the README, and check it for words to avoid. Tell me what you checked. This matters most in Loom mode, where the only fix for a wrong number is another take.
6. **Practice reads.** I'll paste speech-to-text transcripts of myself reading it. After each one:
   - Keep the phrasings I reach for naturally; they're better than yours.
   - Fold in facts I add while talking.
   - Correct anything I got wrong (tech names, numbers), and tell me what you corrected.
   - Tell me the new length against the target, and cut if it's over.
   - Don't quote my stumbles back to me.
7. Repeat until I say the script is done.

## Loom mode (optional)

If I chose Loom mode, I record myself in Loom with the demo on screen, and there's no Phase 4 edit. Phases 1–3 still apply in full, including the pre-recording fact check. Also give me:
- The cold-open clip or a still to show in the first seconds of the recording, and the thumbnail.
- A one-page cue sheet: what's on screen for each paragraph of the script, and which window to switch to when.

After I record, I'll paste the Loom transcript. Check it for wrong numbers, unlabelled single-run numbers and words to avoid, and tell me whether I need another take.

## Phase 4: My recording → finished video (produced mode)

When I say my `.mp4` (and maybe a caption file) is in, do this:

1. **Probe the file** (duration, resolution, audio). If I ask for mirroring, mirror it. Then check whether I point left or right anywhere and whether there's text in the frame, because both flip.
2. **Transcribe it locally with word-level timestamps** (e.g. faster-whisper; if its audio decoder errors, load the WAV yourself and pass the raw samples). Don't trust the recording tool's caption file for facts. Where words matter (numbers, names), re-transcribe that window with two or three model sizes and compare.
3. **Report problems before cutting anything:**
   - Anything I said that's factually wrong, especially numbers.
   - Numbers that don't match the README or the outreach email, or that need a "single run" / "median" label.
   - Claims that aren't quite true.
   - Words from the avoid list.
   - Obvious stumbles and repeats.
   - Transcription errors in the captions (names, company, tech terms).
4. **Length gate.** Estimate the edited length (talk after removing slips, plus the cold open and cards) and compare it with the target. If it's more than about 15% over, stop and ask me before building: cut specific lines (name them), speed up nothing, or accept the longer length. Don't mention it only after rendering.

   Then ask one question: **light edit** (only fix errors, stumbles and repeats; keep my ums and natural pauses) or **tight edit** (also remove ums and shorten pauses)? Default to light. Tight edits create a jump cut every few seconds.
5. **Cut from the word timestamps.** If I corrected myself on camera ("60 ms, sorry, 160 ms"), cut the slip and keep my correct version, and only ask me to re-record if the correct words were never said. When the transcriber merges a stumble into one long word, split it with a finer transcription of that window plus the audio energy envelope.
6. **Verify every cut** by re-transcribing the edited audio with at least two model sizes, and fix any cut that clips a word.
7. **Map what I said, not what the script says.** I won't read the script word for word. Align the edited transcript against the final script and list: lines I skipped, lines I reworded, and things I added. Then build an **anchor table** (`sync.md`): every visual event (card in, footage in, number in, highlight, underline, note) with the exact spoken word that triggers it and that word's time on the **edited** timeline. Rules:
   - Anchors come only from my recorded words. Never from script estimates, words-per-minute guesses or the recording tool's caption file.
   - A line I skipped takes its visual with it. Don't show a card or number for something I never said.
   - Something I added keeps the current visual on screen, unless the project already has a real asset for it.
   - On-screen wording follows what I actually said when they differ (e.g. I said "Python and FastAPI sometimes", the card doesn't claim more). If what I said is wrong, it's already flagged in step 3.
   - Recompute every anchor after cuts. Timestamps from the raw recording are wrong after the first cut.
8. **Build the video** (1920×1080, 30 fps, audio normalised to about -16 LUFS):
   - **Cold open:** the 4–5 s silent money-shot clip with its on-screen text.
   - **Opening:** 3–5 s of me full frame with a name lower-third, crossfading into the main layout.
   - **Main area**, about 1440×810, top left, with rounded corners: cards (about me, the company and role, the project title, an end card with the repo link and the real results, labelled single-run or aggregate) and footage. Time each segment from the anchor table. Line up the money shot so its key moment lands on the sentence that describes it, and have the numbers appear as I say them, with their labels.
   - **Visual theme comes from amsozzer.com.** Before building any card, open the site and pull its theme: typefaces, colours, background and grid, the marker highlight, underline, handwritten note and tape marks, and how it spaces things. Every card, lower-third and caption uses that theme, so the video looks like it belongs to the site. Re-check the site each time rather than reusing an old video's tools, since the site may have changed. The site's marks are a vocabulary to pick from, not a quota: the budgets below decide how many appear.
   - **Annotations are for emphasis only.** If everything is marked, nothing stands out. Budgets for the whole video:
     - **Highlight blocks:** at most one per card, and only on cards where one word is the point (the role, the project name, the headline number). Most cards get none. Aim for 4–6 in a 2–3 minute video.
     - **Underlines:** only to connect two things the viewer must link, mainly the stack terms that match the job posting, or a number to its label. At most 2 on a card, never on a card that already has a highlight. Aim for 6 or fewer in the video.
     - **Handwritten notes:** 2–3 in the whole video. Each must add a real fact the card and my voice don't already give (e.g. "now in Microsoft's vcpkg"). Never restate the headline or what I'm saying, never a sign-off like "thanks for watching", never two notes on one card.
     - Before rendering, list every annotation in `sync.md` with why it earns its place, and cut any you can't justify.
   - **Annotation timing:** each one starts drawing on the onset of its anchor word (within about 0.15 s) and finishes within 0.4 s. Card changes land on phrase boundaries, never mid-word, and a card stays up at least 2 s. Nothing advances during a long pause of mine.
   - **Right column:** a chapter list that highlights the current section.
   - **My camera** in the bottom-right corner: a rounded square cropped around my face, with a small name pill.
   - **Captions** under the main area:
     - Clean the full transcript first: fix mis-heard names and terms, and drop ums from the captions even if the audio keeps them.
     - Then align the cleaned words back to the timestamps.
     - Sentence case, at most 2 lines of about 42 characters.
     - Also export an `.srt`, and tell me not to upload it alongside the burned-in captions.
   - **ffmpeg notes:**
     - If this build lacks drawtext or libass, render text as PNG overlays.
     - Newer builds read filter graphs with `-/filter_complex <file>`.
     - Don't `split` one input into branches that stop at different times: render the intro and the layout as separate passes, then crossfade them in a third.
     - Normalise frame rate and timebase before `xfade`.
     - Watch long renders for stalls: output size not growing plus 0% CPU means a deadlock.
9. **QA before handing it over:**
   - **Sync check:** re-transcribe the final rendered audio, find each anchor word's real time, and compare it with when its visual actually appears in the render (detect from frames, don't trust the plan). Add the measured offset to `sync.md` for every event. Anything more than 0.25 s off gets fixed and re-rendered. Also check there's no visual for a line I skipped.
   - **Annotation count:** count highlights, underlines and notes in the render against the budgets above.
   - Pull a contact sheet of frames from every section, including the cold open and thumbnail.
   - Check the crossfade (no doubled captions), labels (not covering footage headlines), cropped terminal and code text, and that the numbers appear at the right moment with their labels.
   - Re-run the numbers check against the README and the outreach email.
   - Measure loudness and report the final length against the target.
   - Then open the file for me.
10. **Iterate.** I'll give feedback like "too many cuts" or "move X". Make the change by adjusting the scripts and re-rendering, re-run the sync check, then tell me the new length and what changed.

## What I'll get at the end

- **The final `.mp4`,** plus the clean `.srt` and the thumbnail.
- **All raw assets,** with `manifest.json`, `SHOTLIST.md`, `numbers.md` and `sync.md` (anchor table with measured offsets and the annotation list).
- **The final script** (`.txt`).
- **The `tools/` folder** that rebuilds everything.
