# Self-Hosting Guide

Deploy the platform with Docker Compose. One command, all services included.

## Prerequisites

- Docker & Docker Compose v2+
- 2GB+ RAM (4GB recommended)
- 10GB+ free disk space (for images, volumes, and attachments)
- A domain name with DNS pointing to your server (for HTTPS)

## Required Environment Variables

Create a `.env` file in the project root and restrict its permissions:

```bash
touch .env && chmod 600 .env
```

Populate it with the following values:

```bash
# ── Deployment ──────────────────────────────────────────
DEPLOY_ENV=production
NODE_ENV=production
APP_URL=https://your-domain.com

# ── Ports (optional) ─────────────────────────────────────
# APP_PORT=3000                               # Host port for the app
# CONTAINER_PORT=3000                         # Container-internal port
# INNGEST_PORT=8288                           # Host port for Inngest dashboard proxy

# ── Database ────────────────────────────────────────────
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<strong-password>            # openssl rand -hex 16
POSTGRES_DB=open-mercato

# ── Authentication ──────────────────────────────────────
JWT_SECRET=<jwt-secret>                        # openssl rand -hex 32

# ── Encryption ──────────────────────────────────────────
TENANT_DATA_ENCRYPTION=true
TENANT_DATA_ENCRYPTION_KEY=<32-char-key>       # openssl rand -hex 16 (primary key)
TENANT_DATA_ENCRYPTION_FALLBACK_KEY=<32-char>  # openssl rand -hex 16 (old key, used during rotation)

# ── Initial Admin Account ───────────────────────────────
ADMIN_EMAIL=admin@your-domain.com
OM_INIT_SUPERADMIN_EMAIL=admin@your-domain.com
OM_INIT_SUPERADMIN_PASSWORD=<strong-password>

# ── Inngest (workflow engine) ───────────────────────────
INNGEST_EVENT_KEY=<event-key>                  # openssl rand -hex 16
INNGEST_SIGNING_KEY=<signing-key>              # openssl rand -hex 32

# ── Inngest Dashboard (browser URL for frontend) ────────
# NEXT_PUBLIC_INNGEST_BASE_URL=http://localhost:8288

# ── Feature Flags ───────────────────────────────────────
DEMO_MODE=false
SELF_SERVICE_ONBOARDING_ENABLED=true

# ── Enterprise Modules (optional) ───────────────────────
# These are app-level flags, not present in the compose file.
# OM_ENABLE_ENTERPRISE_MODULES=true
# OM_ENABLE_ENTERPRISE_MODULES_SSO=true
# OM_ENABLE_ENTERPRISE_MODULES_SECURITY=true

# ── Email (recommended for production) ──────────────────
# Without email, password resets and invitation flows will not work.
# RESEND_API_KEY=re_...
# EMAIL_FROM=noreply@your-domain.com

# ── AI/Embeddings (optional) ───────────────────────────
# OPENAI_API_KEY=sk-...

# ── Monitoring (optional) ──────────────────────────────
# NEW_RELIC_APP_NAME=my-platform
# NEW_RELIC_LICENSE_KEY=...
```

> **Important:** The docker-compose file has dev-safe fallback defaults (weak JWT, demo mode on, trivial passwords). You **MUST** set the values above in `.env` for production. Without a `.env` file, the app starts in an insecure dev-like state.

## Quick Start

```bash
# 1. Create and populate your .env file (see section above)
touch .env && chmod 600 .env
nano .env

# 2. Generate Inngest dashboard credentials
printf 'admin:%s\n' "$(openssl passwd -apr1 your-secure-password)" > docker/inngest-proxy/.htpasswd

# 3. Start everything
docker compose -f docker-compose.fullapp.yml up -d

# 4. Check logs (first run takes 2-5 minutes for migrations + seeding)
docker compose -f docker-compose.fullapp.yml logs -f app
```

## Services

The `docker-compose.fullapp.yml` starts these services:

| Service | Purpose | Port |
|---------|---------|------|
| **app** | Next.js application | Host `APP_PORT` (default 3000) |
| **postgres** | PostgreSQL 17 with pgvector | Internal only |
| **redis** | Cache + queue backend | Internal only |
| **inngest** | Workflow engine | Internal only |
| **inngest-proxy** | Nginx reverse proxy with basic auth for Inngest dashboard | Host `INNGEST_PORT` (default 8288) |
| **inngest-init** | Creates Inngest database (one-shot) | N/A |

