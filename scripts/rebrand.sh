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
#   new-app-name     — directory/CLI name, e.g. "acme"
#   new-display-name — human-readable product name (default: titlecase of org)
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

# ── Input validation ──────────────────────────────────────────────────────
if [[ "$NEW_ORG" =~ [^a-z0-9-] ]]; then
  echo "Error: new-org must contain only lowercase letters, numbers, and hyphens."
  exit 1
fi
if [[ "$NEW_APP" =~ [^a-z0-9-] ]]; then
  echo "Error: new-app-name must contain only lowercase letters, numbers, and hyphens."
  exit 1
fi
if [[ "$NEW_APP" == *" "* ]] || [[ "$NEW_ORG" == *" "* ]]; then
  echo "Error: names must not contain spaces."
  exit 1
fi

# ── Idempotency guard ────────────────────────────────────────────────────
if ! grep -q "@open-mercato/" package.json 2>/dev/null; then
  echo "Error: This codebase appears to have already been rebranded."
  echo "       @open-mercato/ not found in package.json."
  exit 1
fi

# ── Derive variants ──────────────────────────────────────────────────────
NEW_ORG_UPPER=$(echo "$NEW_ORG" | tr '[:lower:]' '[:upper:]' | tr '-' '_')
NEW_APP_UPPER=$(echo "$NEW_APP" | tr '[:lower:]' '[:upper:]' | tr '-' '_')
NEW_ENV_PREFIX="${NEW_APP_UPPER}_"

OLD_ORG="open-mercato"
OLD_APP="mercato"
OLD_DISPLAY="Open Mercato"

# ── Cross-platform sed -i ────────────────────────────────────────────────
sedi() {
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "$@"
  else
    sed -i "$@"
  fi
}

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Rebranding Open Mercato                                    ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  npm scope:     @${OLD_ORG}  →  @${NEW_ORG}"
echo "║  app name:      ${OLD_APP}  →  ${NEW_APP}"
echo "║  display name:  ${OLD_DISPLAY}  →  ${NEW_DISPLAY}"
echo "║  env prefix:    OM_  →  ${NEW_ENV_PREFIX}"
echo "║  db name:       ${OLD_ORG}  →  ${NEW_APP}"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

read -p "Continue? (y/N) " confirm
if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
  echo "Aborted."
  exit 0
fi

# ── File patterns (exclude generated/binary/lock files) ──────────────────
FIND_ARGS=(
  . -type f
  \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.mjs" -o -name "*.cjs" \
     -o -name "*.json" -o -name "*.yaml" -o -name "*.yml" -o -name "*.md" -o -name "*.mdx" \
     -o -name "*.css" -o -name "*.sh" -o -name "*.mdc" -o -name "Dockerfile" \
     -o -name ".gitignore" -o -name ".dockerignore" -o -name ".npmrc" \
     -o -name ".env.example" -o -name ".env" -o -name "*.jsonc" -o -name "*.template" \)
  -not -path "*/node_modules/*"
  -not -path "*/.git/*"
  -not -path "*/dist/*"
  -not -path "*/.next/*"
  -not -path "*/.yarn/*"
  -not -path "*/yarn.lock"
  -not -path "*/.mercato/next/*"
)

# ══════════════════════════════════════════════════════════════════════════
# STEP 1: npm scope (@open-mercato/ → @new-org/)
# This is the safest replacement — the @ prefix + / suffix make it unique.
# ══════════════════════════════════════════════════════════════════════════
echo ""
echo "==> Step 1/10: Renaming npm scope @${OLD_ORG} → @${NEW_ORG}"
find "${FIND_ARGS[@]}" -exec grep -l "@${OLD_ORG}/" {} \; 2>/dev/null | while read -r f; do
  sedi "s|@${OLD_ORG}/|@${NEW_ORG}/|g" "$f"
done
echo "   ✓ npm scope updated"

# ══════════════════════════════════════════════════════════════════════════
# STEP 2: Display name ("Open Mercato" → new display name)
# Case-sensitive exact match — very safe.
# ══════════════════════════════════════════════════════════════════════════
echo ""
echo "==> Step 2/10: Renaming display name"
find "${FIND_ARGS[@]}" -exec grep -l "${OLD_DISPLAY}" {} \; 2>/dev/null | while read -r f; do
  sedi "s|${OLD_DISPLAY}|${NEW_DISPLAY}|g" "$f"
done
echo "   ✓ display name updated"

