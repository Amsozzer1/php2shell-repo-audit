#!/usr/bin/env bash
# Clones each corpus repo at its pinned SHA into .corpus/<owner>__<repo> (gitignored).
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .corpus
node -e 'for (const r of require("./results/corpus.json").repos) console.log(r.name + " " + r.sha)' |
while read -r name sha; do
  dir=".corpus/${name/\//__}"
  if [ -d "$dir/.git" ] && [ "$(git -C "$dir" rev-parse HEAD 2>/dev/null)" = "$sha" ]; then
    echo "ok   $name $sha"; continue
  fi
  rm -rf "$dir" && mkdir -p "$dir"
  git -C "$dir" init -q
  git -C "$dir" remote add origin "https://github.com/$name.git"
  git -C "$dir" fetch -q --depth 1 origin "$sha"
  git -C "$dir" checkout -q FETCH_HEAD
  echo "got  $name $sha"
done