Only the app and Inngest proxy ports are exposed to the host. All other services communicate over an internal Docker network.

Inngest uses PostgreSQL as its backing store and Redis for queueing. The `inngest-init` service creates a separate `inngest` database in the same PostgreSQL instance on first start.

### Service Startup Order

```
1. postgres       → waits for healthcheck (pg_isready)
2. redis          → waits for healthcheck (redis-cli ping)
3. inngest-init   → creates 'inngest' database (one-shot, depends on postgres)
4. inngest        → starts workflow engine (depends on inngest-init + redis)
5. inngest-proxy  → starts nginx auth proxy (depends on inngest)
6. app            → runs init/migrations, starts Next.js (depends on postgres + redis + inngest)
```

## Architecture

```
                    ┌─────────────┐
    Internet ──────►│     App     │◄──── :3000 (APP_PORT)
                    │  (Next.js)  │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
        ┌─────▼─────┐ ┌───▼───┐ ┌─────▼─────┐
        │ PostgreSQL │ │ Redis │ │  Inngest  │
        │ (pgvector) │ │       │ │ (workflow) │
        └───────────┘ └───────┘ └─────┬─────┘
                                      │ internal
                                ┌─────▼─────┐
    Internet ──────────────────►│   Nginx   │◄──── :8288 (INNGEST_PORT)
                                │  (proxy)  │      Basic Auth required
                                └───────────┘
```

All connections between app and backing services are internal. The nginx proxy is the only path to the Inngest dashboard — Inngest itself has no exposed port.

## Volumes & Data

Your deployment uses Docker named volumes to persist data:

| Volume | Contains | Backup? |
|--------|----------|---------|
| `postgres_data` | App database (`open-mercato`) + Inngest database (`inngest`) | **Required** |
| `redis_data` | Cache entries, queued jobs | Optional (regenerated on restart) |
| `attachments_storage` | User-uploaded files and document attachments | **Required** |
| `init_marker` | Lock file preventing re-initialization on restart | Not needed |

Volume names are suffixed with `DEPLOY_ENV` (e.g., `mercato-postgres-data-production`).

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

This takes 2-5 minutes. Subsequent starts only run pending migrations.

## Updating

```bash
# 1. Backup first (required — see Backup section below)
docker compose -f docker-compose.fullapp.yml exec postgres \
  pg_dump -U postgres open-mercato > backup-pre-update-$(date +%Y%m%d).sql

# 2. Pull latest image or rebuild
docker compose -f docker-compose.fullapp.yml build

# 3. Restart (migrations run automatically)
docker compose -f docker-compose.fullapp.yml up -d

# 4. Verify all services are healthy
docker compose -f docker-compose.fullapp.yml ps

# 5. Check app logs for migration errors
docker compose -f docker-compose.fullapp.yml logs app | tail -50
```

## Scaling

The fullapp compose uses Redis-backed cache and queue out of the box:

```bash
# Already set in docker-compose.fullapp.yml:
CACHE_STRATEGY=redis
CACHE_REDIS_URL=redis://<redis-container>:6379
```

To add Redis-backed async queue processing, add these to your `.env`:

```bash
QUEUE_STRATEGY=async
QUEUE_REDIS_URL=redis://<redis-container>:6379
```

For scaling beyond a single instance, consider:
- **Load balancer** (nginx, Caddy, or cloud ALB) in front of multiple app containers
- **Managed database** (AWS RDS, GCP Cloud SQL) instead of the containerized PostgreSQL
- **Managed Redis** (AWS ElastiCache, GCP Memorystore) for cache and queue HA
- **Shared storage** (S3, MinIO, NFS) for the `attachments_storage` volume
- **Inngest Cloud** instead of self-hosted Inngest for managed workflow execution

## Backup

### Application Database