# ══════════════════════════════════════════════════════════════════════════
# STEP 3: Database name (open-mercato → new-app)
# Must run BEFORE Docker rename to avoid partial matches.
# Targets: POSTGRES_DB defaults, DATABASE_URL, pg_dump commands.
# ══════════════════════════════════════════════════════════════════════════
echo ""
echo "==> Step 3/10: Renaming database default"
find "${FIND_ARGS[@]}" -exec grep -l "open-mercato" {} \; 2>/dev/null | while read -r f; do
  sedi "s|open-mercato|${NEW_APP}|g" "$f"
done
echo "   ✓ database name updated"

# ══════════════════════════════════════════════════════════════════════════
# STEP 4: Docker resources (mercato- prefix → new-app- prefix)
# Only target docker-compose files and docker scripts to avoid over-matching.
# This prevents corrupting strings like "create-mercato-app" or crypto constants.
# ══════════════════════════════════════════════════════════════════════════
echo ""
echo "==> Step 4/10: Renaming Docker resources"
for f in docker-compose*.yml .devcontainer/docker-compose.yml docker/scripts/*.sh docker/README.md; do
  [ -f "$f" ] || continue
  if grep -q "mercato-" "$f" 2>/dev/null; then
    sedi "s|mercato-|${NEW_APP}-|g" "$f"
  fi
done
# Also rename Docker image name in compose
for f in docker-compose*.yml; do
  [ -f "$f" ] || continue
  if grep -q "${OLD_APP}/app" "$f" 2>/dev/null; then
    sedi "s|${OLD_APP}/app|${NEW_APP}/app|g" "$f"
  fi
done
echo "   ✓ Docker resources renamed"

# ══════════════════════════════════════════════════════════════════════════
# STEP 5: .mercato/ generated path → .new-app/
# ══════════════════════════════════════════════════════════════════════════
echo ""
echo "==> Step 5/10: Renaming .mercato/ generated path"
find "${FIND_ARGS[@]}" -exec grep -l "\.mercato/" {} \; 2>/dev/null | while read -r f; do
  sedi "s|\.mercato/|.${NEW_APP}/|g" "$f"
done
find "${FIND_ARGS[@]}" -exec grep -l "\.mercato" {} \; 2>/dev/null | while read -r f; do
  sedi "s|\.mercato|.${NEW_APP}|g" "$f"
done
echo "   ✓ generated path updated"

# ══════════════════════════════════════════════════════════════════════════
# STEP 6: Environment variable prefix (OM_ → NEW_PREFIX_)
# Uses word-boundary matching to avoid corrupting DOM_, CUSTOM_, RANDOM_ etc.
# Only matches OM_ at the start of a word (preceded by non-alphanumeric or BOL).
# ══════════════════════════════════════════════════════════════════════════
echo ""
echo "==> Step 6/10: Renaming env var prefix OM_ → ${NEW_ENV_PREFIX}"

# Build list of known OM_ env var names to replace precisely
OM_VARS=(
  OM_PROFILE OM_CRUD_PROFILE OM_QE_PROFILE
  OM_TEST_MODE OM_TEST_AUTH_RATE_LIMIT_MODE
  OM_DISABLE_EMAIL_DELIVERY
  OM_ENABLE_ENTERPRISE_MODULES OM_ENABLE_ENTERPRISE_MODULES_SSO OM_ENABLE_ENTERPRISE_MODULES_SECURITY
  OM_INIT_SUPERADMIN_EMAIL OM_INIT_SUPERADMIN_PASSWORD OM_INIT_GENERATE_RANDOM_PASSWORD
  OM_SEARCH_ENABLED OM_SEARCH_MIN_LEN OM_SEARCH_ENABLE_PARTIAL OM_SEARCH_HASH_ALGO
  OM_SEARCH_STORE_RAW_TOKENS OM_SEARCH_FIELD_BLOCKLIST OM_SEARCH_DEBUG
  OM_QUERY_INDEX_DEBUG
  OM_SECURITY_MFA_SETUP_SECRET OM_SECURITY_PASSKEYS_ENABLED
  OM_INTEGRATION_APP_READY_TIMEOUT_SECONDS OM_INTEGRATION_BUILD_CACHE_TTL_SECONDS
)

find "${FIND_ARGS[@]}" -exec grep -l "OM_" {} \; 2>/dev/null | while read -r f; do
  for var in "${OM_VARS[@]}"; do
    new_var="${var/OM_/${NEW_ENV_PREFIX}}"
    sedi "s|${var}|${new_var}|g" "$f"
  done
done

# Also handle NEXT_PUBLIC_OM_ vars
find "${FIND_ARGS[@]}" -exec grep -l "NEXT_PUBLIC_OM_" {} \; 2>/dev/null | while read -r f; do
  sedi "s|NEXT_PUBLIC_OM_|NEXT_PUBLIC_${NEW_ENV_PREFIX}|g" "$f"
done

# Handle OPENMERCATO_ legacy prefix
find "${FIND_ARGS[@]}" -exec grep -l "OPENMERCATO_" {} \; 2>/dev/null | while read -r f; do
  sedi "s|OPENMERCATO_|${NEW_ORG_UPPER}_|g" "$f"
done

# Handle MERCATO_ prefixed vars (CLI debug/quiet)
find "${FIND_ARGS[@]}" -exec grep -l "MERCATO_" {} \; 2>/dev/null | while read -r f; do
  sedi "s|MERCATO_QUIET|${NEW_APP_UPPER}_QUIET|g" "$f"
  sedi "s|MERCATO_CLI_DEBUG|${NEW_APP_UPPER}_CLI_DEBUG|g" "$f"
done
echo "   ✓ env vars updated"

# ══════════════════════════════════════════════════════════════════════════
# STEP 7: CLI command (mercato → new-app)
# Targets: package.json scripts, shell scripts, docker-compose commands,
# documentation, and TypeScript CLI usage strings.
# ══════════════════════════════════════════════════════════════════════════
echo ""
echo "==> Step 7/10: Renaming CLI command"

# CLI bin file
if [ -f "packages/cli/bin/mercato" ]; then
  mv "packages/cli/bin/mercato" "packages/cli/bin/${NEW_APP}"
fi

# CLI package.json: bin key + value
if [ -f "packages/cli/package.json" ]; then
  sedi "s|\"mercato\":|\"${NEW_APP}\":|g" "packages/cli/package.json"
  sedi "s|\"./bin/mercato\"|\"./bin/${NEW_APP}\"|g" "packages/cli/package.json"
fi

# Root package.json
if [ -f "package.json" ]; then
  sedi "s|\"mercato\":|\"${NEW_APP}\":|g" "package.json"
  sedi "s|\"docker:mercato\":|\"docker:${NEW_APP}\":|g" "package.json"
  sedi "s|yarn mercato |yarn ${NEW_APP} |g" "package.json"
  sedi "s|docker-exec.mjs mercato|docker-exec.mjs ${NEW_APP}|g" "package.json"
fi

# App package.json (CLI commands in scripts)
if [ -f "apps/${OLD_APP}/package.json" ]; then
  sedi "s|mercato server|${NEW_APP} server|g" "apps/${OLD_APP}/package.json"
  sedi "s|mercato generate|${NEW_APP} generate|g" "apps/${OLD_APP}/package.json"
  sedi "s|mercato db |${NEW_APP} db |g" "apps/${OLD_APP}/package.json"
  sedi "s|mercato init|${NEW_APP} init|g" "apps/${OLD_APP}/package.json"
fi

# CLI references in ALL scripts, docker-compose, docs, and TS CLI files
find . -type f \( -name "*.sh" -o -name "*.mjs" -o -name "*.yml" -o -name "*.yaml" \
  -o -name "*.md" -o -name "*.mdx" \) \
  -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/dist/*" \
  -not -path "*CHANGELOG*" -not -path "*RELEASE_NOTES*" \
  2>/dev/null | while read -r f; do
  sedi "s|yarn mercato |yarn ${NEW_APP} |g" "$f" 2>/dev/null || true
  sedi "s|mercato init|${NEW_APP} init|g" "$f" 2>/dev/null || true
  sedi "s|mercato server|${NEW_APP} server|g" "$f" 2>/dev/null || true
  sedi "s|mercato generate|${NEW_APP} generate|g" "$f" 2>/dev/null || true
  sedi "s|mercato db |${NEW_APP} db |g" "$f" 2>/dev/null || true
  sedi "s|mercato test|${NEW_APP} test|g" "$f" 2>/dev/null || true
  sedi "s|mercato eject|${NEW_APP} eject|g" "$f" 2>/dev/null || true
  sedi "s|docker:mercato|docker:${NEW_APP}|g" "$f" 2>/dev/null || true
done

# CLI usage strings in TypeScript module CLI files
find packages/core/src/modules/*/cli.ts packages/cli/src -name "*.ts" \
  -not -path "*/node_modules/*" -not -path "*/dist/*" -not -path "*__tests__*" \
  2>/dev/null | while read -r f; do
  sedi "s|mercato |${NEW_APP} |g" "$f" 2>/dev/null || true
