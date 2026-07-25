#!/usr/bin/env bash
# publish.sh — push Knife Kingdom to GitHub Pages.
# Usage:
#   GITHUB_TOKEN=ghp_xxx GITHUB_USER=yourname REPO=knifekingdom ./publish.sh
# Token needs: classic PAT with "repo" + "workflow" scopes, OR a fine-grained
# token with Contents:read/write and Pages:read/write for the target repo.
set -euo pipefail

: "${GITHUB_TOKEN:?set GITHUB_TOKEN}" 
: "${GITHUB_USER:?set GITHUB_USER}"
REPO="${REPO:-knifekingdom}"
PRIVATE="${PRIVATE:-false}"
DIR="$(cd "$(dirname "$0")" && pwd)"

echo "==> Repo: github.com/${GITHUB_USER}/${REPO}"

# 1) Ensure repo exists (ignore if it already does)
echo "-- creating repo (if needed) --"
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  -H "Authorization: Bearer ${GITHUB_TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  -d "{\"name\":\"${REPO}\",\"description\":\"Knife Kingdom - a top-down MM2-style browser game\",\"homepage\":\"https://${GITHUB_USER}.github.io/${REPO}/\",\"private\":${PRIVATE},\"auto_init\":false}" \
  https://api.github.com/user/repos || true

# 2) Add remote (with token, stripped later)
cd "$DIR"
git remote remove origin 2>/dev/null || true
git remote add origin "https://${GITHUB_TOKEN}@github.com/${GITHUB_USER}/${REPO}.git"

# 3) Push
echo "-- pushing main --"
git push -u origin main

# 4) Strip token from stored remote (security)
git remote set-url origin "https://github.com/${GITHUB_USER}/${REPO}.git"
echo "-- token removed from local remote --"

# 5) Enable GitHub Pages on main branch / root
echo "-- enabling GitHub Pages --"
PAGES_RESP=$(curl -s -X POST \
  -H "Authorization: Bearer ${GITHUB_TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  -d '{"source":{"branch":"main","path":"/"}}' \
  "https://api.github.com/repos/${GITHUB_USER}/${REPO}/pages")
echo "$PAGES_RESP" | grep -o '"html_url":"[^"]*"' | head -1 || echo "(Pages enable may need 'Pages' scope; enable in Settings > Pages manually)"

echo ""
echo "DONE. Site should be live at: https://${GITHUB_USER}.github.io/${REPO}/"
echo "(GitHub Pages can take 1-2 min to build on first publish.)"
