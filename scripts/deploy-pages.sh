#!/bin/bash
# Publish the page to GitHub Pages: build the full-document site and commit it on top of the
# gh-pages branch (served at https://inny0127.github.io/dyson/). Usage: scripts/deploy-pages.sh
set -euo pipefail
cd "$(dirname "$0")/.."
REMOTE=$(git remote get-url origin)
SRC=$(git rev-parse --short HEAD)
TMP=$(mktemp -d)
git clone -q --branch gh-pages --single-branch "$REMOTE" "$TMP/site"
find "$TMP/site" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
node scripts/build-artifact.mjs "$TMP/build" --site > /dev/null
cp -a "$TMP/build/." "$TMP/site/"
cd "$TMP/site"
git add -A
if git diff --cached --quiet; then echo "gh-pages already up to date"; exit 0; fi
git commit -q -m "Site: built from $SRC"
git push -q origin gh-pages
echo "deployed $SRC to gh-pages"
