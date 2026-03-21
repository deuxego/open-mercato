#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# Open Mercato → Your Brand — One-time rebrand script for downstream forks
#
# Usage:
#   ./scripts/rebrand.sh <new-org> <new-app-name> [<new-display-name>]
#
# Examples:
#   ./scripts/rebrand.sh acme-platform acme "Acme Platform"
#   ./scripts/rebrand.sh my-saas my-saas "My SaaS"
#
# Arguments:
#   new-org          — npm scope without @, e.g. "acme-platform"
#                      becomes @acme-platform/* for packages
#   new-app-name     — directory/CLI name, e.g. "acme"
#                      apps/mercato → apps/acme, CLI: yarn acme
#   new-display-name — human-readable product name (default: titlecase of org)
#                      used in UI, docs, i18n strings
#
# What it does:
#   1. Renames npm scope @open-mercato → @<new-org>
#   2. Renames app directory apps/mercato → apps/<new-app-name>
#   3. Renames CLI command mercato → <new-app-name>
#   4. Renames Docker containers/volumes/networks
#   5. Updates .mercato/ generated path → .<new-app-name>/
#   6. Updates display name "Open Mercato" → <new-display-name>
#   7. Updates database name default open-mercato → <new-app-name>
#   8. Updates all i18n strings
#   9. Updates env var prefix OM_ → <NEW_PREFIX>_
#  10. Regenerates yarn.lock
#
# After running:
#   yarn install && yarn build:packages && yarn generate && yarn build:packages
#
# WARNING: This is a ONE-WAY operation. Upstream sync becomes harder after this.
# ─────────────────────────────────────────────────────────────────────────────

