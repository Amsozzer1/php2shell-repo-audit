#!/usr/bin/env bash
# Release once fixes/fixes.json has been filled from the php.net advisory
# (status "published", revision bumped, "source" set to the advisory URL).
# Usage: scripts/release.sh <version> [--dry-run] [--allow-json-lag]
#   --dry-run         do everything except commit, tag, push and the GitHub Release (for rehearsals)
#   --allow-json-lag  passed to check-fixes.mjs; only with the advisory URL in the commit message
set -euo pipefail
cd "$(dirname "$0")/.."

version="${1:?usage: scripts/release.sh <version> [--dry-run] [--allow-json-lag]}"
dry=0; lag=()
for a in "${@:2}"; do
  case "$a" in
    --dry-run) dry=1 ;;
    --allow-json-lag) lag=(--allow-json-lag) ;;
    *) echo "unknown option $a" >&2; exit 2 ;;
  esac
done

grep -q '"status": "published"' fixes/fixes.json || { echo "FAIL: fix table is not published" >&2; exit 1; }

echo "== build and test"
npm ci --silent
npm test --silent >/dev/null

echo "== check the fix table against php.net"
node scripts/check-fixes.mjs fixes/fixes.json ${lag[@]+"${lag[@]}"}

echo "== bump version to $version"
npm version --no-git-tag-version --allow-same-version "$version" >/dev/null
sed -i.bak -E "/^  version:/,/default:/ s/(default: )\"[^\"]*\"/\1\"$version\"/" action.yml && rm -f action.yml.bak
grep -A2 '^  version:' action.yml | grep -q "\"$version\"" || { echo "FAIL: action.yml version not bumped" >&2; exit 1; }

echo "== measure on the real table"
./scripts/fetch-corpus.sh >/dev/null
node scripts/measure.mjs --fixes fixes/fixes.json --out results

echo "== regenerate README blocks and llms.txt, and check for leftover pre-release wording"
node scripts/render-docs.mjs --with-verdicts --check

echo "== guard: no hypothetical versions in public files"
if grep -rnE '\b8\.[0-9]\.9[789]\b' README.md llms.txt results --include='*.json' --include='*.md' --include='*.txt'; then
  echo "FAIL: a hypothetical .97/.98/.99 version appears in README.md, llms.txt or results/" >&2
  exit 1
fi

notes="$(mktemp)"
node scripts/release-notes.mjs "$version" > "$notes"

if [ "$dry" = 1 ]; then
  echo "== dry run: not committing, tagging, pushing or creating the GitHub Release"
  echo "-- release notes:"; cat "$notes"
  git status --short
  exit 0
fi

git add fixes/fixes.json results README.md llms.txt package.json package-lock.json action.yml
git commit -m "Release v$version with the php.net fix table"
git tag "v$version"
node scripts/release-notes.mjs "$version" > "$notes" # again, so the pinned SHA is the tagged commit
git push origin HEAD "v$version"

echo "== GitHub Release v$version"
gh release create "v$version" --verify-tag \
  --title "v$version: php2shell (CVE-2026-109618, CVE-2026-109619) fix table from php.net" \
  --notes-file "$notes"
rm -f "$notes"

echo "== pushed v$version; watch the publish workflow: gh run watch \$(gh run list --workflow publish.yml --limit 1 --json databaseId -q '.[0].databaseId')"
echo "   npm takes a few minutes to show a new version; check with: npm view php2shell-repo-audit@$version version --prefer-online"
echo "   Marketplace: edit the v$version release on GitHub and tick 'Publish this Action to the GitHub Marketplace'."
