#!/usr/bin/env bash
# setup.sh — Compute SRI hashes + update index.html in-place
# Usage:
#   ./setup.sh                    # auto-detect all (content-hash version)
#   ./setup.sh user repo          # specify user + repo
#   ./setup.sh user repo v1.0.0   # explicit version/tag
# Does NOT commit or push. Git ops handled by CI workflow.

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
# Priority: arg > env > content hash of assets > date fallback
if [ -n "${3:-}" ]; then
  VERSION="$3"
elif [ -n "${SRI_VERSION:-}" ]; then
  VERSION="$SRI_VERSION"
else
  # Content-based version: hash of all asset files
  # awk '{print $NF}' extracts ONLY the hex digest (not the "SHA256(stdin)=" label)
  HASH=$(cat css/app.css js/state.js js/ui.js js/scroll.js 2>/dev/null | openssl dgst -sha256 | awk '{print $NF}' | cut -c1-12)
  if [ -n "$HASH" ]; then
    VERSION="${HASH}"
  else
    # Fallback: no asset files exist yet (empty repo)
    VERSION="$(date -u +%Y%m%d%H%M%S)"
  fi
fi

# --- portable sed ---
if [[ "$OSTYPE" == "darwin"* ]]; then
  sedi() { sed -i '' "$@"; }
else
  sedi() { sed -i "$@"; }
fi

echo "🔐 Owner:   ${OWNER}"
echo "🔐 Repo:    ${REPO}"
echo "🔐 Version: ${VERSION}"

# ============ SRI HASHES ============
declare -A FILE_MAP=(
  ["css/app.css"]="CSS"
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
    echo "  ⚠️  ${filepath} not found, skipping"
  fi
done

# ============ UPDATE index.html ============
[ ! -f "index.html" ] && echo "❌ index.html not found" && exit 1

cp index.html index.html.bak

sedi "s|__OWNER__|${OWNER}|g" index.html
sedi "s|__REPO__|${REPO}|g" index.html
sedi "s|__VERSION__|${VERSION}|g" index.html

for key in "${!HASHES[@]}"; do
  ph="__${key}_HASH__"
  val="${HASHES[$key]}"
  if [ -n "$val" ]; then
    sedi "s|${ph}|${val}|g" index.html
  fi
done

# Diff summary
if command -v diff &>/dev/null; then
  echo "  📝 Changes:"
  diff -u index.html.bak index.html | grep '^[+-]' | grep -v '^---\|^+++' | head -20 || true
fi
rm -f index.html.bak

echo "✅ index.html updated → ${OWNER}/${REPO}@${VERSION}"
echo ""
echo "SRI_OWNER=${OWNER}"
echo "SRI_REPO=${REPO}"
echo "SRI_VERSION=${VERSION}"
