#!/usr/bin/env bash
# setup.sh — Compute SRI hashes + update index.html in-place
# Usage:
#   ./setup.sh                    # auto-detect all (content-hash version)
#   ./setup.sh user repo          # specify user + repo
#   ./setup.sh user repo v1.0.0   # explicit version/tag

set -euo pipefail

# ============ AUTO-DETECT ============
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
[ -z "$REPO_ROOT" ] && echo "❌ Not inside a git repo" && exit 1
cd "$REPO_ROOT"

# --- Owner / Repo resolution ---
if [ -n "${1:-}" ]; then
  OWNER="$1"
else
  OWNER="${GITHUB_OWNER:-$(git remote get-url origin 2>/dev/null | sed -n 's|.*[:/]\([^/]*\)/\([^./]*\).*|\1|p' | head -1)}"
  [ -z "$OWNER" ] && OWNER="$(basename "$(dirname "$REPO_ROOT")")"
fi

if [ -n "${2:-}" ]; then
  REPO="$2"
else
  REPO="${GITHUB_REPO:-$(basename "$REPO_ROOT")}"
fi

# --- Version resolution ---
if [ -n "${3:-}" ]; then
  VERSION="$3"
elif [ -n "${SRI_VERSION:-}" ]; then
  VERSION="$SRI_VERSION"
else
  HASH=$(cat css/app.css js/state.js js/ui.js js/scroll.js js/loader.js 2>/dev/null | openssl dgst -sha256 2>/dev/null | awk '{print $NF}' | cut -c1-12)
  if [ -n "$HASH" ]; then
    VERSION="${HASH}"
  else
    VERSION="$(date -u +%Y%m%d%H%M%S)"
  fi
fi

URL_VERSION="${VERSION}"
[[ "${URL_VERSION}" =~ ^v ]] || URL_VERSION="v${VERSION}"

# --- portable sed ---
if [[ "$OSTYPE" == darwin* ]]; then
  sedi() { sed -i '' "$@"; }
else
  sedi() { sed -i "$@"; }
fi

echo "🔐 Owner:   ${OWNER}"
echo "🔐 Repo:    ${REPO}"
echo "🔐 Version: ${VERSION}  (URL: ${URL_VERSION})"

# ============ SRI HASHES ============
ASSETS=("css/app.css" "js/state.js" "js/ui.js" "js/scroll.js" "js/loader.js")
declare -A HASHES

for filepath in "${ASSETS[@]}"; do
  if [ -f "$filepath" ]; then
    hash=$(openssl dgst -sha384 -binary "$filepath" | openssl base64 -A)
    HASHES[$filepath]="sha384-${hash}"
    echo "  ✅ ${filepath} → sha384-${hash:0:20}..."
  else
    HASHES[$filepath]=""
    echo "  ⚠️  ${filepath} not found, skipping"
  fi
done

# ============ UPDATE index.html ============
[ ! -f "index.html" ] && echo "❌ index.html not found" && exit 1
cp index.html index.html.bak

# --- 1. Update window.__APP_CONFIG__ block ---
sedi "/window\.__APP_CONFIG__ = {/,/^};/s|version: '[vV][^']*'|version: '${URL_VERSION}'|" index.html
sedi "/window\.__APP_CONFIG__ = {/,/^};/s|base: '/gh/[^']*'|base: '/gh/${OWNER}/${REPO}@'|" index.html

for jsfile in state.js ui.js scroll.js; do
  val="${HASHES[js/${jsfile}]:-}"
  [ -z "$val" ] && continue
  # Use perl-compatible replacement for safety with special chars
  if [[ "$OSTYPE" == darwin* ]]; then
    sed -i '' "/window\.__APP_CONFIG__ = {/,/^};/s|'${jsfile}': '[a-zA-Z0-9_-]*'|'${jsfile}': '${val}'|" index.html
  else
    sed -i "/window\.__APP_CONFIG__ = {/,/^};/s|'${jsfile}': '[a-zA-Z0-9_-]*'|'${jsfile}': '${val}'|" index.html
  fi
done

# --- 2. Update ALL /gh/owner/repo@version paths globally ---
sedi "s|/gh/[^/]*/[^@]*@[vV][^/\"]*|/gh/${OWNER}/${REPO}@${URL_VERSION}|g" index.html

# --- 3. Update CSS <link> integrity (replace the entire integrity value) ---
CSS_HASH="${HASHES[css/app.css]:-}"
if [ -n "$CSS_HASH" ]; then
  sedi "/app\.css/s|integrity=\"[^\"]*\"|integrity=\"${CSS_HASH}\"|" index.html
fi

# --- 4. Update loader.js integrity — DIRECT PLACEHOLDER REPLACEMENT ---
LOADER_HASH="${HASHES[js/loader.js]:-}"
if [ -n "$LOADER_HASH" ]; then
  sedi "s|sha384-loader-placeholder|${LOADER_HASH}|g" index.html
fi

# ============ DIFF SUMMARY ============
echo ""
echo "  📝 Changes:"
echo "─────────────────────────────────────────────"
if command -v diff &>/dev/null; then
  diff -u index.html.bak index.html | grep '^[+-]' | grep -v '^---\|^+++' | head -40 || true
fi
echo "─────────────────────────────────────────────"
rm -f index.html.bak

echo ""
echo "✅ index.html updated → ${OWNER}/${REPO}@${URL_VERSION}"
echo ""
echo "SRI_OWNER=${OWNER}"
echo "SRI_REPO=${REPO}"
echo "SRI_VERSION=${URL_VERSION}"
