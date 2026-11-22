#!/usr/bin/env bash
# setup.sh — Compute SRI hashes + update index.html in-place
# Usage:
#   ./setup.sh                    # auto-detect owner/repo; content-hash version
#   ./setup.sh user repo          # specify owner + repo
#   ./setup.sh user repo v1.0.0   # specify owner + repo + version
# Does NOT commit or push.

set -euo pipefail

# ============ REPOSITORY ============
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || true)
if [ -z "$REPO_ROOT" ]; then
  echo "❌ Not inside a git repo" >&2
  exit 1
fi
cd "$REPO_ROOT"

# --- Owner / repo resolution ---
if [ -n "${1:-}" ]; then
  OWNER="$1"
else
  OWNER="${GITHUB_OWNER:-$(git remote get-url origin 2>/dev/null \
    | sed -n 's|.*[:/]\([^/]*\)/\([^./]*\).*|\1|p' \
    | head -1)}"
  [ -n "$OWNER" ] || OWNER="$(basename "$(dirname "$REPO_ROOT")")"
fi

if [ -n "${2:-}" ]; then
  REPO="$2"
else
  REPO="${GITHUB_REPO:-$(basename "$REPO_ROOT")}"
fi

# --- Version resolution ---
# Priority: argument > environment > content hash > date fallback
if [ -n "${3:-}" ]; then
  VERSION="$3"
elif [ -n "${SRI_VERSION:-}" ]; then
  VERSION="$SRI_VERSION"
else
  HASH=$(
    cat css/app.css js/state.js js/ui.js js/scroll.js js/loader.js 2>/dev/null \
      | openssl dgst -sha256 2>/dev/null \
      | awk '{print $NF}' \
      | cut -c1-12
  )

  if [ -n "$HASH" ]; then
    VERSION="$HASH"
  else
    VERSION="$(date -u +%Y%m%d%H%M%S)"
  fi
fi

URL_VERSION="$VERSION"
[[ "$URL_VERSION" =~ ^[vV] ]] || URL_VERSION="v${VERSION}"

# --- Portable in-place sed ---
if [[ "${OSTYPE:-}" == darwin* ]]; then
  sedi() { sed -i '' "$@"; }
else
  sedi() { sed -i "$@"; }
fi

echo "🔐 Owner:   ${OWNER}"
echo "🔐 Repo:    ${REPO}"
echo "🔐 Version: ${URL_VERSION}"

# ============ SRI HASHES ============
declare -A FILE_MAP=(
  ["css/app.css"]="CSS"
  ["js/loader.js"]="LOADER"
  ["js/state.js"]="STATE"
  ["js/ui.js"]="UI"
  ["js/scroll.js"]="SCROLL"
)

declare -A HASHES

for filepath in "${!FILE_MAP[@]}"; do
  key="${FILE_MAP[$filepath]}"

  if [ -f "$filepath" ]; then
    hash=$(openssl dgst -sha384 -binary "$filepath" | openssl base64 -A)
    HASHES[$key]="sha384-${hash}"
    echo "  ✅ ${filepath} → sha384-${hash:0:20}..."
  else
    HASHES[$key]=""
    echo "  ⚠️  ${filepath} not found; its HTML hash will be left unchanged"
  fi
done

# ============ UPDATE index.html ============
if [ ! -f index.html ]; then
  echo "❌ index.html not found" >&2
  exit 1
fi

cp index.html index.html.bak

# --- Update app config version ---
sedi "s|version: '[^']*'|version: '${URL_VERSION}'|g" index.html

# --- Update owner/repo in CDN URLs and config base path ---
sedi "s|/gh/[a-zA-Z0-9_.-]*/[a-zA-Z0-9_.-]*@|/gh/${OWNER}/${REPO}@|g" index.html

# --- Update versioned CSS and JS CDN paths ---
sedi "s|@[^/]*/css/app\.css|@${URL_VERSION}/css/app.css|g" index.html
sedi "s|@[^/]*/js/|@${URL_VERSION}/js/|g" index.html

# --- Update CSS integrity in the stylesheet link ---
if [ -n "${HASHES[CSS]:-}" ]; then
  sedi "/<link rel=\"stylesheet\"/,/crossorigin=/ s|integrity=\"[^\"]*\"|integrity=\"${HASHES[CSS]}\"|" index.html
fi

# --- Update loader.js integrity ---
# The range starts on the script line containing loader.js and ends at crossorigin.
if [ -n "${HASHES[LOADER]:-}" ]; then
  sedi "/loader\.js/,/crossorigin=/ s|integrity=\"[^\"]*\"|integrity=\"${HASHES[LOADER]}\"|" index.html
fi

# --- Update the sriHashes object entries ---
for filepath in js/state.js js/ui.js js/scroll.js; do
  key="${FILE_MAP[$filepath]}"
  val="${HASHES[$key]:-}"
  [ -n "$val" ] || continue

  filename=$(basename "$filepath")
  sedi "/'${filename}':/ s|'sha384-[^']*'|'${val}'|g" index.html
done

# ============ DIFF SUMMARY ============
echo ""
echo "📝 Changes:"
echo "─────────────────────────────────────────────"
diff -u index.html.bak index.html \
  | grep '^[+-]' \
  | grep -v '^---\|^+++' \
  | head -30 || true
echo "─────────────────────────────────────────────"

rm -f index.html.bak

echo ""
echo "✅ index.html updated → ${OWNER}/${REPO}@${URL_VERSION}"
echo ""
echo "SRI_OWNER=${OWNER}"
echo "SRI_REPO=${REPO}"
echo "SRI_VERSION=${URL_VERSION}"
