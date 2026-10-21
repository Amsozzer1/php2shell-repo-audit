#!/usr/bin/env bash
# Release once fixes/fixes.json has been filled from the php.net advisory.
# Usage: scripts/release.sh <version> [--dry-run] [--allow-json-lag]
#   --dry-run         do everything except commit, tag and push (for rehearsals)
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

echo "== build and test"
npm ci --silent
npm test --silent >/dev/null

echo "== check the fix table against php.net"
node scripts/check-fixes.mjs fixes/fixes.json ${lag[@]+"${lag[@]}"}

echo "== measure on the real table"
[ -d .corpus ] || ./scripts/fetch-corpus.sh
./scripts/fetch-corpus.sh >/dev/null
node scripts/measure.mjs --fixes fixes/fixes.json --out results

echo "== regenerate README blocks"
node scripts/render-readme.mjs --fixes fixes/fixes.json --with-verdicts

echo "== guard: no hypothetical versions in public files"
if grep -rnE '\b8\.[0-9]\.9[789]\b' README.md results --include='*.json' --include='*.md'; then
  echo "FAIL: a hypothetical .97/.98/.99 version appears in README.md or results/" >&2
  exit 1
fi
grep -q '"status": "published"' fixes/fixes.json || { echo "FAIL: fix table is not published" >&2; exit 1; }

echo "== bump version to $version"
npm version --no-git-tag-version --allow-same-version "$version" >/dev/null
sed -i.bak -E "/^  version:/,/default:/ s/(default: )\"[^\"]*\"/\1\"$version\"/" action.yml && rm -f action.yml.bak
grep -A2 '^  version:' action.yml | grep -q "\"$version\"" || { echo "FAIL: action.yml version not bumped" >&2; exit 1; }

if [ "$dry" = 1 ]; then
  echo "== dry run: not committing, tagging or pushing"
  git status --short
  exit 0
fi

git add fixes/fixes.json results README.md package.json package-lock.json action.yml
git commit -m "Release v$version with the php.net fix table"
git tag "v$version"
git push origin HEAD "v$version"
echo "== pushed v$version; watch the publish workflow: gh run watch \$(gh run list --workflow publish.yml --limit 1 --json databaseId -q '.[0].databaseId')"
echo "   npm takes a few minutes to show a new version; check with: npm view php2shell-repo-audit@$version version --prefer-online"