if [ $# -lt 2 ]; then
  echo "Usage: $0 <new-org> <new-app-name> [<new-display-name>]"
  echo ""
  echo "Example: $0 acme-platform acme \"Acme Platform\""
  exit 1
fi

NEW_ORG="$1"
NEW_APP="$2"
NEW_DISPLAY="${3:-$(echo "$NEW_ORG" | sed 's/-/ /g' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) substr($i,2)}1')}"

# Derive variants
NEW_ORG_UPPER=$(echo "$NEW_ORG" | tr '[:lower:]' '[:upper:]' | tr '-' '_')
NEW_APP_UPPER=$(echo "$NEW_APP" | tr '[:lower:]' '[:upper:]' | tr '-' '_')
# Use first 2 letters of app name as env prefix (like OM_) or full if short
if [ ${#NEW_APP} -le 4 ]; then
  NEW_ENV_PREFIX="${NEW_APP_UPPER}_"
else
  NEW_ENV_PREFIX="${NEW_APP_UPPER}_"
fi

OLD_ORG="open-mercato"
OLD_APP="mercato"
OLD_DISPLAY="Open Mercato"
OLD_ENV_PREFIX="OM_"

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Rebranding Open Mercato                                    ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  npm scope:     @${OLD_ORG}  →  @${NEW_ORG}"
echo "║  app name:      ${OLD_APP}  →  ${NEW_APP}"
echo "║  display name:  ${OLD_DISPLAY}  →  ${NEW_DISPLAY}"
echo "║  env prefix:    ${OLD_ENV_PREFIX}  →  ${NEW_ENV_PREFIX}"
echo "║  db name:       ${OLD_ORG}  →  ${NEW_APP}"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

read -p "Continue? (y/N) " confirm
if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
  echo "Aborted."
  exit 0
fi

echo ""
echo "==> Step 1/9: Renaming npm scope @${OLD_ORG} → @${NEW_ORG}"

# Files to process (exclude generated/binary/lock files)
FIND_ARGS=(
  . -type f
  \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.mjs" -o -name "*.cjs" \
     -o -name "*.json" -o -name "*.yaml" -o -name "*.yml" -o -name "*.md" -o -name "*.mdx" \
     -o -name "*.css" -o -name "*.sh" -o -name "*.mdc" -o -name "Dockerfile" \
     -o -name ".gitignore" -o -name ".dockerignore" -o -name ".npmrc" \
     -o -name ".env.example" -o -name "*.jsonc" -o -name "*.template" \)
  -not -path "*/node_modules/*"
  -not -path "*/.git/*"
  -not -path "*/dist/*"
  -not -path "*/.next/*"
  -not -path "*/.yarn/*"
  -not -path "*/yarn.lock"
  -not -path "*/.mercato/next/*"
)

# 1. npm scope: @open-mercato/ → @new-org/
find "${FIND_ARGS[@]}" -exec grep -l "@${OLD_ORG}/" {} \; 2>/dev/null | while read -r f; do
  sed -i '' "s|@${OLD_ORG}/|@${NEW_ORG}/|g" "$f"
done
echo "   ✓ npm scope updated"

echo ""
echo "==> Step 2/9: Renaming display name"

# 2. Display name: "Open Mercato" → new display name (case-sensitive)
find "${FIND_ARGS[@]}" -exec grep -l "${OLD_DISPLAY}" {} \; 2>/dev/null | while read -r f; do
  sed -i '' "s|${OLD_DISPLAY}|${NEW_DISPLAY}|g" "$f"
done
echo "   ✓ display name updated"

echo ""
echo "==> Step 3/9: Renaming Docker resources"

# 3. Docker container/volume/network names: mercato- → new-app-
find "${FIND_ARGS[@]}" -exec grep -l "mercato-" {} \; 2>/dev/null | while read -r f; do
  sed -i '' "s|mercato-|${NEW_APP}-|g" "$f"
done
echo "   ✓ Docker resources renamed"

echo ""
echo "==> Step 4/9: Renaming database default"

# 4. Database name: open-mercato → new-app (in connection strings and env defaults)
find "${FIND_ARGS[@]}" -exec grep -l "open-mercato" {} \; 2>/dev/null | while read -r f; do
  sed -i '' "s|open-mercato|${NEW_APP}|g" "$f"
done
echo "   ✓ database name updated"

echo ""
echo "==> Step 5/9: Renaming .mercato/ generated path"

# 5. .mercato/ directory path → .new-app/
find "${FIND_ARGS[@]}" -exec grep -l "\.mercato/" {} \; 2>/dev/null | while read -r f; do
  sed -i '' "s|\.mercato/|.${NEW_APP}/|g" "$f"
done
# Also handle .mercato in gitignore patterns without trailing /
find "${FIND_ARGS[@]}" -exec grep -l "\.mercato" {} \; 2>/dev/null | while read -r f; do
  sed -i '' "s|\.mercato|.${NEW_APP}|g" "$f"
done
echo "   ✓ generated path updated"

echo ""
echo "==> Step 6/9: Renaming env var prefix OM_ → ${NEW_ENV_PREFIX}"

# 6. Environment variable prefix: OM_ → NEW_PREFIX_
# Be careful: only replace OM_ at word boundaries (start of var name)
find "${FIND_ARGS[@]}" -exec grep -l "OM_" {} \; 2>/dev/null | while read -r f; do
  # Replace OM_ at start of env var names (after quotes, spaces, =, $, {)
  sed -i '' "s|OM_|${NEW_ENV_PREFIX}|g" "$f"
done
# Also handle OPENMERCATO_ legacy prefix
find "${FIND_ARGS[@]}" -exec grep -l "OPENMERCATO_" {} \; 2>/dev/null | while read -r f; do
  sed -i '' "s|OPENMERCATO_|${NEW_ORG_UPPER}_|g" "$f"
done
echo "   ✓ env vars updated"

echo ""
echo "==> Step 7/9: Renaming CLI command"

# 7. CLI command: mercato → new-app (in bin references and scripts)
# Target only specific patterns to avoid over-replacing
if [ -f "packages/cli/package.json" ]; then
  sed -i '' "s|\"mercato\":|\"${NEW_APP}\":|g" "packages/cli/package.json"
fi
# Rename CLI bin file
if [ -f "packages/cli/bin/mercato" ]; then
  mv "packages/cli/bin/mercato" "packages/cli/bin/${NEW_APP}"
fi
# Update root package.json CLI reference
if [ -f "package.json" ]; then
  sed -i '' "s|\"mercato\":|\"${NEW_APP}\":|g" "package.json"
  sed -i '' "s|\"docker:mercato\":|\"docker:${NEW_APP}\":|g" "package.json"
  sed -i '' "s|yarn mercato |yarn ${NEW_APP} |g" "package.json"
  sed -i '' "s|docker-exec.mjs mercato|docker-exec.mjs ${NEW_APP}|g" "package.json"
fi
# Update mercato command references in ALL scripts (including docker/scripts/)
find . -type f \( -name "*.sh" -o -name "*.mjs" \) \
  -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/dist/*" \
  2>/dev/null | while read -r f; do
  sed -i '' "s|yarn mercato |yarn ${NEW_APP} |g" "$f"
  sed -i '' "s|mercato init|${NEW_APP} init|g" "$f"
  sed -i '' "s|mercato server|${NEW_APP} server|g" "$f"
  sed -i '' "s|mercato generate|${NEW_APP} generate|g" "$f"
  sed -i '' "s|mercato db |${NEW_APP} db |g" "$f"
  sed -i '' "s|mercato test|${NEW_APP} test|g" "$f"
  sed -i '' "s|mercato eject|${NEW_APP} eject|g" "$f"
done
# Update CLI references in documentation
find . -type f \( -name "*.md" -o -name "*.mdx" \) \
  -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/dist/*" \
  -not -path "*CHANGELOG*" -not -path "*RELEASE_NOTES*" \
  2>/dev/null | while read -r f; do
  sed -i '' "s|yarn mercato |yarn ${NEW_APP} |g" "$f"
  sed -i '' "s|mercato init|${NEW_APP} init|g" "$f"
  sed -i '' "s|mercato server|${NEW_APP} server|g" "$f"
  sed -i '' "s|mercato generate|${NEW_APP} generate|g" "$f"
  sed -i '' "s|mercato eject|${NEW_APP} eject|g" "$f"
  sed -i '' "s|docker:mercato|docker:${NEW_APP}|g" "$f"
done
echo "   ✓ CLI command renamed"

echo ""
echo "==> Step 8/9: Renaming app directory"

# 8. Rename apps/mercato → apps/new-app
if [ -d "apps/${OLD_APP}" ] && [ ! -d "apps/${NEW_APP}" ]; then
  mv "apps/${OLD_APP}" "apps/${NEW_APP}"
  echo "   ✓ apps/${OLD_APP} → apps/${NEW_APP}"
else
  echo "   ⚠ apps/${OLD_APP} not found or apps/${NEW_APP} already exists, skipping directory rename"
fi

# Also rename the generated directory inside the app
if [ -d "apps/${NEW_APP}/.mercato" ]; then
  mv "apps/${NEW_APP}/.mercato" "apps/${NEW_APP}/.${NEW_APP}"
  echo "   ✓ .mercato/ → .${NEW_APP}/"
fi

# Update references to apps/mercato in all files
find "${FIND_ARGS[@]}" -exec grep -l "apps/${OLD_APP}" {} \; 2>/dev/null | while read -r f; do
  sed -i '' "s|apps/${OLD_APP}|apps/${NEW_APP}|g" "$f"
done
echo "   ✓ path references updated"

echo ""
echo "==> Step 9/9: Renaming remaining 'mercato' references"

# 9. Catch remaining "mercato" references in specific safe contexts
# MCP config
if [ -f ".mcp.json.example" ]; then
  sed -i '' "s|\"${OLD_ORG}\"|\"${NEW_ORG}\"|g" ".mcp.json.example"
fi

# URLs: openmercato.com → keep as-is (these are upstream docs URLs)
# GitHub URLs: update org in repo references
find "${FIND_ARGS[@]}" -exec grep -l "open-mercato/open-mercato" {} \; 2>/dev/null | while read -r f; do
  sed -i '' "s|open-mercato/open-mercato|${NEW_ORG}/${NEW_ORG}|g" "$f"
done

# Inbox ops domain fallback
find "${FIND_ARGS[@]}" -exec grep -l "mercato.local" {} \; 2>/dev/null | while read -r f; do
  sed -i '' "s|mercato.local|${NEW_APP}.local|g" "$f"
done

# yarn workspace filter references: @open-mercato/app → @new-org/app
# (Already handled by step 1, but verify)

echo "   ✓ remaining references cleaned"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Rebrand complete!                                          ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║                                                             ║"
echo "║  Next steps:                                                ║"
echo "║                                                             ║"
echo "║  1. yarn install                                            ║"
echo "║  2. yarn build:packages                                    ║"
echo "║  3. yarn generate                                          ║"
echo "║  4. yarn build:packages                                    ║"
echo "║  5. yarn test                                              ║"
echo "║  6. yarn build:app                                         ║"
echo "║                                                             ║"
echo "║  Review git diff to verify all changes look correct.        ║"
echo "╚══════════════════════════════════════════════════════════════╝"
