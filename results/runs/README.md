# Measurement runs, in order

All four runs used `test/fixtures/fixes.hypothetical.json`, a made-up table (X.Y.99 fixed versions) that exists only so the scripts can run before php.net publishes. Recall and false positives don't depend on the table. The verdict counts in these runs are dry runs and are not published; the published verdict numbers come from the run on the real table.

| Run | What changed before it | Tuning set (6 repos, 70 labels) | Held-out set (4 repos, 42 labels) |
|---|---|---|---|
| `1-first-run` | Nothing. First time the tool saw the corpus (69 labels at the time) | tool 58/69, 3 false positives | not labeled yet |
| `2-after-fixes` | Detector fixes for the gaps run 1 found; one label added that the labeling pass missed (see `corrections` in `labels.json`) | tool 70/70, 0 false positives | not labeled yet |
| `3-held-out` | Held-out repos labeled, then measured once with no changes | tool 70/70 | **tool 36/42, 1 false positive** |
| `4-after-held-out-fixes` | Fixes for the 6 held-out misses | tool 70/70 | tool 42/42 (no longer held out) |

grep (`grep -rnE "FROM +php:"`) found 31/70 and 16/42 in every run, with 0 false positives.