done
echo "   ✓ CLI command renamed"

# ══════════════════════════════════════════════════════════════════════════
# STEP 8: App directory rename (apps/mercato → apps/new-app)
# ══════════════════════════════════════════════════════════════════════════
echo ""
echo "==> Step 8/10: Renaming app directory"

if [ -d "apps/${OLD_APP}" ] && [ ! -d "apps/${NEW_APP}" ]; then
  mv "apps/${OLD_APP}" "apps/${NEW_APP}"
  echo "   ✓ apps/${OLD_APP} → apps/${NEW_APP}"
else
  echo "   ⚠ apps/${OLD_APP} not found or apps/${NEW_APP} already exists, skipping"
fi

# Update path references to apps/mercato
find "${FIND_ARGS[@]}" -exec grep -l "apps/${OLD_APP}" {} \; 2>/dev/null | while read -r f; do
  sedi "s|apps/${OLD_APP}|apps/${NEW_APP}|g" "$f"
done

# Rename .mercato generated directory inside the app
if [ -d "apps/${NEW_APP}/.mercato" ]; then
  mv "apps/${NEW_APP}/.mercato" "apps/${NEW_APP}/.${NEW_APP}"
  echo "   ✓ .mercato/ → .${NEW_APP}/"
fi
echo "   ✓ path references updated"