```bash
# Backup app database
docker compose -f docker-compose.fullapp.yml exec postgres \
  pg_dump -U postgres open-mercato > backup-app-$(date +%Y%m%d-%H%M%S).sql

# Backup Inngest database (separate database in the same PostgreSQL instance)
docker compose -f docker-compose.fullapp.yml exec postgres \
  pg_dump -U postgres inngest > backup-inngest-$(date +%Y%m%d-%H%M%S).sql
```

### User Attachments

```bash
# Backup the attachments volume
docker run --rm \
  -v mercato-attachments-storage-${DEPLOY_ENV:-production}:/data:ro \
  -v "$(pwd)":/backup \
  alpine tar czf /backup/attachments-$(date +%Y%m%d-%H%M%S).tar.gz -C /data .
```

### Redis (optional)

Redis data is ephemeral (cache + queued jobs). Backing it up is optional — data regenerates on restart:

```bash
docker compose -f docker-compose.fullapp.yml exec redis redis-cli BGSAVE
docker compose -f docker-compose.fullapp.yml cp redis:/data/dump.rdb ./redis-backup.rdb
```

### Restore

```bash
# Restore app database
docker compose -f docker-compose.fullapp.yml exec -T postgres \
  psql -U postgres open-mercato < backup-app.sql

# Restore Inngest database
docker compose -f docker-compose.fullapp.yml exec -T postgres \
  psql -U postgres inngest < backup-inngest.sql

# Restore attachments
docker run --rm \
  -v mercato-attachments-storage-${DEPLOY_ENV:-production}:/data \
  -v "$(pwd)":/backup \
  alpine tar xzf /backup/attachments-backup.tar.gz -C /data
```

## HTTPS / TLS Termination

The app and Inngest proxy serve HTTP. For production, place a reverse proxy in front to terminate TLS.

### Caddy (recommended — automatic HTTPS)

```bash
# Install Caddy on the host, then create /etc/caddy/Caddyfile:
your-domain.com {
    reverse_proxy localhost:3000
}

inngest.your-domain.com {
    reverse_proxy localhost:8288
}
```

Caddy automatically provisions Let's Encrypt certificates.

### Nginx with Let's Encrypt

Use certbot to obtain certificates, then proxy:

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate     /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Cloud Load Balancer

On AWS (ALB), GCP (Cloud Load Balancing), or similar — terminate TLS at the load balancer and route to the app on port 3000.

> **Warning:** The Inngest dashboard proxy uses HTTP Basic Auth. Credentials are sent base64-encoded (reversible) in every request. Always access the Inngest dashboard over HTTPS or via SSH tunnel — never over plain HTTP on a public network.

## Inngest Dashboard

The Inngest dashboard is accessible via an nginx reverse proxy that requires basic auth credentials. By default it is exposed on host port `8288`.

Inngest polls the app's `/api/inngest` endpoint every 5 seconds for workflow function definitions. If workflows aren't executing, check that the app is healthy and Inngest can reach it on the internal Docker network.

### Setting Up Credentials

The proxy reads credentials from `docker/inngest-proxy/.htpasswd`. This file is git-ignored. Generate credentials before first start:

```bash
# Option 1: Using htpasswd (requires apache2-utils / httpd-tools)
#   Debian/Ubuntu: apt-get install apache2-utils
#   RHEL/Fedora:   dnf install httpd-tools
#   macOS:         brew install httpd
htpasswd -cb docker/inngest-proxy/.htpasswd admin your-secure-password

# Option 2: Using openssl (available on most systems)
printf 'admin:%s\n' "$(openssl passwd -apr1 your-secure-password)" > docker/inngest-proxy/.htpasswd
```

Add multiple users by appending (`-b` without `-c` to avoid overwriting the file):

```bash
htpasswd -b docker/inngest-proxy/.htpasswd anotheruser anotherpassword
```

To reset a forgotten password, regenerate the file with the commands above.

### Custom Port

Override the port via the `INNGEST_PORT` environment variable in your `.env`:

```bash
INNGEST_PORT=9090
```

### Customizing the Proxy

To add custom headers, CORS rules, or rate limiting, edit `docker/inngest-proxy/nginx.conf` and restart:

```bash
docker compose -f docker-compose.fullapp.yml restart inngest-proxy
```

### Alternative: SSH Tunnel (no exposed port)

