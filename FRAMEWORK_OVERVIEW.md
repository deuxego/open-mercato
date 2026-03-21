# Open Mercato — Framework Deep Dive

> Enterprise-grade, AI-supportive modular platform for building CRMs, ERPs, and business backends.
> "80% done — buy core, build the remaining 20% that differentiates your business."

---

## Table of Contents

- [Philosophy & Architecture](#philosophy--architecture)
- [Tech Stack](#tech-stack)
- [Monorepo Structure](#monorepo-structure)
- [Module System (Auto-Discovery)](#module-system-auto-discovery)
- [Currently Enabled Modules (34 total)](#currently-enabled-modules)
- [Core Platform Modules — Detailed Breakdown](#core-platform-modules--detailed-breakdown)
- [Specialty Packages](#specialty-packages)
- [Infrastructure Packages](#infrastructure-packages)
- [Universal Module Extension System (UMES)](#universal-module-extension-system-umes)
- [Integration Marketplace & Connector Framework](#integration-marketplace--connector-framework)
- [RBAC & Security](#rbac--security)
- [Customer Portal](#customer-portal)
- [Event Bus & Real-Time (DOM Event Bridge)](#event-bus--real-time-dom-event-bridge)
- [Caching](#caching)
- [Background Jobs & Workers](#background-jobs--workers)
- [Scheduled Jobs](#scheduled-jobs)
- [CLI & Code Generation](#cli--code-generation)
- [i18n & Entity Translations](#i18n--entity-translations)
- [Testing Infrastructure](#testing-infrastructure)
- [Enterprise Edition Modules](#enterprise-edition-modules)
- [Backward Compatibility Contract](#backward-compatibility-contract)
- [Standalone App Scaffolding](#standalone-app-scaffolding)
- [AI-Driven Development Workflow](#ai-driven-development-workflow)
- [Example Module — Reference Implementation](#example-module--reference-implementation)
- [Spec Inventory (100+ Specs)](#spec-inventory)

---

## Philosophy & Architecture

| Principle | What It Means |
|-----------|---------------|
| **Multi-Tenant by Default** | Every entity scoped by `organization_id` / `tenant_id`. Cross-tenant data leaks are impossible by convention. |
| **Module Independence** | No direct ORM relationships between modules. Foreign key IDs only, fetch separately. Modules are isomorphic and self-contained. |
| **Auto-Discovery** | Drop files in the right place → framework finds them. Pages, API routes, subscribers, workers, widgets — zero manual wiring. |
| **Convention Over Configuration** | Strict naming (snake_case modules, camelCase JS, snake_case DB), strict file locations, strict export names. |
| **Extensibility Without Forking** | UMES (14 mechanisms) lets you inject widgets, intercept APIs, replace components, enrich responses — all from your own module, no core patches. |
| **Command Pattern (Undo/Redo)** | All write operations go through `registerCommand`. Every mutation is auditable and reversible. |
| **Spec-Driven Development** | Non-trivial features start as specs in `.ai/specs/`. Implementation follows phases with code-review gates. |
| **Backward Compatibility** | 13 frozen/stable contract surfaces. Deprecation protocol enforced. Third-party modules never break silently. |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 24.x |
| Framework | Next.js 16 (App Router) |
| Language | TypeScript (strict, no `any`) |
| UI | React 19 |
| ORM | MikroORM 6 |
| Database | PostgreSQL |
| Validation | Zod (all inputs, `z.infer` for types) |
| DI Container | Awilix |
| Package Manager | Yarn 4+ (workspaces) |
| Encryption | Field-level encryption for PII/GDPR |
| Auth | JWT + bcryptjs (cost ≥10) |
| Queue | BullMQ (production) / Local file-based (dev) |
| Cache | Redis / SQLite / Memory (strategy-based) |
| Testing | Jest (unit), Playwright (integration) |
| CI/CD | Docker Compose (dev, production, ephemeral) |

---

## Monorepo Structure

```
apps/
  mercato/                  # Main Next.js app (user boilerplate)
    src/modules/            # User/app-specific modules (e.g. example)
  docs/                     # Documentation site

packages/
  core/                     # 22 core platform modules
  ui/                       # CrudForm, DataTable, backend pages, portal shell, primitives
  shared/                   # Cross-cutting utilities, types, DSL, i18n, data engine
  cli/                      # CLI tooling, module generators, migration commands
  events/                   # Event bus, ephemeral/persistent subscriptions, DOM Event Bridge
  cache/                    # Caching abstraction (memory/SQLite/Redis)
  queue/                    # Background job processing (local/BullMQ)
  scheduler/                # Cron/interval scheduled jobs with admin UI
  content/                  # Static content pages (privacy, terms, legal)
  onboarding/               # Setup wizards, tenant provisioning, welcome emails
  enterprise/               # Commercial enterprise-only modules (MFA, SSO, record locks)
  create-app/               # Standalone app scaffolding (create-mercato-app)
```

---

## Module System (Auto-Discovery)

Every module lives in `src/modules/<module_name>/` and is auto-discovered by file convention.

### Auto-Discovery Paths

| File Path | Becomes |
|-----------|---------|
| `frontend/<path>.tsx` | Frontend route `/<path>` |
| `backend/<path>.tsx` | Admin route `/backend/<path>` |
| `api/<method>/<path>.ts` | API endpoint `/api/<path>` (dispatched by HTTP method) |
| `subscribers/*.ts` | Event subscriber (export `metadata` + default handler) |
| `workers/*.ts` | Background worker (export `metadata` + default handler) |

### Module File Inventory (All Optional)

| File | Export | Purpose |
|------|--------|---------|
| `index.ts` | `metadata` | Module identity & metadata |
| `di.ts` | `register(container)` | DI registrations (Awilix) |
| `acl.ts` | `features` | RBAC feature declarations |
| `setup.ts` | `setup: ModuleSetupConfig` | Tenant init, role defaults, seed data |
| `ce.ts` | `entities` | Custom entities / custom field sets |
| `events.ts` | `eventsConfig` | Typed event declarations |
| `translations.ts` | `translatableFields` | Translatable field mappings |
| `notifications.ts` | `notificationTypes` | Notification type definitions |
| `notifications.client.ts` | — | Client-side notification renderers |
| `notifications.handlers.ts` | — | Reactive notification handlers |
| `generators.ts` | `generatorPlugins` | Additional generated output files |
| `ai-tools.ts` | `aiTools` | MCP AI tool definitions |
| `cli.ts` | default | CLI command handler |
| `api/interceptors.ts` | `interceptors` | Before/after API hooks |
| `data/entities.ts` | — | MikroORM entity definitions |
| `data/validators.ts` | — | Zod validation schemas |
| `data/extensions.ts` | `extensions` | Entity extensions (cross-module links) |
| `data/enrichers.ts` | `enrichers` | Response enrichers for data federation |
| `widgets/injection-table.ts` | — | Widget-to-slot mappings |
| `widgets/injection/` | — | Injected UI widgets |
| `widgets/components.ts` | `componentOverrides` | Component replace/wrapper/props |
| `message-objects.ts` | — | Inline message object references |

---

## Currently Enabled Modules

From `apps/mercato/src/modules.ts` — **34 modules** active:

### OSS Core (from `@open-mercato/core`)
| Module | Category |
|--------|----------|
| `auth` | Authentication, users, roles, sessions, RBAC |
| `customer_accounts` | Customer identity, portal auth, customer RBAC |
| `portal` | Customer portal framework |
| `dashboards` | Configurable admin dashboard with widgets |
| `directory` | Multi-tenant directory (tenants, organizations) |
| `entities` | Custom entities & dynamic fields (EAV) |
| `configs` | System configuration, cache management, upgrade actions |
| `query_index` | Hybrid query layer (fulltext + vector search) |
| `audit_logs` | Audit trail for all mutations with undo/redo |
| `attachments` | File attachments, media, OCR |
| `api_keys` | API key management for programmatic access |
| `dictionaries` | Shared lookup values & enumerations |
| `api_docs` | Auto-generated API documentation |
| `business_rules` | Configurable rule engine with conditions & actions |
| `feature_toggles` | Feature flags with tenant-level overrides |
| `notifications` | In-app notifications with SSE delivery |
| `progress` | Long-running operation progress tracking |
| `integrations` | Integration marketplace foundation |
| `data_sync` | Data synchronization hub |
| `messages` | Internal messaging with attachments & email forwarding |
| `translations` | Entity field translations per locale |
| `widgets` | Widget infrastructure |

### Specialty Packages
| Module | Package |
|--------|---------|
| `content` | `@open-mercato/content` |
| `onboarding` | `@open-mercato/onboarding` |
| `events` | `@open-mercato/events` |
| `scheduler` | `@open-mercato/scheduler` |

### App-Level
| Module | Package |
|--------|---------|
| `example` | `@app` (reference implementation) |

### Enterprise (opt-in via env vars)
| Module | Condition |
|--------|-----------|
| `record_locks` | `OM_ENABLE_ENTERPRISE_MODULES` |
| `system_status_overlays` | `OM_ENABLE_ENTERPRISE_MODULES` |
| `sso` | + `OM_ENABLE_ENTERPRISE_MODULES_SSO` |
| `security` | + `OM_ENABLE_ENTERPRISE_MODULES_SECURITY` |

---

## Core Platform Modules — Detailed Breakdown

### Authentication & Authorization (`auth`)

- JWT-based authentication with session management
- Two-layer RBAC: Role ACLs + per-User ACL overrides
- Feature-based permissions (`<module>.<action>`)
- Special flags: `isSuperAdmin`, organization visibility lists
- Declarative guards in page metadata (`requireAuth`, `requireRoles`, `requireFeatures`)
- Password reset flows, profile management
- **Events**: `auth.user.{created,updated,deleted}`, `auth.role.*`, `auth.login.{success,failed}`, `auth.logout`, `auth.password.*`
- **Features**: `auth.users.*`, `auth.roles.*`, `auth.acl.*`, `auth.sidebar.*`

### Customer Accounts & Portal Auth (`customer_accounts`)

- Full customer identity system (separate from admin users)
- Login, Signup, Magic Link, Password Reset, Email Verification, Invitation flows
- Two-cookie authentication strategy (JWT + session token)
- Customer RBAC with default roles (Portal Admin, Buyer, Viewer)
- CRM auto-linking via event subscribers
- Account lockout and rate limiting
- Worker-based session cleanup
- Response enrichers for cross-module data
- **Events**: `customer_accounts.user.*`, `customer_accounts.login.*`, `customer_accounts.email.verified`, `customer_accounts.role.*`, `customer_accounts.invitation.accepted`

### Customer Portal (`portal`)

- Self-service customer portal framework
- Login, signup, dashboard, sidebar
- Depends on `customer_accounts` module
- UI provided by `@open-mercato/ui` portal components
- Widget injection for portal pages
- Ejectable for customization

### Dashboards (`dashboards`)

- Configurable admin dashboard with module-provided widgets
- Aggregation engine for analytics
- Widget visibility per role
- Extensible via widget injection from any module
- **Features**: `dashboards.{view,configure}`, `dashboards.admin.assign-widgets`, `analytics.view`

### Directory (`directory`)

- Multi-tenant directory with tenants and organizations
- Organizational hierarchy and tree structure
- Organization switcher
- **Events**: `directory.tenant.*`, `directory.organization.*`
- **Features**: `directory.tenants.*`, `directory.organizations.*`

### Custom Entities & Fields (`entities`)

- User-defined entities with custom fields (EAV pattern)
- Dynamic records storage
- Field types: text, integer, boolean, select, multi-select, multiline (markdown), attachment upload, listbox
- Validation rules, default values, filterable/formEditable flags, UI hints
- Integrates with query index for search
- **Features**: `entities.definitions.*`, `entities.records.*`

### Configuration (`configs`)

- Shared configuration storage for module settings
- System status monitoring
- Cache management UI
- Upgrade actions system for data migrations
- **Features**: `configs.system_status.view`, `configs.cache.*`, `configs.manage`

### Query Index (`query_index`)

- Hybrid query layer with full-text and vector search capabilities
- Batch indexing, coverage tracking, stale detection
- Search token generation
- Reindexing CLI and admin UI
- **Features**: `query_index.status.view`, `query_index.reindex`, `query_index.purge`

### Audit Logs (`audit_logs`)

- Tracks all user actions and data accesses
- Full undo/redo support with before/after snapshots
- Self-audit and tenant-audit visibility levels
- **Features**: `audit_logs.{view_self,view_tenant}`, `audit_logs.{undo,redo}_{self,tenant}`

### Attachments (`attachments`)

- File attachments and media management
- Library with partitions and transfer support
- OCR integration, image URL utilities
- Custom entities for attachment metadata
- **Events**: `attachments.*` (created, updated, deleted)
- **Features**: `attachments.{view,manage}`

### API Keys (`api_keys`)

- Manage access tokens for external API access
- Scoped to authentication module
- **Features**: `api_keys.{view,create,delete}`

### Dictionaries (`dictionaries`)

- Organization-scoped enumerations and appearance presets
- Shared lookup values across modules
- Translatable dictionary entries
- **Features**: `dictionaries.{view,manage}`

### API Documentation (`api_docs`)

- Auto-generated documentation for all HTTP endpoints
- Backend and frontend documentation views
- Resource discovery from OpenAPI specs

### Business Rules Engine (`business_rules`)

- Define conditions and actions for automation
- Visual rule builder (ConditionBuilder, ActionBuilder)
- Rule sets for grouped logic
- Execution logging
- Custom entities for rule storage
- **Features**: `business_rules.{view,manage,execute,view_logs,manage_sets}`

### Feature Toggles (`feature_toggles`)

- Global feature flags
- Tenant-level overrides
- Hooks for consuming flags (string, number, json, boolean)
- Admin UI for management

### Notifications (`notifications`)

- In-app notification types with subscriber-based triggers
- Client-side renderers with reactive handlers (`useNotificationEffect`)
- Batch creation, role-based settings, unread counts
- Email delivery strategies
- SSE-based real-time delivery via DOM Event Bridge
- **Events**: `notifications.notification.{created,batch_created}` (with `clientBroadcast`)
- **Features**: `notifications.{view,create,manage}`

### Progress Tracking (`progress`)

- Generic server-side progress tracking for long-running operations
- Job lifecycle: created → started → updated → completed/failed/cancelled
- All events broadcast to browser via SSE (`clientBroadcast: true`)
- Ejectable module
- **Events**: `progress.job.{created,started,updated,completed,failed,cancelled}`
- **Features**: `progress.{view,create,update,cancel,manage}`

### Integrations (`integrations`)

- Integration marketplace foundation
- Encrypted per-tenant credential store (resolution: direct → bundle → null)
- Integration registry (auto-discovered)
- Health monitoring, operation logs, status badges
- External ID mapping
- UMES extensibility: widget injection, subscribers, extensions, enrichers, interceptors, component replacement, menus, notifications, DOM bridge
- Integration bundles (one package → multiple integrations sharing credentials)
- **Events**: Integration lifecycle events
- **Features**: `integrations.{view,manage}`, `integrations.credentials.manage`

### Data Sync (`data_sync`)

- Streaming data sync hub for import/export integrations
- Adapter contract interface (`DataSyncAdapter`)
- Run lifecycle: `pending → running → completed/failed/cancelled`
- Three queue types with configurable worker concurrency
- External ID mapping service
- Schedule management, validation, progress delivery
- **Events**: `data_sync.run.{started,completed,failed,cancelled}`
- **Features**: `data_sync.{view,run,configure}`

### Messages (`messages`)

- Internal messaging system
- Attachments, actions, email forwarding
- Message object previews (rich entity references)
- Read/unread tracking, archiving
- **Events**: `messages.message.{sent,read,marked_unread,archived,unarchived,deleted,action_taken,email_sent,email_failed}`
- **Features**: `messages.{view,compose,attach,attach_files,email,actions,manage}`

### Entity Translations (`translations`)

- System-wide entity translation storage
- Locale overlay for CRUD API responses
- Locale management
- Integrates with any module declaring `translations.ts`
- **Features**: `translations.{view,manage}`, `translations.manage_locales`

---

## Specialty Packages

### `@open-mercato/content` — Static Pages

- Privacy Policy, Terms of Service, legal pages
- Auto-discovered via frontend convention
- Stateless components, i18n-first
- Shared `ContentLayout` component
- Translations: en, de, es, pl

### `@open-mercato/onboarding` — Tenant Provisioning

- Guided tenant bootstrap experience
- Idempotent wizard steps (safe to re-run)
- GET/POST per step with predecessor validation
- Verification and admin notification emails
- Hooks into module `setup.ts` lifecycle:
  - `onTenantCreated` — after tenant/org creation
  - `seedDefaults` — structural data during init
  - `seedExamples` — sample data (skippable with `--no-examples`)

### `@open-mercato/scheduler` — Scheduled Jobs

- Database-backed scheduling for recurring and delayed jobs
- Cron expression and interval parsing
- Next-run calculation
- Admin UI: list, create, edit, view job details
- Execution history and log modals
- CLI commands for job management
- **Exports**: `ScheduledJob`, `SchedulerService`, `parseCronExpression`, `validateCron`, `parseInterval`, `calculateNextRun`

### `@open-mercato/events` — Event Bus

- See [Event Bus & Real-Time](#event-bus--real-time-dom-event-bridge) section

---

## Infrastructure Packages

### `@open-mercato/shared` — Cross-Cutting Utilities

| Directory | What's Inside |
|-----------|--------------|
| `lib/api/` | Scoped API payloads, request helpers |
| `lib/boolean/` | Boolean parsing from env/query params (`parseBooleanToken`, `parseBooleanWithDefault`) |
| `lib/commands/` | Undo/redo command pattern framework (`registerCommand`) |
| `lib/crud/` | CRUD route factories, API interceptor types, response enricher types |
| `lib/custom-fields/` | Custom field payload helpers |
| `lib/data/` | `DataEngine`, `QueryEngine` types, query extensibility hooks |
| `lib/di/` | Awilix DI helpers |
| `lib/encryption/` | `findWithDecryption`, `findOneWithDecryption` (mandatory for all queries) |
| `lib/i18n/` | `useT()` (client), `resolveTranslations()` (server), locale management |
| `lib/indexers/` | Query index helpers |
| `lib/modules/` | Module registry types |
| `lib/openapi/` | CRUD OpenAPI spec generators |
| `lib/profiler/` | Performance profiling (`OM_PROFILE`) |
| `lib/testing/` | Test bootstrap utilities |
| `modules/widgets/` | `InjectionPosition`, widget DSL helpers |
| `modules/events/` | Event types, `isBroadcastEvent`, `isPortalBroadcastEvent` |

### `@open-mercato/ui` — UI Components

| Area | Components |
|------|-----------|
| **CrudForm** | Form builder with Zod validation, field injection, `createCrud`/`updateCrud`/`deleteCrud`, `createCrudFormError` |
| **DataTable** | List views with filters, sorting, pagination, CSV export, row/bulk actions, column injection |
| **Backend Pages** | `apiCall`/`apiCallOrThrow`, `LoadingMessage`, `ErrorMessage`, `FormHeader`, `FormFooter` |
| **Primitives** | `Spinner`, `Button`, `IconButton` (never raw `<button>`) |
| **Injection Hooks** | `useInjectionDataWidgets`, `useInjectedMenuItems`, `useRegisteredComponent`, `useAppEvent`, `useOperationProgress` |
| **Portal** | `PortalShell`, `useCustomerAuth`, `useTenantContext`, `usePortalInjectedMenuItems`, `usePortalEventBridge`, `usePortalAppEvent` |
| **Guarded Mutations** | `useGuardedMutation` for non-CrudForm write operations |

### `@open-mercato/cache` — Caching Abstraction

| Strategy | Use Case |
|----------|----------|
| Memory | Development, single-process |
| SQLite | Single-server production |
| Redis | Multi-server production |

- Always resolve via DI (`container.resolve('cacheService')`)
- Always scope cache keys to tenant
- Tag-based invalidation for targeted clearing
- Never cache sensitive data without encryption

### `@open-mercato/queue` — Background Jobs

| Strategy | Backing | Use Case |
|----------|---------|----------|
| Local | File-based | Development |
| BullMQ | Redis | Production |

- Workers must be idempotent (jobs may be retried)
- Concurrency guidelines: I/O-bound 5–10, CPU-bound 1–2, DB-heavy 3–5, max 20
- Worker metadata: `{ queue, id?, concurrency? }`

### `@open-mercato/cli` — Generators & Tooling

Auto-discovers all module files across packages and `apps/mercato/src/modules/`, producing:
- `modules.generated.ts` — module registry
- `entities.generated.ts` — entity registry
- `di.generated.ts` — DI registrations
- `entities.ids.generated.ts` — entity ID constants
- Dashboard/injection widget aggregations
- `ai-tools.generated.ts` — AI tool registry
- Custom outputs via `generators.ts` plugin declarations

### `@open-mercato/create-app` — Standalone Scaffolding

- `npx create-mercato-app my-project`
- Template sync with monorepo layouts
- Verdaccio-based testing for pre-publish validation
- Module ejection: `yarn mercato eject <module>`

---

## Universal Module Extension System (UMES)

UMES is the crown jewel of the extensibility architecture. A unified, DOM-inspired framework for extending any UI surface, intercepting any mutation, transforming any API response, and replacing any component — **all without touching core code**.

### 14 Extension Mechanisms (Phases A–N)

| Phase | Mechanism | What It Does |
|-------|-----------|-------------|
| **A** | **Widget Injection** | Inject headless or visual widgets into named slots (`InjectionPosition.before/after/replace`) |
| **B** | **Menu Injection** | Add items to sidebars, topbar, profile dropdown via `useInjectedMenuItems` + `mergeMenuItems` |
| **C** | **Events & DOM Bridge** | Stream server events to browser via SSE (`clientBroadcast: true`), consume with `useAppEvent` |
| **D** | **Response Enrichers** | Enrich other modules' API responses with additional data (federation pattern) |
| **E** | **API Interceptors** | Before/after hooks on any CRUD route with Zod re-validation, query rewriting, rejection |
| **F** | **DataTable Extensions** | Inject columns, row actions, bulk actions, filters into any DataTable |
| **G** | **CrudForm Fields** | Inject form fields into any CrudForm via triad pattern |
| **H** | **Component Replacement** | Replace, wrap, or override props of any component via stable handle IDs |
| **I** | **Detail Page Bindings** | Inject tabs, sections, fields into entity detail pages |
| **J** | **Recursive Widgets** | Widgets that contain other widget slots |
| **K** | **DevTools** | Developer tools for inspecting active injections |
| **L** | **Integration Extensions** | Marketplace-specific widget patterns |
| **M** | **Mutation Lifecycle** | Hooks into create/update/delete lifecycle: guards, sync subscribers, client filtering, command interceptors |
| **N** | **Query Engine Extensibility** | Custom query scoping and enrichment via `QueryOptions.extensions` |

### Widget Injection Spot IDs (Frozen)

```
menu:sidebar:main           menu:sidebar:settings        menu:sidebar:profile
menu:topbar:actions         menu:topbar:profile-dropdown
data-table:<entityId>       crud-form:<entityId>:fields
integration-detail:<integrationId>
```

### Component Replacement Modes

| Mode | Behavior |
|------|----------|
| `replace` | Fully replace the original component |
| `wrapper` | Wrap the original (receives it as `children`) |
| `props` | Override/merge props passed to the original |

Handle format: `page:*`, `data-table:*`, `crud-form:*`, `section:*`

---

## Integration Marketplace & Connector Framework

A centralized marketplace where every external connector is an npm-installable Open Mercato module.

### Architecture: Hub + Spoke

```
Core Foundation
├── Credentials API (encrypted per-tenant secret store)
├── Operation Logs (structured logging with admin UI timeline)
├── Integration Registry (auto-discovered from integration.ts)
├── Health Monitoring
└── Integration Bundles (one package → multiple integrations sharing credentials)

Hub Modules (define adapter contracts)
├── Payment Gateways Hub
├── Shipping Carriers Hub
├── Communication Hub
├── Notification Hub
├── Storage Hub
├── Data Sync Hub
└── Webhook Hub

Spoke Modules (each is its own npm package)
├── packages/gateway-payu/
├── packages/carrier-inpost/
└── ...
```

### Key Services (DI-Registered)

| Service | Purpose |
|---------|---------|
| `CredentialsService` | Encrypted per-tenant credential store (resolution: direct → bundle → null) |
| `StateService` | Integration state management |
| `LogService` | Structured operation logging |
| `HealthService` | Integration health checks |
| `SyncRunService` | Data sync run lifecycle management |
| `SyncEngine` | Data sync execution engine |
| `ExternalIdMappingService` | Cross-system ID mapping |

### Data Sync Hub

- `DataSyncAdapter` contract interface
- Run lifecycle: `pending → running → completed/failed/cancelled`
- Three queue types with configurable worker concurrency
- Progress delivery via top bar polling, job lifecycle, and SSE DOM bridge
- Schedule management and mapping APIs

---

## RBAC & Security

### Two-Layer Permission Model

```
Layer 1: Role ACLs
  └── Role has a set of feature permissions (e.g., auth.users.view, notifications.manage)

Layer 2: User ACL Overrides
  └── Per-user grants/revokes that override role defaults

Resolution: User ACL override > Role ACL > denied
```

### Feature ID Convention
```
<module>.<action>       e.g., audit_logs.view_self, business_rules.execute
```

### Declarative Guards (Page Metadata)
```typescript
export const metadata = {
  requireAuth: true,
  requireFeatures: ['business_rules.view'],
  // Portal pages:
  requireCustomerAuth: true,
  requireCustomerFeatures: ['orders.view'],
};
```

### Security Features

| Feature | Detail |
|---------|--------|
| Field-level encryption | PII/GDPR fields encrypted at rest, queried via `findWithDecryption` |
| Password hashing | bcryptjs, cost ≥10 |
| JWT authentication | Short-lived tokens with session management |
| Account lockout | Configurable attempt limits |
| Rate limiting | Request-level rate limiting |
| Minimal error messages | Auth endpoints never reveal if email exists |
| Two-cookie strategy | Portal: JWT + session token |
| Magic links | Passwordless login for customer portal |
| API keys | Programmatic access management |
| Audit logs | Full mutation audit trail with undo/redo |

---

## Customer Portal

A complete customer-facing portal framework, separate from the admin backend:

| Feature | Detail |
|---------|--------|
| Auth flows | Login, Signup, Magic Link, Password Reset, Email Verification, Invitation |
| RBAC | Customer roles (Portal Admin, Buyer, Viewer) with feature-based permissions |
| Layout | `PortalShell` with nav injection |
| Hooks | `useCustomerAuth`, `useTenantContext`, `usePortalInjectedMenuItems` |
| Events | `usePortalEventBridge`, `usePortalAppEvent` (portal-specific SSE bridge) |
| CRM linking | Auto-links customer accounts to CRM people via event subscribers |
| Page discovery | Same auto-discovery as backend, but under `frontend/` paths |

---

## Event Bus & Real-Time (DOM Event Bridge)

### Event Declaration
```typescript
export const eventsConfig = createModuleEvents('example', {
  'example.todo.created': { label: 'Todo Created', description: '...' },
  'example.todo.updated': { label: 'Todo Updated', description: '...' },
} as const);
```

### Subscription Types

| Type | Delivery | Retry | Use Case |
|------|----------|-------|----------|
| **Ephemeral** | Real-time, in-process | No | UI updates, cache invalidation |
| **Persistent** | Stored, queued | Yes | Audit logs, sync triggers, notifications |

### Sync Event Subscribers

Subscribers can run **synchronously within the request pipeline**:
- Before-create: inject default values, validate, reject
- Before-update: block invalid state transitions
- Returns `modifiedPayload` to alter incoming data or rejection with status code

### DOM Event Bridge (SSE)

- Server events streamed to browser via Server-Sent Events
- Enable: `clientBroadcast: true` in event definition
- Consume: `useAppEvent(eventId, handler)` in any component
- Portal variant: `portalBroadcast: true` + `usePortalAppEvent`
- Heartbeat every 30s, max payload 4096 bytes, 500ms deduplication
- `useOperationProgress` for tracking long-running async operations

---

## Caching

Three strategy options resolved via DI:

| Strategy | Use Case |
|----------|----------|
| Memory | Development, single-process |
| SQLite | Single-server production |
| Redis | Multi-server production |

- Tenant-scoped cache keys (or `runWithCacheTenant()`)
- Tag-based invalidation for targeted clearing
- Never cache sensitive data without encryption

---

## Background Jobs & Workers

| Strategy | Backing | Use Case |
|----------|---------|----------|
| Local | File-based | Development |
| BullMQ | Redis | Production |

**Worker Contract:**
```typescript
export const metadata = { queue: 'my-queue', concurrency: 5 };
export default async function handler(job) { /* idempotent */ }
```

**Concurrency Guidelines:** I/O-bound 5–10, CPU-bound 1–2, DB-heavy 3–5, max 20

---

## Scheduled Jobs

`@open-mercato/scheduler` provides database-backed scheduling:

- Cron expressions and interval-based scheduling
- Next-run calculation and recalculation
- Admin UI: job list, create, edit, detail view, execution logs
- CLI commands for management
- Tenant-scoped job isolation

---

## CLI & Code Generation

```bash
yarn dev                    # Start development server
yarn build                  # Build everything
yarn build:packages         # Build packages only
yarn generate               # Run module generators (auto-discovers all module files)
yarn db:generate            # Generate database migrations (never hand-write!)
yarn db:migrate             # Apply migrations
yarn initialize             # Full project initialization
yarn dev:greenfield         # Fresh dev environment setup
yarn dev:ephemeral          # Single-line ephemeral dev with Docker
yarn test                   # Run unit tests
yarn test:integration       # Run Playwright integration tests
yarn test:integration:report # View HTML test report
```

---

## i18n & Entity Translations

| Context | API |
|---------|-----|
| Client-side | `useT()` from `@open-mercato/shared/lib/i18n/context` |
| Server-side | `resolveTranslations()` from `@open-mercato/shared/lib/i18n/server` |

- All user-facing strings in `i18n/<locale>.json` per module
- Entity field translations via `translations.ts` at module root + `translations` module
- Supported locales: `en`, `de`, `es`, `pl`
- Never hard-code user-facing strings

---

## Testing Infrastructure

### Unit Tests (Jest)
- Per-module `__tests__/` directories
- Zod schema validation, command logic, utility tests

### Integration Tests (Playwright)
- Located in `__integration__/TC-{CATEGORY}-{XXX}.spec.ts`
- Self-contained: create fixtures in setup, clean up in teardown
- No reliance on seeded/demo data

### Reusable Test Helpers

| Helper | Purpose |
|--------|---------|
| `auth` | Login, `DEFAULT_CREDENTIALS` |
| `api` | `getAuthToken`, `apiRequest` |
| `authFixtures` | Role/user creation |
| `generalFixtures` | General utilities |

### Default Test Credentials

| Role | Email | Password |
|------|-------|----------|
| Superadmin | superadmin@acme.com | secret |
| Admin | admin@acme.com | secret |
| Employee | employee@acme.com | secret |

---

## Enterprise Edition Modules

Commercial enterprise-only modules (require `OM_ENABLE_ENTERPRISE_MODULES`):

### Security (`security`) — MFA, Sudo, Enforcement

- **Three MFA methods**: TOTP authenticator, Passkeys/WebAuthn, OTP email
- **Pluggable provider architecture**: custom SMS, push notifications, hardware tokens
- **MFA enforcement**: configurable by scope (platform, tenant, organization)
- **Sudo challenge system**: elevated re-authentication for critical operations
- **Developer sudo API**: `requireSudo`, `withSudoProtection` for module authors
- **MFA admin management**: user reset, compliance reporting
- Non-invasive: integrates via API interceptors and component replacement (no core auth changes)
- 11 commands, 12+ API routes, 8 email templates, full i18n
- **Key exports**: `ChallengeMethod`, `MfaProviderInterface`, `requireSudo`, `SudoProvider`, `useSudoChallenge`

### Record Locks (`record_locks`) — Conflict Resolution

- **Pessimistic mode**: block competing edits
- **Optimistic mode**: allow parallel editing + detect conflicts
- **Participant ring**: multiple active participants with presence tracking
- Conflict resolution strategies: `accept_incoming`, `accept_mine`, `merged`
- Background cleanup of expired locks
- 6 API endpoints, 2 entities, UI injection widgets (lock banners, conflict dialog, participant presence)
- 10 typed module events, 8 notification types with client-side renderers
- Settings management UI

### SSO (`sso`) — Single Sign-On & Directory Sync

- **Multi-protocol**: OIDC (Authorization Code + PKCE) and SAML 2.0
- Per-organization IdP configuration
- **Home Realm Discovery** (email-domain routing)
- **JIT provisioning** (account creation on first SSO login)
- **SCIM 2.0** endpoint for user lifecycle + group sync
- Account linking (SSO identity → existing user)
- SSO enforcement per organization
- SP metadata & certificate generation + rotation
- **Supported IdPs (V1)**: Microsoft Entra ID, Google Workspace, Keycloak

### System Status Overlays (`system_status_overlays`)

- Enterprise-specific UI widgets and overlays for system/status pages
- Injected components for monitoring/ops dashboards

---

## Backward Compatibility Contract

13 contract surface categories with strict enforcement:

| # | Surface | Classification | Key Rule |
|---|---------|---------------|----------|
| 1 | Auto-discovery file conventions | **FROZEN** | File names, export names, routing algorithms immutable |
| 2 | Type definitions & interfaces | STABLE | Required fields cannot be removed/narrowed |
| 3 | Function signatures | STABLE | Cannot remove/reorder params |
| 4 | Import paths | STABLE | Moved modules must re-export from old path |
| 5 | Event IDs | **FROZEN** | Cannot rename/remove; payload additive-only |
| 6 | Widget injection spot IDs | **FROZEN** | Cannot rename/remove |
| 7 | API route URLs | STABLE | Cannot rename/remove; response additive-only |
| 8 | Database schema | ADDITIVE-ONLY | No column/table rename/remove |
| 9 | DI service names | STABLE | Cannot rename registration keys |
| 10 | ACL feature IDs | **FROZEN** | Stored in DB; rename = data migration |
| 11 | Notification type IDs | **FROZEN** | Referenced by subscribers, stored in DB |
| 12 | CLI commands | STABLE | Cannot rename/remove commands or required flags |
| 13 | Generated file contracts | STABLE | Export names and BootstrapData shape immutable |

**Deprecation Protocol**: (1) never remove in one release → (2) `@deprecated` JSDoc → (3) bridge for ≥1 minor version → (4) document in RELEASE_NOTES → (5) reference spec with migration section.

---

## Standalone App Scaffolding

```bash
npx create-mercato-app my-project
```

- Full standalone app with all core modules
- Template sync with monorepo layouts
- Verdaccio-based testing workflow for pre-publish validation
- Generators scan `node_modules/@open-mercato/*/dist/modules/` for discovery
- Eject core modules for deep customization: `yarn mercato eject <module>`

---

## AI-Driven Development Workflow

The framework includes a comprehensive AI-assisted development system with 14 skills:

| Skill | Purpose |
|-------|---------|
| `spec-writing` | Create architecturally compliant specifications |
| `implement-spec` | Execute spec phases with coordinated agents and code-review gates |
| `pre-implement-spec` | BC impact analysis, risk assessment, gap analysis before implementation |
| `integration-builder` | Scaffold and implement integration provider packages |
| `integration-tests` | Convert markdown test cases to Playwright specs |
| `code-review` | Architecture, security, conventions, quality compliance checks |
| `backend-ui-design` | Backend UI design guidance |
| `create-agents-md` | Generate AGENTS.md for new modules |
| `skill-creator` | Author new skills |
| `fix-specs` | Fix specification issues |
| `dev-container-maintenance` | Dev container management |
| `claude` | Claude-specific configurations |
| `codex` | Codex integration |

Self-improving: `.ai/lessons.md` captures corrections to prevent recurring mistakes.

---

## Example Module — Reference Implementation

The `example` module (`apps/mercato/src/modules/example/`) is a production-grade reference demonstrating every platform pattern:

### What It Covers

| Pattern | Demonstration |
|---------|--------------|
| **CRUD with Custom Fields** | Full Todo entity with 7+ field types: text, integer, boolean, select, multi-select, multiline/markdown, attachment upload |
| **Command Pattern + Undo** | Create/Update/Delete commands with snapshots, audit logging, custom field diffing |
| **API Routes (makeCrudRoute)** | Pagination, sorting, filtering, CSV export, custom field integration, RBAC checks |
| **API Interceptors** | 5 interceptors: block patterns, timeout probes, crash handling, query rewriting, wildcard matching |
| **Sync Event Subscribers** | Before-create default injection, before-update state transition blocking |
| **Response Enrichers** | Cross-module data federation (adds `_example` data to other entities, N+1-safe) |
| **Widget Injection** | Portal dashboard widgets, DataTable column injection, CrudForm field injection, menu items, dashboard widgets |
| **Component Replacement** | Wrapper mode on Notes section via stable component handle |
| **Events + DOM Bridge** | `example.todo.{created,updated,deleted}` with `clientBroadcast: true` |
| **Notifications + Handlers** | Actionable notification type with reactive handler, toast display, custom events |
| **Message Objects** | Inline entity previews in messaging system |
| **Custom Entities (ce.ts)** | Calendar and Todo entities with full field DSL |
| **CLI Commands** | `hello` demo + `seed-todos` with custom field installation |
| **Backend Pages** | Admin index, Todo list/create/edit, UMES mutation lifecycle testing page |
| **Frontend Pages** | Public page + dynamic blog routing |
| **Integration Tests** | Playwright tests for UMES phases (menu injection, CRUD, sync subscribers, mutation lifecycle) |
| **i18n** | 150+ translation keys across all features |
| **RBAC** | Feature-based access with role defaults in setup.ts |
| **Multi-tenancy** | Every entity includes `tenantId` + `organizationId` filtering |

---

## Spec Inventory

100+ specification documents across `.ai/specs/` and `.ai/specs/enterprise/`:

### Architecture & Extension System
- **SPEC-041** — Universal Module Extension System (14 phases, A–N) — the core extensibility framework
- SPEC-013 — Decouple Module Setup
- SPEC-018 — Safe Entity Flush
- SPEC-021 — Compound Commands Graph Save
- SPEC-035 — Mutation Guard Mechanism
- SPEC-036 — Application Request Lifecycle Events
- SPEC-042 — Multi-ID Query Parameter
- SPEC-043 — Reactive Notification Handlers
- SPEC-059 — Middleware Injection Registry

### Integration Marketplace
- **SPEC-045** — Integration Marketplace & Connector Framework (phases A–I)
- SPEC-044 — Payment Gateway Integrations
- SPEC-045a — Foundation (registry, credentials, logs)
- SPEC-045b — Data Sync Hub
- SPEC-045c — Payment & Shipping Hubs
- SPEC-057 — Webhooks Module

### Platform Modules
- SPEC-002 — Messages Module
- SPEC-003 — Notifications Module
- SPEC-004 — Progress Module
- SPEC-040 — Document Parser Module
- SPEC-048 — Notifications SSE Migration
- SPEC-049 — Message Objects Universal View

### UI & UX
- SPEC-001 — UI Reusable Components
- SPEC-007 — Sidebar Reorganization
- SPEC-016 — Form Headers/Footers
- SPEC-017 — Version History Panel
- SPEC-023 — Confirmation Dialog Migration
- SPEC-039 — Date Pickers

### Identity & Auth
- SPEC-060 — Customer Identity & Portal Auth
- SPEC-014 — Onboarding Activation Login
- SPEC-030 — Rate Limiting
- SPEC-038 — Invite User Email

### AI & Automation
- SPEC-012 — AI Assistant Schema Discovery
- SPEC-025 — AI-Assisted Business Rules
- SPEC-037 — Inbox Ops Agent
- SPEC-056 — WhatsApp AI Chat Integration

### DevOps & Quality
- SPEC-027 — Integration Testing Automation
- SPEC-034 — Dev Ephemeral Runtime
- SPEC-050 — Dev Container Setup / SonarQube Fixes
- SPEC-051 — SonarQube Code Deduplication
- SPEC-052 — Integration Test Coverage Quick Wins
- SPEC-054 — Docker Windows Parity

### Module Lifecycle & Publishing
- SPEC-061 — Official Modules Lifecycle Management
- SPEC-062 — Official Modules Development Monorepo
- SPEC-063 — Official Modules Verdaccio Prototyping
- SPEC-064 — Platform Versioning Policy
- SPEC-065 — CLI Install and Eject
- SPEC-066 — Changesets Release Workflow
- SPEC-067 — CLI Standalone App Support
- SPEC-068 — Use-Case Examples Framework

### Enterprise
- SPEC-ENT-001 — Security Module (MFA/Sudo/Enforcement)
- SPEC-ENT-002/004 — SSO & Directory Sync
- SPEC-ENT-003 — Record Locking
- SPEC-ENT-005 — Record Lock Extensibility
- SPEC-ENT-006 — QA Preview Deployment
- SPEC-ENT-007 — Auth Login Interceptors Extension
- SPEC-ENT-008 — MFA Challenge UI Component Registry
- SPEC-ENT-009 — MFA Enrollment Redirect Popup

---

## Summary: What Makes This Powerful

1. **22 Core Platform Modules** — Auth, customer accounts, portal, dashboards, directory, custom entities, configs, query index, audit logs, attachments, API keys, dictionaries, API docs, business rules, feature toggles, notifications, progress, integrations, data sync, messages, translations, scheduler.

2. **UMES (14 Extension Mechanisms)** — Inject, intercept, replace, enrich, wrap anything in the system without touching core code. Widget injection, menu injection, API interceptors, response enrichers, DataTable/CrudForm extensions, component replacement, mutation lifecycle hooks, query engine extensibility.

3. **Integration Marketplace Framework** — Hub+spoke architecture with encrypted credentials, operation logs, health monitoring. Each provider is its own npm package. Supports payment, shipping, communication, storage, data sync, and webhook integrations.

4. **Full Identity Stack** — Admin auth (JWT, RBAC, sessions) + Customer portal auth (magic links, invitations, two-cookie strategy, customer RBAC) + Enterprise SSO (OIDC, SAML, SCIM, JIT provisioning).

5. **Real-Time Event Architecture** — Server-to-browser SSE bridge, ephemeral and persistent subscriptions, sync subscribers that modify payloads in-flight, portal event bridge, typed events per module.

6. **Enterprise Security** — Field-level encryption, two-layer RBAC, MFA (TOTP/passkeys/OTP), sudo challenges, record locking with conflict resolution, audit logs with undo/redo, API keys, rate limiting.

7. **AI-Native Development** — MCP tools, AI assistant, 14 development skills, spec-driven workflow, self-improving lessons, 100+ specifications.

8. **Developer Experience** — Auto-discovery everywhere, CLI generators, ephemeral dev containers, Playwright integration tests, backward compatibility guarantees across 13 contract surfaces.

9. **Production Infrastructure** — Redis-backed queues, multi-strategy caching, scheduled jobs, progress tracking, business rules engine, feature toggles, multi-tenant directory.

10. **Standalone Deployability** — `create-mercato-app` scaffolds a full standalone app. Eject any module. Verdaccio-based pre-publish testing. Changesets release workflow.
