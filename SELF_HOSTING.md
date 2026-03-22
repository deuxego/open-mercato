# Self-Hosting Guide

Deploy the platform with Docker Compose. One command, all services included.

## Prerequisites

- Docker & Docker Compose v2+
- 2GB+ RAM (4GB recommended)
- PostgreSQL-compatible storage (provided via Docker)

## Quick Start

```bash
# 1. Create your .env file with production values (see below)
nano .env

# 2. Start everything
docker compose -f docker-compose.fullapp.yml up -d

# 3. Check logs
docker compose -f docker-compose.fullapp.yml logs -f app
```

## Required Environment Variables

Create a `.env` file in the project root:

```bash
# ── Deployment ──────────────────────────────────────────
DEPLOY_ENV=production
NODE_ENV=production
APP_URL=https://your-domain.com

# ── Database ────────────────────────────────────────────
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<strong-password>        # openssl rand -hex 16
POSTGRES_DB=open-mercato

# ── Authentication ──────────────────────────────────────
JWT_SECRET=<jwt-secret>                    # openssl rand -hex 32

# ── Encryption ──────────────────────────────────────────
TENANT_DATA_ENCRYPTION=true
TENANT_DATA_ENCRYPTION_KEY=<32-char-key>               # openssl rand -hex 16
TENANT_DATA_ENCRYPTION_FALLBACK_KEY=<32-char-fallback>  # openssl rand -hex 16

# ── Initial Admin Account ───────────────────────────────
ADMIN_EMAIL=admin@your-domain.com
OM_INIT_SUPERADMIN_EMAIL=admin@your-domain.com
OM_INIT_SUPERADMIN_PASSWORD=<strong-password>

# ── Inngest (workflow engine) ───────────────────────────
INNGEST_EVENT_KEY=<event-key>              # openssl rand -hex 16
INNGEST_SIGNING_KEY=<signing-key>          # openssl rand -hex 32

# ── Feature Flags ───────────────────────────────────────
DEMO_MODE=false
SELF_SERVICE_ONBOARDING_ENABLED=true

# ── Enterprise Modules (optional) ───────────────────────
# OM_ENABLE_ENTERPRISE_MODULES=true
# OM_ENABLE_ENTERPRISE_MODULES_SSO=true
# OM_ENABLE_ENTERPRISE_MODULES_SECURITY=true

# ── Email (optional) ───────────────────────────────────
# RESEND_API_KEY=re_...
# EMAIL_FROM=noreply@your-domain.com

# ── AI/Embeddings (optional) ───────────────────────────
# OPENAI_API_KEY=sk-...

# ── Monitoring (optional) ──────────────────────────────
# NEW_RELIC_APP_NAME=my-platform
# NEW_RELIC_LICENSE_KEY=...
```

> **Important:** The docker-compose file has dev-safe fallback defaults (weak JWT, demo mode on). You MUST set the values above in `.env` for production. Without a `.env` file, the app starts in an insecure dev-like state.

## Services

The `docker-compose.fullapp.yml` starts these services:

| Service | Purpose | Port |
|---------|---------|------|
| **app** | Next.js application | Exposed (default 3000) |
| **postgres** | PostgreSQL with pgvector | Internal only |
| **redis** | Cache + queue backend | Internal only |
| **inngest** | Workflow engine | Internal only |
| **inngest-init** | Creates Inngest database (one-shot) | Internal only |

All services communicate over an internal Docker network. Only the app port is exposed.

Inngest uses PostgreSQL as its backing store and Redis for queueing. The `inngest-init` service creates a separate `inngest` database in the same PostgreSQL instance on first start.

## Architecture

```
                    ┌─────────────┐
    Internet ──────►│     App     │◄──── Port 3000
                    │  (Next.js)  │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
        ┌─────▼─────┐ ┌───▼───┐ ┌─────▼─────┐
        │ PostgreSQL │ │ Redis │ │  Inngest  │
        │ (pgvector) │ │       │ │ (workflow) │
        └───────────┘ └───────┘ └───────────┘
```

## First Run

On first start, the app container automatically:
1. Prepares module generators (registry, entities, DI, OpenAPI)
2. Runs database migrations
3. Bootstraps all modules
4. Creates the initial tenant, organization, and superadmin account
5. Seeds defaults (roles, dictionaries, feature toggles, encryption maps)
6. Seeds example data (unless `--no-examples`)
7. Enables dashboard widgets
8. Rebuilds query indexes

Subsequent starts only run pending migrations.

## Updating

```bash
# Pull latest image or rebuild
docker compose -f docker-compose.fullapp.yml build

# Restart (migrations run automatically)
docker compose -f docker-compose.fullapp.yml up -d
```

## Scaling

For production with higher traffic, these are already configured in the fullapp compose:

```bash
# Redis-backed cache (instead of memory/SQLite)
CACHE_STRATEGY=redis
CACHE_REDIS_URL=redis://redis:6379

# Async queue strategy (Redis-backed)
QUEUE_STRATEGY=async
QUEUE_REDIS_URL=redis://redis:6379
```

## Backup

```bash
# Database backup
docker compose -f docker-compose.fullapp.yml exec postgres \
  pg_dump -U postgres open-mercato > backup.sql

# Restore
docker compose -f docker-compose.fullapp.yml exec -T postgres \
  psql -U postgres open-mercato < backup.sql
```

## Inngest Dashboard

The Inngest service runs internally (no exposed port). To access the dashboard:

```bash
# SSH tunnel from your local machine
ssh -L 8288:localhost:8288 your-server

# Then open http://localhost:8288 in your browser
```

Inngest polls the app's `/api/inngest` endpoint for workflow function definitions. If workflows aren't executing, check that the app is healthy and Inngest can reach it on the internal network.

## Troubleshooting

**App won't start:**
```bash
docker compose -f docker-compose.fullapp.yml logs app
```

**Database connection issues:**
```bash
docker compose -f docker-compose.fullapp.yml exec postgres pg_isready
```

**Inngest not processing workflows:**
```bash
docker compose -f docker-compose.fullapp.yml logs inngest
```

**Reset everything (destroys all data):**
```bash
docker compose -f docker-compose.fullapp.yml down -v
docker compose -f docker-compose.fullapp.yml up -d
```

## Security Checklist

- [ ] Set strong `POSTGRES_PASSWORD`
- [ ] Set random `JWT_SECRET` (32+ hex chars)
- [ ] Set `TENANT_DATA_ENCRYPTION_KEY` and fallback
- [ ] Set `DEMO_MODE=false`
- [ ] Set `NODE_ENV=production`
- [ ] Use HTTPS (reverse proxy: nginx, Caddy, or cloud LB)
- [ ] Set `OM_INIT_SUPERADMIN_PASSWORD` to a strong password
- [ ] Restrict Inngest dashboard access (no exposed port by default)
- [ ] Configure email delivery for password resets