If you prefer zero public exposure, remove the `inngest-proxy` service from the compose file and use an SSH tunnel instead:

```bash
ssh -L 8288:localhost:8288 your-server
# Then open http://localhost:8288 locally
```

## Troubleshooting

**App won't start:**
```bash
docker compose -f docker-compose.fullapp.yml logs app
```

**First run takes a long time:**
Initialization (migrations + seeding) takes 2-5 minutes on first start. Watch progress:
```bash
docker compose -f docker-compose.fullapp.yml logs -f app | grep -i -E "migration|seed|init"
```

**Database connection issues:**
```bash
docker compose -f docker-compose.fullapp.yml exec postgres pg_isready
```

**Migrations fail on start:**
```bash
# Check for SQL errors in app logs
docker compose -f docker-compose.fullapp.yml logs app | grep -i -E "error|migration|failed"
# Verify database is reachable from app container
docker compose -f docker-compose.fullapp.yml exec app sh -c 'pg_isready -h postgres' 2>/dev/null || echo "pg_isready not available, check app logs"
```

**Inngest not processing workflows:**
```bash
# Check Inngest logs
docker compose -f docker-compose.fullapp.yml logs inngest

# Verify Inngest can reach the app SDK endpoint
docker compose -f docker-compose.fullapp.yml exec inngest \
  wget -qO- http://mercato-app-${DEPLOY_ENV:-local}:${CONTAINER_PORT:-3000}/api/inngest 2>&1 | head -5
```

**Cannot access Inngest dashboard on port 8288:**
```bash
# Check if the proxy is running
docker compose -f docker-compose.fullapp.yml ps inngest-proxy

# Check if the port is in use by something else
lsof -i :8288

# Check proxy logs for errors (missing .htpasswd, etc.)
docker compose -f docker-compose.fullapp.yml logs inngest-proxy
```

**Disk space issues:**
```bash
# Check PostgreSQL database sizes
docker compose -f docker-compose.fullapp.yml exec postgres \
  psql -U postgres -c "SELECT datname, pg_size_pretty(pg_database_size(datname)) FROM pg_database ORDER BY pg_database_size(datname) DESC;"

# Check Docker disk usage
docker system df
```

**Reset database only (keep attachments):**
```bash
docker compose -f docker-compose.fullapp.yml down
docker volume rm mercato-postgres-data-${DEPLOY_ENV:-production} mercato-redis-data-${DEPLOY_ENV:-production} mercato-init-marker-${DEPLOY_ENV:-production}
docker compose -f docker-compose.fullapp.yml up -d
```

**Full reset (destroys ALL data — databases, attachments, queues):**

> **Warning:** This is irreversible. Back up first if you have any data you want to keep.

```bash
# Backup before reset (if needed)
docker compose -f docker-compose.fullapp.yml exec postgres \
  pg_dump -U postgres open-mercato > backup-before-reset.sql

# Destroy everything and start fresh
docker compose -f docker-compose.fullapp.yml down -v
docker compose -f docker-compose.fullapp.yml up -d
```

This removes all named volumes: `postgres_data`, `redis_data`, `init_marker`, and `attachments_storage`.

## Security Checklist

- [ ] Set strong `POSTGRES_PASSWORD` (not the default `postgres`)
- [ ] Set random `JWT_SECRET` (32+ hex chars, not the default `JWT`)
- [ ] Set `TENANT_DATA_ENCRYPTION_KEY` and fallback (not the dev defaults)
- [ ] Set random `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` (not the dev defaults)
- [ ] Set `OM_INIT_SUPERADMIN_PASSWORD` to a strong password (not `password`)
- [ ] Set `DEMO_MODE=false`
- [ ] Set `NODE_ENV=production`
- [ ] Restrict `.env` file permissions (`chmod 600 .env`)
- [ ] Use HTTPS for the app (see TLS Termination section)
- [ ] Use HTTPS for the Inngest dashboard or access via SSH tunnel only
- [ ] Set strong Inngest dashboard credentials in `docker/inngest-proxy/.htpasswd`
- [ ] Configure email delivery for password resets and invitations
- [ ] Verify only ports 3000 and 8288 are exposed (`docker compose ps`)
