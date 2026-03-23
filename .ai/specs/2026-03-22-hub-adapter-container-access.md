# Hub Adapter Container Access

## TLDR

Hub adapters are stateless singletons registered at startup with zero access to request-scoped DI services. Real-world adapters need to resolve services like `EntityManager`, logging, and provider-specific clients at call time. This spec adds an `AdapterContext` type to `@open-mercato/shared/lib/hub` and threads an optional `ctx?` parameter through adapter interface methods and their callers.

**Key points:**
- New `AdapterContext` type exported from `@open-mercato/shared/lib/hub` — includes `resolve`, `logger`, and `scope`
- Optional `ctx?` parameter added to all adapter interface methods that perform real work
- Callers (sync engine, API routes) build `ctx` from DI container and pass it through
- 100% backward compatible: all changes additive, existing adapters work unchanged
- Scope: DataSyncAdapter + NotificationChannelAdapter (implemented interfaces); convention prescribed for all future adapters
- Updates integration-builder skill, integration-tests skill, and framework docs to reflect new pattern

**Concerns:**
- Must not break existing adapter implementations (BC Surface #2 Type Definitions, #3 Function Signatures)
- Must not change hub API itself (`register`/`get`/`list`/`clear` unchanged)
- Must align with existing framework context patterns (workers, subscribers, workflows)

## Overview

### What

Add a standard `AdapterContext` type that gives hub adapter methods access to the DI container, a structured logger, and tenant scope — consistent with how workers (`JobContext`), subscribers (`SubscriberContext`), and workflows (`WorkflowTools`) receive framework services.

### Why

Hub adapters are registered as stateless singletons via `defineHub<T>()`. They have no reference to the request-scoped DI container. Adapters that need an `EntityManager`, logging, provider-specific services, or tenant-scoped config must either:
1. Receive everything through their method input objects (bloating interfaces), or
2. Use module-scoped workarounds (globals, closures over root-scoped containers)

Both patterns break down as adapters grow more complex. The framework already solves this for workers, subscribers, and workflows — adapters should follow the same pattern.

### Market reference

- **Vendure**: `Injector.get()` at init-time + `RequestContext` (channel/user/language) per-call
- **MedusaJS**: Module-scoped DI container at construction + data DTOs per-call
- **NestJS**: Constructor DI + `ModuleRef.resolve()` for lazy/scoped resolution

All major commerce frameworks provide adapters with both DI access and request context. Open Mercato's adapter pattern is the gap.

## Problem Statement

1. **No DI access**: Adapters retrieved via `dataSyncHub.get(providerKey)` are plain objects with no reference to the Awilix container. Methods like `streamImport()` cannot resolve `EntityManager`, custom services, or provider-specific clients.

2. **Inconsistency with framework patterns**: Workers receive `{ resolve }`, subscribers receive `{ resolve, eventName }`, workflows receive `{ resolve, logger, run, step }`. Adapters are the only extension point with zero framework context.

3. **Logging blind spot**: Adapter methods performing external API calls (HTTP, SDK) have no structured logger. The sync engine logs around adapter calls but the adapter itself cannot log internal operations.

4. **Scope threading**: Every adapter method receives `scope: TenantScope` in its input object. This is redundant when the caller already knows the scope and could provide it via context — matching how Vendure's `RequestContext.channel` works.

## Proposed Solution

### Design Decisions

1. **Optional `ctx?` parameter** — not mandatory. Existing adapters that don't need DI continue to work unchanged. New adapters opt in by accepting `ctx`.

2. **Three fields on `AdapterContext`** — `resolve` (DI), `logger` (structured logging), `scope` (tenant identity). These are the three things the framework guarantees at every call site. Everything else is resolvable via `resolve()`.

3. **Inline types only** — `AdapterContext` and `AdapterLogger` are self-contained types in `@open-mercato/shared/lib/hub`. No external imports needed. This keeps the hub package dependency-free.

4. **Hub API unchanged** — `register()`, `get()`, `list()`, `clear()` are not modified. Context is passed at call time, not registration time. Adapters remain stateless singletons.

5. **Convention for all future adapters** — Every new adapter interface (payment, shipping, storage, webhook, etc.) MUST include `ctx?: AdapterContext` on methods that perform I/O or resolve services, even if the initial implementation ignores it.

### Alternatives Considered

| Alternative | Why rejected |
|---|---|
| Inject container at registration time | Makes adapters request-scoped; breaks singleton model; hub API change |
| Pass full Awilix container | Leaks implementation detail; not testable with plain objects |
| Extend method input objects with `resolve` | Mixes framework concerns into domain DTOs; each interface diverges |
| Only `{ resolve }` (minimal) | Inconsistent with workflows (which include `logger`); forces boilerplate `ctx.resolve('logger')` in every adapter |

## Architecture

### Type Definitions

```typescript
// packages/shared/src/lib/hub/index.ts — new exports

export type AdapterLogger = {
  info(message: string, data?: Record<string, unknown>): void
  warn(message: string, data?: Record<string, unknown>): void
  error(message: string, data?: Record<string, unknown>): void
  debug(message: string, data?: Record<string, unknown>): void
}

export type AdapterContext = {
  resolve: <T = unknown>(name: string) => T
  logger: AdapterLogger
  scope: {
    organizationId: string
    tenantId: string
  }
}
```

### Context Flow

```
┌─────────────────────┐
│  Worker / API Route  │  ← has DI container + auth/scope
└─────────┬───────────┘
          │ builds ctx = { resolve, logger, scope }
          ▼
┌─────────────────────┐
│    Sync Engine       │  ← receives ctx via deps.resolve
│    (or direct call)  │
└─────────┬───────────┘
          │ passes ctx to adapter methods
          ▼
┌─────────────────────┐
│  Hub Adapter         │  ← uses ctx.resolve('em'), ctx.logger.info(...)
│  (stateless)         │
└─────────────────────┘
```

### Context Construction Sites

| Caller | How `resolve` is built | How `scope` is built |
|--------|----------------------|---------------------|
| Sync engine (via worker) | `deps.resolve` from `EngineDeps` (Awilix cradle proxy) | `scope` parameter of `runImport`/`runExport` |
| API route (`validate.ts`) | `container.resolve` from `createRequestContainer()` | `auth.orgId` + `auth.tenantId` from request |
| Future direct callers | `container.resolve` or cradle proxy | Extracted from auth or job payload |

### Interface Changes

**DataSyncAdapter** — add `ctx?` to all 5 methods:

```typescript
// packages/core/src/modules/data_sync/lib/adapter.ts
import type { AdapterContext } from '@open-mercato/shared/lib/hub'

export interface DataSyncAdapter {
  readonly providerKey: string
  readonly direction: 'import' | 'export' | 'bidirectional'
  readonly supportedEntities: string[]

  streamImport?(input: StreamImportInput, ctx?: AdapterContext): AsyncIterable<ImportBatch>
  streamExport?(input: StreamExportInput, ctx?: AdapterContext): AsyncIterable<ExportBatch>
  getInitialCursor?(input: { entityType: string; scope: TenantScope }, ctx?: AdapterContext): Promise<string | null>
  getMapping(input: { entityType: string; scope: TenantScope }, ctx?: AdapterContext): Promise<DataMapping>
  validateConnection?(input: {
    entityType: string
    credentials: Record<string, unknown>
    mapping: DataMapping
    scope: TenantScope
  }, ctx?: AdapterContext): Promise<ValidationResult>
}
```

**NotificationChannelAdapter** — add `ctx?` to `send`:

```typescript
// apps/mercato/src/modules/notification_channels/lib/adapter.ts
import type { AdapterContext } from '@open-mercato/shared/lib/hub'

export interface NotificationChannelAdapter {
  readonly providerKey: string
  readonly channelType: 'email' | 'sms' | 'push' | 'webhook'
  send(input: SendNotificationInput, ctx?: AdapterContext): Promise<SendNotificationResult>
}
```

### Caller Wiring

**Sync Engine** (`sync-engine.ts`):

```typescript
// Add to EngineDeps:
type EngineDeps = {
  em: EntityManager
  syncRunService: SyncRunService
  integrationCredentialsService: CredentialsService
  integrationLogService: IntegrationLogService
  progressService: ProgressService
  resolve: <T = unknown>(name: string) => T
}

// Inside createSyncEngine, add helper:
function buildAdapterContext(scope: SyncScope): AdapterContext {
  return {
    resolve: deps.resolve,
    logger: {
      info: (msg, data) => console.log(`[data-sync] ${msg}`, data ? JSON.stringify(data) : ''),
      warn: (msg, data) => console.warn(`[data-sync] ${msg}`, data ? JSON.stringify(data) : ''),
      error: (msg, data) => console.error(`[data-sync] ${msg}`, data ? JSON.stringify(data) : ''),
      debug: (msg, data) => { if (process.env.NODE_ENV !== 'production') console.debug(`[data-sync] ${msg}`, data ? JSON.stringify(data) : '') },
    },
    scope: { organizationId: scope.organizationId, tenantId: scope.tenantId },
  }
}

// Update resolveMapping:
async function resolveMapping(adapter: DataSyncAdapter, entityType: string, scope: SyncScope, ctx: AdapterContext): Promise<DataMapping> {
  return adapter.getMapping({
    entityType,
    scope: { organizationId: scope.organizationId, tenantId: scope.tenantId },
  }, ctx)
}

// In runImport (line ~289-294):
const ctx = buildAdapterContext(scope)
const mapping = await resolveMapping(adapter, run.entityType, scope, ctx)
// ...
for await (const batch of adapter.streamImport({ ... }, ctx)) {

// In runExport (line ~418-422):
const ctx = buildAdapterContext(scope)
const mapping = await resolveMapping(adapter, run.entityType, scope, ctx)
// ...
for await (const batch of adapter.streamExport({ ... }, ctx)) {
```

**DI Registration** (`di.ts`):

```typescript
dataSyncEngine: asFunction(({ em, dataSyncRunService, integrationCredentialsService, integrationLogService, progressService, ...cradle }: Cradle & {
  dataSyncRunService: ReturnType<typeof createSyncRunService>
}) => createSyncEngine({
  em,
  syncRunService: dataSyncRunService,
  integrationCredentialsService,
  integrationLogService,
  progressService,
  resolve: <T = unknown>(name: string) => (cradle as Record<string, unknown>)[name] as T,
})).scoped().proxy(),
```

**API Route** (`validate.ts`):

```typescript
import type { AdapterContext } from '@open-mercato/shared/lib/hub'

// After container creation (line ~39):
const ctx: AdapterContext = {
  resolve: <T = unknown>(name: string) => container.resolve(name) as T,
  logger: {
    info: (msg, data) => console.log(`[data-sync:validate] ${msg}`, data ? JSON.stringify(data) : ''),
    warn: (msg, data) => console.warn(`[data-sync:validate] ${msg}`, data ? JSON.stringify(data) : ''),
    error: (msg, data) => console.error(`[data-sync:validate] ${msg}`, data ? JSON.stringify(data) : ''),
    debug: () => {},
  },
  scope: { organizationId: auth.orgId as string, tenantId: auth.tenantId },
}

// Pass ctx to adapter calls (lines 50, 62):
const mapping = await adapter.getMapping({ entityType, scope: { ... } }, ctx)
const result = await adapter.validateConnection({ ... }, ctx)
```

### Adapter Author Usage

```typescript
import type { AdapterContext } from '@open-mercato/shared/lib/hub'
import type { DataSyncAdapter } from '@open-mercato/core/modules/data_sync/lib/adapter'

export function createMyProviderAdapter(): DataSyncAdapter {
  return {
    providerKey: 'my-provider',
    direction: 'import',
    supportedEntities: ['products'],

    async *streamImport(input, ctx) {
      // Use DI to resolve request-scoped services
      const em = ctx!.resolve<EntityManager>('em')
      const myService = ctx!.resolve<MyService>('myProviderService')

      // Use structured logger
      ctx!.logger.info('Starting import', { entityType: input.entityType })

      // scope is available without extracting from input
      ctx!.logger.debug('Tenant context', { org: ctx!.scope.organizationId })

      const items = await myService.fetchProducts(input.credentials)
      yield { items, cursor: 'done', hasMore: false, batchIndex: 0 }
    },

    async getMapping(input) {
      // Methods that don't need DI simply ignore ctx
      return { entityType: input.entityType, fields: [], matchStrategy: 'externalId' }
    },
  }
}
```

## Migration & Backward Compatibility

### BC Surface Analysis

| Surface | Classification | Impact | Verdict |
|---------|---------------|--------|---------|
| #2 Type Definitions | STABLE | Adding optional `ctx?` parameter to interface methods | **Safe** — optional additions allowed |
| #3 Function Signatures | STABLE | New optional parameter at end of method signatures | **Safe** — "new optional params OK" |
| #4 Import Paths | STABLE | New exports (`AdapterContext`, `AdapterLogger`) from existing path | **Safe** — additive |
| #1 Auto-Discovery | FROZEN | No changes | **N/A** |
| #5 Event IDs | FROZEN | No changes | **N/A** |

### Migration Impact

- **Existing adapter implementations**: Zero changes required. `ctx` is optional; adapters that don't destructure it continue to compile and run.
- **Existing callers**: Must be updated to pass `ctx`. This is internal framework code (sync engine, API routes), not third-party code.
- **Existing tests**: Must add `resolve` mock to `EngineDeps`. Minimal change — one line per test.

## Implementation Plan

### Phase 1: Type Foundation

Add `AdapterContext` and `AdapterLogger` types to the hub package.

**Step 1.1**: Add types to `packages/shared/src/lib/hub/index.ts`
- Add `AdapterLogger` type (4 methods: info, warn, error, debug)
- Add `AdapterContext` type (`resolve` + `logger` + `scope`)
- Export both types
- No changes to existing hub code (`defineHub`, `Hub<T>`, etc.)

**Files**: `packages/shared/src/lib/hub/index.ts`

### Phase 2: Interface Updates

Add `ctx?: AdapterContext` to implemented adapter interfaces.

**Step 2.1**: Update `DataSyncAdapter` interface
- Import `AdapterContext` from `@open-mercato/shared/lib/hub`
- Add `ctx?: AdapterContext` as last parameter to: `streamImport`, `streamExport`, `getInitialCursor`, `getMapping`, `validateConnection`

**Files**: `packages/core/src/modules/data_sync/lib/adapter.ts`

**Step 2.2**: Update `NotificationChannelAdapter` interface
- Import `AdapterContext` from `@open-mercato/shared/lib/hub`
- Add `ctx?: AdapterContext` as last parameter to: `send`

**Files**: `apps/mercato/src/modules/notification_channels/lib/adapter.ts`

### Phase 3: Caller Wiring

Wire callers to build and pass `ctx`.

**Step 3.1**: Update sync engine
- Add `resolve` to `EngineDeps` type
- Add `buildAdapterContext(scope)` helper inside `createSyncEngine`
- Update `resolveMapping` to accept and forward `ctx`
- Pass `ctx` to `adapter.streamImport()` in `runImport` (line 294)
- Pass `ctx` to `adapter.getMapping()` via `resolveMapping` in `runImport` (line 289)
- Pass `ctx` to `adapter.streamExport()` in `runExport` (line 422)
- Pass `ctx` to `adapter.getMapping()` via `resolveMapping` in `runExport` (line 418)

**Files**: `packages/core/src/modules/data_sync/lib/sync-engine.ts`

**Step 3.2**: Update DI registration
- Pass `resolve` function from Awilix cradle to `createSyncEngine`

**Files**: `packages/core/src/modules/data_sync/di.ts`

**Step 3.3**: Update API route
- Build `AdapterContext` from request container + auth scope
- Pass `ctx` to `adapter.getMapping()` (line 50) and `adapter.validateConnection()` (line 62)

**Files**: `packages/core/src/modules/data_sync/api/validate.ts`

### Phase 4: Test Updates

**Step 4.1**: Update sync engine tests
- Add `resolve` mock to `createSyncEngine` deps in `sync-engine.test.ts`
- Add `resolve` mock to `createSyncEngine` deps in `sync-engine-import-failures.test.ts`
- Mock should throw on unexpected resolution: `resolve: () => { throw new Error('unexpected resolve') }`

**Files**:
- `packages/core/src/modules/data_sync/lib/__tests__/sync-engine.test.ts`
- `packages/core/src/modules/data_sync/lib/__tests__/sync-engine-import-failures.test.ts`

### Phase 5: Integration-Builder Skill Updates

Update the integration-builder skill to reflect `AdapterContext` as the standard adapter pattern.

**Step 5.1**: Update adapter contract reference
- Add `AdapterContext` and `AdapterLogger` type definitions to the top of the contracts file
- Add `ctx?: AdapterContext` to every adapter interface method that performs I/O:
  - `GatewayAdapter`: `createSession`, `capture`, `refund`, `cancel`, `getStatus`, `verifyWebhook` (not `mapStatus` — pure logic)
  - `ShippingAdapter`: `calculateRates`, `createShipment`, `getTracking`, `cancelShipment`, `verifyWebhook` (not `mapStatus`)
  - `DataSyncAdapter`: all 5 methods (already specified in Phase 2)
  - `ChannelAdapter`: `sendMessage`, `verifyWebhook`, `getStatus`, `listSenders`
  - `NotificationTransportAdapter`: `send`, `getDeliveryStatus`, `verifyWebhook`
  - `WebhookEndpointAdapter`: `formatPayload`, `verifyWebhook`, `processInbound`
  - `StorageAdapter`: `upload`, `download`, `delete`, `getSignedUrl`, `list`, `exists`
- Add "Adapter Context" section explaining the pattern, when to use `ctx`, and the relationship to `input.scope`

**Files**: `.ai/skills/integration-builder/references/adapter-contracts.md`

**Step 5.2**: Update skill main file
- Update Section 5 (Implement Adapter) — all adapter class templates to include `ctx?: AdapterContext` in method signatures
- Update Section 5.3 (Data Sync template) — show `ctx.resolve()` and `ctx.logger` usage in `streamImport` example
- Update Section 5.5 (Client Factory) — show how adapters can combine `createClient(credentials)` with `ctx.logger` for structured logging
- Update Section 6.2 (Webhook Worker) — show that workers build ctx and pass to adapter methods when calling them
- Update Section 12 (Self-Review Checklist) — add items:
  - `[ ] Adapter methods that perform I/O accept optional `ctx?: AdapterContext` parameter`
  - `[ ] Adapter uses `ctx.logger` for structured logging instead of `console.log`'
  - `[ ] Adapter resolves services via `ctx.resolve()` — never stores container references`

**Files**: `.ai/skills/integration-builder/SKILL.md`

### Phase 6: Integration-Tests Skill Updates

Update the integration-tests skill to document adapter context mocking patterns.

**Step 6.1**: Add adapter context test guidance
- Add section on unit-testing adapters that use `AdapterContext`:
  - How to create a mock context: `{ resolve: jest.fn(), logger: { info: jest.fn(), ... }, scope: { organizationId: 'org-1', tenantId: 'tenant-1' } }`
  - How to mock `resolve` for specific services: `resolve: jest.fn((name) => { if (name === 'em') return mockEm; throw new Error('unexpected') })`
  - How to assert logger calls: `expect(ctx.logger.info).toHaveBeenCalledWith('Starting import', expect.any(Object))`
- Add note that E2E integration tests are unaffected (API contracts unchanged; ctx is built server-side)
- Add note on testing adapters that don't use ctx: mock adapters can omit ctx from their method signatures since it's optional

**Files**: `.ai/skills/integration-tests/SKILL.md`

### Phase 7: Documentation Updates

Update framework documentation to cover AdapterContext.

**Step 7.1**: Update hub adapters documentation
- Add "Adapter Context" section after the existing "Hub Service Layer" section
- Document `AdapterContext` type definition with all three fields
- Show context construction pattern (from Awilix container, from request container)
- Add comparison table showing context patterns across extension points:

| Extension Point | Context Type | Fields |
|-----------------|-------------|--------|
| Worker | `JobContext` | `resolve`, `jobId`, `attemptNumber`, `queueName` |
| Subscriber | `SubscriberContext` | `resolve`, `eventName?` |
| Workflow | `WorkflowTools` | `resolve`, `logger`, `run`, `step` |
| **Hub Adapter** | **`AdapterContext`** | **`resolve`, `logger`, `scope`** |

- Update existing adapter method examples to show `ctx?` parameter
- Add "Adapter Author" example showing `ctx.resolve()` and `ctx.logger` usage
- Add note: "Methods that don't need DI simply ignore the ctx parameter"

**Files**: `apps/docs/content/docs/framework/modules/hub-adapters.mdx`

**Step 7.2**: Update integrations & data sync documentation
- Update the DataSyncAdapter contract section to show `ctx?: AdapterContext` on all methods
- Add note explaining that ctx is built by the sync engine and passed to every adapter call
- Show that adapter authors can use `ctx.resolve('em')` for entity manager access and `ctx.logger` for structured logging

**Files**: `apps/docs/content/docs/framework/modules/integrations-data-sync.mdx`

**Step 7.3**: Update notifications documentation (if NotificationChannelAdapter is documented)
- Add `ctx?: AdapterContext` to the `send` method signature in any notification adapter examples
- Show that notification delivery callers build ctx from request container

**Files**: `apps/docs/content/docs/framework/modules/notifications.mdx`

### Phase 8: Build Verification

**Step 8.1**: Verify
- Run `yarn build:packages` — confirm shared and core compile
- Run `yarn test` — confirm all existing tests pass
- Run `yarn lint` — confirm no type errors

## Risks & Impact Review

### Risk 1: Caller forgets to pass ctx

- **Severity**: Medium
- **Affected area**: Adapter methods that expect `ctx` but receive `undefined`
- **Scenario**: A new caller retrieves an adapter from the hub and calls a method without building ctx. The adapter does `ctx!.resolve(...)` and gets a runtime TypeError.
- **Mitigation**: `ctx` is typed as optional (`ctx?`). Adapters that require it use `ctx!` (non-null assertion) — the crash is immediate and obvious, not a silent data corruption. Documentation and adapter author examples make the contract clear.
- **Residual risk**: Low — the call site is always framework code (engine/API route), not third-party. Framework code is tested.

### Risk 2: Scope inconsistency between ctx.scope and method input.scope

- **Severity**: Low
- **Affected area**: DataSyncAdapter methods that receive scope in both `input.scope` and `ctx.scope`
- **Scenario**: A bug in caller code passes different scope values in `ctx.scope` and `input.scope`.
- **Mitigation**: Both are built from the same source (`SyncScope` in engine, `auth` in API route). Document that `input.scope` is authoritative; `ctx.scope` is a convenience for adapters that don't receive scope in their input (e.g., NotificationChannelAdapter).
- **Residual risk**: Negligible — single source of truth at each call site.

### Risk 3: Logger type drift

- **Severity**: Low
- **Affected area**: `AdapterLogger` interface vs actual logger implementations
- **Scenario**: Framework introduces a richer logger (with `child()`, `trace()`, etc.) that `AdapterLogger` doesn't expose.
- **Mitigation**: `AdapterLogger` is intentionally minimal (4 methods). It's a subset of every logging library (console, pino, winston). If the framework adds structured logging, `AdapterLogger` can be extended with optional methods without breaking existing code.
- **Residual risk**: Low — additive extension is BC-safe.

### Risk 4: resolve() returns wrong scope

- **Severity**: Medium
- **Affected area**: DI resolution in sync engine
- **Scenario**: `deps.resolve` from Awilix cradle is root-scoped instead of request-scoped, so `resolve('em')` returns a shared EntityManager.
- **Mitigation**: The DI registration uses `.scoped().proxy()`, and `resolve` is extracted from the cradle (which is already a scoped proxy). The `em` resolved through it is the same request-scoped instance passed in `deps.em`.
- **Residual risk**: Low — existing pattern already works for workers.

## Final Compliance Report

### AGENTS.md Files Reviewed

| File | Relevance |
|------|-----------|
| Root `AGENTS.md` | Task routing, conventions, BC contract reference |
| `packages/shared/AGENTS.md` | Hub package rules, "MUST NOT add domain logic" |
| `packages/core/AGENTS.md` | Module development, DI patterns, API routes |
| `packages/core/src/modules/data_sync/AGENTS.md` | Adapter contract, sync engine, DI registration |
| `BACKWARD_COMPATIBILITY.md` | Surface #2 (types), #3 (signatures), #4 (imports) |

### Skills and Documentation Reviewed

| File | Relevance |
|------|-----------|
| `.ai/skills/integration-builder/SKILL.md` | Adapter templates (Section 5), worker patterns (Section 6), self-review checklist (Section 12) |
| `.ai/skills/integration-builder/references/adapter-contracts.md` | All 7 adapter interface definitions, common patterns section |
| `.ai/skills/integration-tests/SKILL.md` | Test methodology, module detection, mock patterns |
| `apps/docs/content/docs/framework/modules/hub-adapters.mdx` | Hub registry, adapter creation, service layer, DI wiring |
| `apps/docs/content/docs/framework/modules/integrations-data-sync.mdx` | DataSyncAdapter contract, run lifecycle, credentials |
| `apps/docs/content/docs/framework/modules/notifications.mdx` | Notification delivery patterns |
| `apps/docs/content/docs/framework/runtime/workers.mdx` | Worker context pattern (`JobContext` with `resolve`) |
| `apps/docs/content/docs/framework/events/overview.mdx` | Subscriber context pattern (`SubscriberContext`) |
| `apps/docs/content/docs/framework/workflows/overview.mdx` | Workflow context pattern (`WorkflowTools`) |

### Compliance Matrix

| Rule Source | Rule | Status | Notes |
|-------------|------|--------|-------|
| shared/AGENTS.md | No domain logic in shared | Compliant | `AdapterContext` is infrastructure, not domain |
| shared/AGENTS.md | No `any` types | Compliant | Uses generics with `unknown` default |
| shared/AGENTS.md | Export narrow interfaces | Compliant | 3-field type, no leaked internals |
| BC #2 | Cannot remove/narrow required fields | Compliant | Only adds optional parameter |
| BC #3 | Cannot remove/reorder params; new optional OK | Compliant | `ctx?` appended as last param |
| BC #4 | Old import paths must re-export | N/A | New exports only, no moves |
| data_sync/AGENTS.md | Adapters registered via hub | Compliant | Hub API unchanged |
| data_sync/AGENTS.md | Scope by org/tenant | Compliant | `ctx.scope` carries both |
| core/AGENTS.md | DI via Awilix | Compliant | `resolve` wraps cradle proxy |

### Internal Consistency Check

| Check | Status |
|-------|--------|
| Type definition ↔ interface usage | Consistent — `AdapterContext` used in both adapter interfaces and callers |
| Interface changes ↔ caller updates | Consistent — every adapter call site updated to pass ctx |
| Sync engine deps ↔ DI registration | Consistent — `resolve` added to both `EngineDeps` and `di.ts` |
| Test mocks ↔ new deps | Consistent — `resolve` mock added to all test files |
| Skill templates ↔ actual interfaces | Consistent — integration-builder adapter templates updated to match new signatures |
| Docs code examples ↔ actual interfaces | Consistent — hub-adapters.mdx and integrations-data-sync.mdx updated |
| Context pattern docs ↔ implementation | Consistent — comparison table covers all 4 extension points (workers, subscribers, workflows, adapters) |

### Verdict

**Fully compliant** — all changes are additive, no BC surfaces violated, consistent with framework patterns.

---

## Implementation Status

| Phase | Status | Date | Notes |
|-------|--------|------|-------|
| Phase 1 — Type Foundation | Done | 2026-03-23 | `AdapterContext` + `AdapterLogger` added to `packages/shared/src/lib/hub/index.ts` |
| Phase 2 — Interface Updates | Done | 2026-03-23 | `DataSyncAdapter`, `NotificationChannelAdapter`, `ConsoleChannelAdapter` updated |
| Phase 3 — Caller Wiring | Done | 2026-03-23 | sync-engine.ts, di.ts, validate.ts updated |
| Phase 4 — Test Updates | Done | 2026-03-23 | Both test files updated, all 7 tests passing |
| Phase 5 — Integration-Builder Skill | Done | 2026-03-23 | adapter-contracts.md (all 7 interfaces) + SKILL.md (templates + checklist) |
| Phase 6 — Integration-Tests Skill | Done | 2026-03-23 | Adapter context mocking section added |
| Phase 7 — Documentation | Done | 2026-03-23 | hub-adapters.mdx, integrations-data-sync.mdx updated |
| Phase 8 — Build Verification | Done | 2026-03-23 | `yarn build:packages` passes, all tests pass |

---

## Changelog

| Date | Notes |
|------|-------|
| 2026-03-22 | Initial specification |
| 2026-03-22 | Added Phases 5-7: integration-builder skill, integration-tests skill, and docs updates |
| 2026-03-23 | All phases implemented |
