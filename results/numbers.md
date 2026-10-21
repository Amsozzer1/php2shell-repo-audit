# Numbers

Every number that appears in the README, and where it comes from. All measurements are deterministic (no randomness), single run each, on 10 public repos pinned to commit SHAs in `results/corpus.json`, labeled by hand in `results/labels.json`. The scripts always run offline with an explicit fix table.

| Number | What it measures | Single run or aggregate | Runs | Produced by | Raw output |
|---|---|---|---|---|---|
| 36 / 42 (86%), 1 false positive | Held-out recall of this tool: labeled declarations found in 4 repos measured once, after the tuning-set fixes and before any held-out fixes | Aggregate over 4 repos, single run | 1 | `node scripts/measure.mjs --fixes test/fixtures/fixes.hypothetical.json --out results/runs/3-held-out` | `results/runs/3-held-out/recall.json` (`bySet.held-out`) |
| 16 / 42 (38%), 0 false positives | Held-out recall of `grep -rnE "FROM +php:"` | Aggregate over 4 repos, single run | 1 | same | same |
| 58 / 69 (84%), 3 false positives | Tuning-set recall of this tool on its first run against the corpus | Aggregate over 6 repos, single run | 1 | `node scripts/measure.mjs --fixes test/fixtures/fixes.hypothetical.json --out results/runs/1-first-run` (code at commit `ea7c0bb`) | `results/runs/1-first-run/recall.json` |
| 31 / 69 (45%), 0 false positives | Tuning-set recall of grep on the same run | Aggregate over 6 repos, single run | 1 | same | same |
| 70 / 70 | Tuning-set recall after fixing the gaps the first run found. Not in the README table, because it was tuned on these repos | Aggregate over 6 repos, single run | 1 | `--out results/runs/2-after-fixes` | `results/runs/2-after-fixes/recall.json` |
| 111 of 112 | Labeled declarations whose source can't prove which PHP build runs. Computed from the labels only, not from tool output | Aggregate over 10 repos | 1 | `scripts/measure.mjs` (`cantProveRuntime`) | `results/runs/3-held-out/firm-verdicts.json` |
| 30 | Tool findings on lines the labeling grep didn't show (all `nextcloud:*` images in one repo). Checked by hand: each is an image that bundles PHP. Not counted as false positives or as hits | Aggregate | 1 | `scripts/measure.mjs` (`outsideLabelingGrep`) | `results/runs/3-held-out/recall.json` |

The recall numbers don't depend on the fix table. The verdict numbers (unverifiable firm verdicts, EOL findings) are only published from the run on php.net's real table; the runs in `results/runs/` used a hypothetical table and their verdict counts are dry runs.

Labeling notes: one label (`monicahq/monica docker-compose.yml:4`, a Sail runtime) was added after the first run, because the labeling grep used for that repo didn't include `sail/runtimes` yet. It is recorded under `corrections` in `results/labels.json`.
