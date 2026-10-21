#!/usr/bin/env bash
# One-time setup for a new spec-work project made from this template.
# Moves the planning files into .private/ (gitignored), sets the commit author,
# and removes the template-only files.
set -euo pipefail
cd "$(dirname "$0")"

if [ -d .private ]; then echo ".private/ already exists; setup has run."; exit 1; fi
mv _private-template .private
mkdir -p .private/prd-rounds

git config user.name "Ahmed M. Sozzer"
git config user.email "ahmed@amsozzer.com"
git config core.hooksPath .githooks

rm -f TEMPLATE.md setup.sh
git add -A
git commit -qm "Start from spec-work template"
echo "Done. Hooks are on. Fill in .private/company.md, .private/forbidden.txt and .private/PRD.md, then run .private/prompts/01-prd-review.md in Claude Code."