# ══════════════════════════════════════════════════════════════════════════
# STEP 9: GitHub URLs and remaining safe replacements
# ══════════════════════════════════════════════════════════════════════════
echo ""
echo "==> Step 9/10: Renaming remaining references"

# MCP config
if [ -f ".mcp.json.example" ]; then
  sedi "s|\"${OLD_ORG}\"|\"${NEW_ORG}\"|g" ".mcp.json.example"
fi

# GitHub repo URLs
find "${FIND_ARGS[@]}" -exec grep -l "open-mercato/open-mercato" {} \; 2>/dev/null | while read -r f; do
  sedi "s|open-mercato/open-mercato|${NEW_ORG}/${NEW_ORG}|g" "$f"
done

# Inbox ops domain fallback
find "${FIND_ARGS[@]}" -exec grep -l "mercato.local" {} \; 2>/dev/null | while read -r f; do
  sedi "s|mercato.local|${NEW_APP}.local|g" "$f"
done

# Test DB names
find "${FIND_ARGS[@]}" -exec grep -l "mercato_test" {} \; 2>/dev/null | while read -r f; do
  sedi "s|mercato_test|${NEW_APP}_test|g" "$f"
done

# mercato.test domain in test fixtures
find "${FIND_ARGS[@]}" -exec grep -l "mercato.test" {} \; 2>/dev/null | while read -r f; do
  sedi "s|mercato.test|${NEW_APP}.test|g" "$f"
done
echo "   ✓ remaining references cleaned"

# ══════════════════════════════════════════════════════════════════════════
# STEP 10: create-app package rename
# ══════════════════════════════════════════════════════════════════════════
echo ""
echo "==> Step 10/10: Renaming create-app package"

if [ -f "packages/create-app/package.json" ]; then
  sedi "s|create-mercato-app|create-${NEW_APP}-app|g" "packages/create-app/package.json"
fi
if [ -f "packages/create-app/bin/create-mercato-app" ]; then
  mv "packages/create-app/bin/create-mercato-app" "packages/create-app/bin/create-${NEW_APP}-app"
fi
# Update create-app source references
find packages/create-app/src -name "*.ts" -not -path "*/node_modules/*" -not -path "*/dist/*" \
  2>/dev/null | while read -r f; do
  sedi "s|create-mercato-app|create-${NEW_APP}-app|g" "$f" 2>/dev/null || true
done
echo "   ✓ create-app package renamed"

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
echo "║                                                             ║"
echo "║  Note: openmercato.com URLs are kept as-is (upstream docs). ║"
echo "║  Note: Crypto constants (SSO salt, sudo secret) are NOT     ║"
echo "║        renamed — they must stay stable for existing users.  ║"
echo "╚══════════════════════════════════════════════════════════════╝"
