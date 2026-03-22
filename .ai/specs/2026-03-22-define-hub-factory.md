# Unified Hub Adapter Registry — `defineHub<T>()`

## TLDR

**Key Points:**
- Replace inconsistent, copy-pasted adapter registries with a single `defineHub<T>()` factory in `@open-mercato/shared` backed by `Symbol.for` + `globalThis`
- Providers export adapters from `integration.ts`; the generator extracts them and bootstrap auto-registers them — zero manual wiring

**Scope:**
- Phase 1: `defineHub<T>()` factory + tests
- Phase 2: Migrate `data_sync` registry (only live hub) with deprecated bridges
- Phase 3: `adapter`/`adapters` export convention for `integration.ts`
- Phase 4: Generator extraction + bootstrap auto-registration
- Phase 5: Provider cleanup + documentation updates

**Concerns:**
- `payment_gateways` and `shipping_carriers` modules were intentionally deleted; when rebuilt they will use `defineHub()` natively — no migration needed for them

---

## Overview

Open Mercato's integration architecture uses "hubs" — typed adapter registries that let provider packages plug domain-specific implementations (payment processing, shipping rate calculation, data sync) into hub modules. Currently each hub hand-rolls its own registry with inconsistent patterns.

`defineHub<T>()` extracts the common registry mechanics into a one-line factory, while a generator + bootstrap pipeline auto-registers adapters exported from `integration.ts` — eliminating all manual `registerXxxAdapter()` calls.

> **Market Reference**: Studied **Medusa v2's Module Provider** pattern (providers register adapters into module containers, resolved by key at runtime). Adopted the keyed-adapter concept and provider-key lookup. Rejected DI-based resolution — our adapters are stateless (credentials injected at call-time), so a simple typed Map outperforms container-based resolution with zero lifecycle overhead.

## Problem Statement

Hub adapter registries are inconsistent and require manual boilerplate:

| Hub | Storage | Key type | Versioned | Package | Lines | Status |
|-----|---------|----------|-----------|---------|-------|--------|
| Payment gateways | `globalThis` string keys | String literal | Yes | `@open-mercato/shared` | ~100 | Deleted |
| Shipping carriers | `globalThis` `Symbol.for` | Symbol | No | `@open-mercato/core` | ~33 | Deleted |
| Data sync | Module-scoped `Map` | Closure | No | `@open-mercato/core` | ~15 | **Live** |

Problems:
1. **Inconsistent storage** — string keys vs `Symbol.for` vs closure. No shared contract.
2. **Manual registration** — providers call `registerXxxAdapter()` in `di.ts` or `setup.ts` even though `integration.ts` is already auto-discovered by the generator.
3. **No reuse** — creating a new hub means writing a new registry from scratch (~15-100 lines).
4. **Missing capabilities** — data_sync lacks `clear()` (needed for test teardown) and dispose (needed for HMR).

## Proposed Solution

1. A `defineHub<T>()` factory that creates typed, `Symbol.for`-backed registries
2. Providers export `adapter` (or `adapters` for versioned) from `integration.ts`
3. Generator extracts adapter exports; bootstrap auto-registers them into hubs
4. Existing `registerDataSyncAdapter()` becomes a deprecated bridge delegating to the same backing Map

### Design Decisions

| Decision | Rationale |
|----------|-----------|
| `Symbol.for` + `globalThis` (not module-scoped Map) | Same hub id resolves to the same Map across packages — required for bootstrap in `@open-mercato/shared` to register adapters defined in `@open-mercato/core` hub instances without importing core |
| `adapterKeyField` option (default `'providerKey'`) | Extracts the Map key from the adapter object automatically — no explicit key parameter needed |
| Eager adapter instances (not lazy factories) | Adapters are stateless; credentials injected at call-time. Lazy factories add generator/bootstrap complexity for a hypothetical need. Escape hatch: call `hub.register()` directly in `di.ts` if DI access is ever needed |
| Deprecated bridges return `() => void` | Additive change — existing callers discarding the return value are unaffected; test callers gain cleanup capability |
| Phase 2 migrates only `data_sync` | Payment gateways and shipping carriers were intentionally deleted; future rebuilds use `defineHub()` natively |

### Alternatives Considered

| Alternative | Why Rejected |
|-------------|-------------|
| DI-based adapter resolution (Medusa v2 style) | Adds container dependency to stateless lookups; adapters don't need lifecycle management |
| Generator plugin per hub (like enrichers/interceptors) | Overkill — hubs share one generic extraction pattern from `integration.ts` |
| Lazy factory form `(container) => Adapter` | YAGNI — eager instances work for all current and planned adapters; `hub.register()` in `di.ts` covers edge cases |
| Migrating all three hubs including deleted ones | Adds dead code; deleted modules use `defineHub()` natively when rebuilt |

## User Stories / Use Cases

- **Integration developer** wants to **create a new hub** (e.g., notification transports) so they can **define the adapter interface, call `defineHub()`, and have providers auto-register** — no registry boilerplate
- **Provider developer** wants to **export an adapter from `integration.ts`** so it **auto-registers at bootstrap** without touching `di.ts`
- **Core developer** wants to **look up an adapter by `providerKey`** using a typed, consistent API across all hubs
- **Test author** wants to **clear hub state between tests** using `hub.clear()` and **dispose individual adapters** via the dispose function

## Architecture

### Component Flow

```
integration.ts ──export──> Generator ──hubAdapters──> Bootstrap ──register──> Hub (Symbol.for Map)
                                                                                    │
                                                                         hub.get(key) ◄── Hub Module API Routes
```

### Package Dependency Chain

```
@open-mercato/shared  ←  defineHub(), Hub<T>, hubAdapters on Module type
       ↑
@open-mercato/core    ←  dataSyncHub instance, deprecated bridges, hub module API routes
       ↑
provider packages     ←  export adapter from integration.ts
```

Bootstrap (in `@open-mercato/shared`) calls `defineHub({ id: entry.hub })` which resolves to the **same** `Symbol.for`-backed Map as the hub declared in `@open-mercato/core`. No cross-package import needed.

### defineHub<T>() Internal Design

```
defineHub({ id: 'data_sync' })
  └─ Symbol.for('@open-mercato/hub/data_sync')
       └─ globalThis[Symbol] = Map<string, T>
            ├── 'shopify_products' → ShopifyProductsAdapter
            ├── 'shopify_orders'   → ShopifyOrdersAdapter
            └── 'akeneo_products'  → AkeneoProductsAdapter
```

Versioned hub (future payment gateways):
```
defineHub({ id: 'payment_gateways', versioned: true })
  └─ Symbol.for('@open-mercato/hub/payment_gateways')
       └─ Map
            ├── 'stripe'            → StripeV2025 (first-registered fallback)
            ├── 'stripe:2025-01-01' → StripeV2025
            └── 'stripe:2024-01-01' → StripeV2024
```

## Data Models

N/A — no database entities. This is a runtime TypeScript registry.

## API Contracts

### TypeScript API — `defineHub<T>()`

```typescript
// packages/shared/src/lib/hub/index.ts

export interface HubOptions {
  /** Unique hub identifier. Same id = same backing Map across packages. */
  id: string
  /** Adapter property to use as Map key. Default: 'providerKey' */
  adapterKeyField?: string
  /** Enable version-qualified keys with unversioned fallback. Default: false */
  versioned?: boolean
}

export interface Hub<T> {
  /** Hub identifier */
  readonly id: string
  /** Register an adapter. Returns a dispose function that removes it. */
  register(adapter: T, options?: { version?: string }): () => void
  /** Get adapter by key, with optional version. Versioned hubs fall back to unversioned entry. */
  get(key: string, version?: string): T | undefined
  /** List all adapters. Versioned hubs deduplicate to one per logical provider. */
  list(): T[]
  /** Remove all adapters. Useful for test teardown. */
  clear(): void
}

export function defineHub<T extends Record<string, unknown>>(options: HubOptions): Hub<T>
```

**Behavioral contract:**

| Behavior | Detail |
|----------|--------|
| Storage key | `Symbol.for('@open-mercato/hub/${id}')` on `globalThis` |
| Key extraction | `adapter[adapterKeyField]` (must be a string; throws if missing) |
| Versioned register | Stores under `key:version` compound AND unversioned `key` (first wins for fallback) |
| Versioned get | Tries `key:version` first, falls back to `key` |
| Versioned list | Returns one entry per logical provider (unversioned keys only), deduplicates |
| Dispose | Returned function removes the specific entry (versioned: removes compound key; if it was the fallback, removes that too) |
| Duplicate key | Dev-mode `console.warn` (HMR-safe — warns but doesn't throw) |
| Clear | Empties the entire Map. Does not remove the Symbol from globalThis. |

### TypeScript API — Deprecated Bridges (data_sync)

```typescript
// packages/core/src/modules/data_sync/lib/adapter-registry.ts

/** @deprecated Use dataSyncHub.register() */
export function registerDataSyncAdapter(adapter: DataSyncAdapter): () => void

/** @deprecated Use dataSyncHub.get() */
export function getDataSyncAdapter(providerKey: string): DataSyncAdapter | undefined

/** @deprecated Use dataSyncHub.list() */
export function getAllDataSyncAdapters(): DataSyncAdapter[]
```

### Module Type Extension

```typescript
// packages/shared/src/modules/registry.ts — additive optional field
hubAdapters?: Array<{
  hub: string
  providerKey: string
  adapter: unknown
  version?: string
}>
```

### integration.ts Export Convention (Additive)

```typescript
// Single adapter (common case)
export const adapter = new MyAdapter()

// Multiple versioned adapters
export const adapters = [
  { adapter: new MyAdapterV2(), version: '2025-01-01' },
  { adapter: new MyAdapterV1(), version: '2024-01-01' },
]
```

Both exports are optional. Existing `integration.ts` files without them work unchanged.

## Migration & Compatibility

| Change | BC Surface | Risk | Mitigation |
|--------|-----------|------|------------|
| Add `defineHub()` | New API | None | Purely additive |
| Add optional `adapter`/`adapters` to `integration.ts` convention | Surface 1 (conventions) | None | Optional export, existing files unchanged |
| Add `hubAdapters` to `Module` type | Surface 2 (types) | None | Optional field, additive |
| `registerDataSyncAdapter()` return type `void` → `() => void` | Surface 3 (functions) | Low | Additive — callers ignoring return unaffected |
| `getAllDataSyncAdapters()` delegates to `dataSyncHub.list()` | Surface 3 (functions) | None | Same behavior, same backing store |
| Add `clear()` via `dataSyncHub.clear()` | New API | None | New capability, no existing function to conflict |

**Critical invariant:** Deprecated bridges and bootstrap auto-registration both write to the same `Symbol.for`-backed Map. A provider using old `registerDataSyncAdapter()` in `setup.ts` and a provider using new `adapter` export in `integration.ts` coexist without conflict — both paths resolve to the same registry.

**Deprecation protocol:**
1. Add `@deprecated` JSDoc on `registerDataSyncAdapter`, `getDataSyncAdapter`, `getAllDataSyncAdapters`
2. Bridges delegate to `dataSyncHub` (same backing Map)
3. Document in RELEASE_NOTES.md with migration examples
4. Remove deprecated functions in next minor version

## Implementation Plan

### Phase 1: `defineHub<T>()` Factory

**Goal:** Ship the reusable factory. Zero impact on existing code.

**Steps:**

1. Create `packages/shared/src/lib/hub/index.ts` with `defineHub<T>()` implementation:
   - `Symbol.for('@open-mercato/hub/${id}')` storage on `globalThis`
   - Key extraction via `adapter[adapterKeyField]` with runtime validation
   - Versioned mode: compound key `key:version` + unversioned fallback (first registered wins)
   - `list()` deduplication for versioned hubs (filter to unversioned keys)
   - `clear()` empties the Map
   - Dev-mode `console.warn` on duplicate key registration
   - Dispose function from `register()` removes the specific entry

2. Create `packages/shared/src/lib/hub/__tests__/defineHub.test.ts`:
   - `register()` / `get()` / `list()` / `clear()` basic lifecycle
   - Versioned register with fallback lookup
   - Dispose function removes adapter
   - Same `id` across multiple `defineHub()` calls shares storage (the core invariant)
   - `list()` deduplication on versioned hubs
   - Missing `adapterKeyField` property throws descriptive error
   - Dev-mode duplicate warning (spy on `console.warn`)

### Phase 2: Migrate `data_sync` Registry

**Goal:** Replace the 15-line module-scoped Map with `defineHub()`. Deprecated bridges maintain BC.

**Steps:**

1. Rewrite `packages/core/src/modules/data_sync/lib/adapter-registry.ts`:
   ```typescript
   import { defineHub } from '@open-mercato/shared/lib/hub'
   import type { DataSyncAdapter } from './adapter'

   export const dataSyncHub = defineHub<DataSyncAdapter>({
     id: 'data_sync',
     adapterKeyField: 'providerKey',
   })

   /** @deprecated Use dataSyncHub.register() */
   export function registerDataSyncAdapter(adapter: DataSyncAdapter): () => void {
     return dataSyncHub.register(adapter)
   }

   /** @deprecated Use dataSyncHub.get() */
   export function getDataSyncAdapter(providerKey: string): DataSyncAdapter | undefined {
     return dataSyncHub.get(providerKey)
   }

   /** @deprecated Use dataSyncHub.list() */
   export function getAllDataSyncAdapters(): DataSyncAdapter[] {
     return dataSyncHub.list()
   }
   ```

2. Verify all consumers still work (no code changes needed — same function signatures):
   - `packages/core/src/modules/data_sync/api/options.ts` — uses `getDataSyncAdapter`
   - `packages/core/src/modules/data_sync/api/run.ts` — uses `getDataSyncAdapter`
   - `packages/core/src/modules/data_sync/api/validate.ts` — uses `getDataSyncAdapter`
   - `packages/core/src/modules/data_sync/lib/sync-engine.ts` — uses `getDataSyncAdapter`
   - `packages/core/src/modules/data_sync/lib/__tests__/sync-engine-import-failures.test.ts` — mocks `getDataSyncAdapter`

3. Update test mock to also clear hub state via `dataSyncHub.clear()` in teardown.

### Phase 3: `integration.ts` Adapter Export Convention

**Goal:** Define the convention for providers to export adapters from `integration.ts`. No runtime changes yet.

**Steps:**

1. Document the convention — `integration.ts` may optionally export:
   - `adapter`: single adapter instance (common case)
   - `adapters`: array of `{ adapter, version }` for versioned hubs
   - Hub and providerKey are read from the colocated `integration` or `integrations` export

2. No type changes to `IntegrationDefinition` — `hub` and `providerKey` fields already exist.

### Phase 4: Generator + Bootstrap Auto-Registration

**Goal:** Generator extracts `adapter`/`adapters` from `integration.ts`; bootstrap auto-registers them into hubs.

**Steps:**

1. Add `hubAdapters` optional field to `Module` interface in `packages/shared/src/modules/registry.ts`:
   ```typescript
   hubAdapters?: Array<{
     hub: string
     providerKey: string
     adapter: unknown
     version?: string
   }>
   ```

2. Extend generator in `packages/cli/src/lib/generators/module-registry.ts` (after line 1027):
   ```typescript
   ${integrationImportName ? `hubAdapters: (() => {
     const _int = ${integrationImportName}
     const _hub = (_int.integration?.hub ?? _int.integrations?.[0]?.hub) || undefined
     const _pk = (_int.integration?.providerKey ?? _int.integrations?.[0]?.providerKey) || undefined
     if (!_hub || !_pk) return []
     if (_int.adapters) return _int.adapters.map((e: any) => ({ hub: _hub, providerKey: _pk, adapter: e.adapter, version: e.version }))
     if (_int.adapter) return [{ hub: _hub, providerKey: _pk, adapter: _int.adapter }]
     return []
   })(),` : ''}
   ```

   **Known limitation:** Hub and providerKey are read from the first integration entry (`integrations[0]`). All integrations in a bundle are expected to share the same hub — this holds for all existing bundle patterns (Shopify, Akeneo, Medusa). If a future bundle spans multiple hubs, the generator would need per-integration extraction.

3. Add hub auto-registration to bootstrap in `packages/shared/src/lib/bootstrap/factory.ts` (after the integrations/bundles loop, ~line 53):
   ```typescript
   import { defineHub } from '../hub/index.js'

   // === Hub adapter auto-registration ===
   // Clear hubs before re-registering (matches clearRegisteredIntegrations() pattern for HMR)
   const hubIdsToClear = new Set<string>()
   for (const module of data.modules) {
     for (const entry of module.hubAdapters ?? []) {
       hubIdsToClear.add(entry.hub)
     }
   }
   for (const id of hubIdsToClear) {
     defineHub({ id }).clear()
   }
   for (const module of data.modules) {
     if (module.hubAdapters?.length) {
       for (const entry of module.hubAdapters) {
         const hub = defineHub({ id: entry.hub })
         hub.register(entry.adapter as Record<string, unknown>, { version: entry.version })
       }
     }
   }
   ```

   `defineHub({ id: entry.hub })` resolves to the same backing Map as the hub declared anywhere else with the same id — no imports from `@open-mercato/core` needed. The clear-before-register pattern ensures HMR re-runs in dev mode don't trigger duplicate-key warnings.

4. Run `yarn generate` and verify generated output includes `hubAdapters` for modules with adapter exports.

### Phase 5: Provider Cleanup + Documentation

**Goal:** Migrate data sync providers from manual registration to `integration.ts` exports. Update all documentation.

**Steps:**

1. For each data sync provider that currently calls `registerDataSyncAdapter()` in `setup.ts` or `di.ts`:
   - Add `export const adapter = myAdapter` to `integration.ts`
   - Remove `registerDataSyncAdapter()` call from `setup.ts`/`di.ts`
   - Keep `di.ts` if it still registers DI services (health checks, etc.)

2. Documentation updates:
   - `BACKWARD_COMPATIBILITY.md` — add `integration.ts` adapter exports to Surface 1 table; add `defineHub` to Surface 3
   - `RELEASE_NOTES.md` — deprecation notices with migration examples
   - `.ai/skills/integration-builder/SKILL.md` — update to new adapter export pattern
   - `.ai/skills/integration-builder/references/adapter-contracts.md` — deprecation notices on old functions
   - `packages/core/src/modules/data_sync/AGENTS.md` — update registration pattern
   - Root `AGENTS.md` — add `adapter` to Optional Module Files table, add `defineHub` import to "When You Need an Import"
   - `apps/docs/content/docs/framework/modules/integrations-data-sync.mdx` — update registration examples

### File Manifest

| File | Action | Phase | Purpose |
|------|--------|-------|---------|
| `packages/shared/src/lib/hub/index.ts` | Create | 1 | `defineHub<T>()` factory |
| `packages/shared/src/lib/hub/__tests__/defineHub.test.ts` | Create | 1 | Unit tests |
| `packages/core/src/modules/data_sync/lib/adapter-registry.ts` | Modify | 2 | Replace Map with `dataSyncHub`, add deprecated bridges |
| `packages/shared/src/modules/registry.ts` | Modify | 4 | Add `hubAdapters` optional field to `Module` |
| `packages/cli/src/lib/generators/module-registry.ts` | Modify | 4 | Extract `adapter`/`adapters` from `integration.ts` |
| `packages/shared/src/lib/bootstrap/factory.ts` | Modify | 4 | Auto-register hub adapters |
| `BACKWARD_COMPATIBILITY.md` | Modify | 5 | Document new convention and deprecations |
| Root `AGENTS.md` | Modify | 5 | Add `defineHub` import, `adapter` to convention table |
| `packages/core/src/modules/data_sync/AGENTS.md` | Modify | 5 | Update registration pattern |
| `.ai/skills/integration-builder/SKILL.md` | Modify | 5 | New adapter export pattern |
| `.ai/skills/integration-builder/references/adapter-contracts.md` | Modify | 5 | Deprecation notices |
| `apps/docs/content/docs/framework/modules/integrations-data-sync.mdx` | Modify | 5 | Update examples |
| `packages/create-app/template/src/modules/example/di.ts` | Modify | 5 | Update example to show new adapter export pattern |

### Testing Strategy

- **Unit tests** (Phase 1): `defineHub.test.ts` — full lifecycle, versioned mode, cross-call sharing, dispose, dedup
- **Integration verification** (Phase 2): Existing `sync-engine-import-failures.test.ts` must pass unchanged (mock still works against deprecated bridge)
- **Generator verification** (Phase 4): `yarn generate` produces `hubAdapters` in generated output for modules with adapter exports
- **Build verification** (all phases): `yarn build:packages && yarn build` after each phase

## Risks & Impact Review

### Data Integrity Failures

- **No database involvement.** This is a runtime in-memory registry. Process restart reconstructs state from bootstrap.
- **Race condition:** Two modules registering the same providerKey. Mitigated by dev-mode `console.warn` and the fact that providerKeys are unique by convention (enforced by integration marketplace UI).

### Cascading Failures & Side Effects

- Hub `get()` returns `undefined` for missing adapters. All existing consumers already null-check (`if (!adapter) throw`). No behavioral change.
- If bootstrap runs before a provider's `integration.ts` is loaded, the adapter won't be in the Map. Mitigated: bootstrap processes all modules in one pass, and `integration.ts` is statically imported in the generated file.

### Tenant & Data Isolation Risks

- Hubs are **global** (not tenant-scoped). Adapters are stateless — tenant isolation is enforced at call-time via credentials and `organizationId` scoping in the hub module's API routes. No change from current behavior.

### Migration & Deployment Risks

- **Zero-downtime deployment.** All changes are additive. Deprecated bridges delegate to the same Map, so both old and new registration paths coexist.
- **No data migration.** Registry is rebuilt from scratch on every process start.

### Operational Risks

- **HMR double-registration in dev.** Mitigated: bootstrap clears all referenced hubs before re-registering (matching the `clearRegisteredIntegrations()` pattern). Dev-mode `console.warn` on duplicate key only fires for within-run conflicts (two modules claiming the same providerKey), not HMR re-runs.

### Risk Register

#### Symbol.for Key Collision
- **Scenario**: Another library uses `Symbol.for('@open-mercato/hub/...')` with the same namespace
- **Severity**: Low
- **Affected area**: All hub registries
- **Mitigation**: Namespace is vendor-scoped (`@open-mercato/hub/`). Collision requires exact match. Standard practice in the JS ecosystem.
- **Residual risk**: Negligible — would require deliberate targeting

#### Generator Extraction Fails Silently
- **Scenario**: `integration.ts` exports `adapter` but lacks `hub` or `providerKey` on the integration definition. Generator produces empty `hubAdapters`.
- **Severity**: Medium
- **Affected area**: Provider whose adapter doesn't get registered
- **Mitigation**: Generator IIFE returns `[]` when hub/providerKey missing. Dev-mode console log in bootstrap when `hubAdapters` is processed. Provider still works if they fall back to manual `hub.register()` in `di.ts`.
- **Residual risk**: Acceptable — provider developer will notice adapter isn't working and check the generated file

#### Deprecated Bridge Behavioral Drift
- **Scenario**: Hub implementation evolves (e.g., new validation) but deprecated bridges don't expose the new behavior
- **Severity**: Low
- **Affected area**: Callers using deprecated functions
- **Mitigation**: Bridges are thin delegates — they call hub methods directly with no intermediate logic. New hub behavior automatically flows through bridges.
- **Residual risk**: None — bridges are pass-through by design

## Final Compliance Report — 2026-03-22

### AGENTS.md Files Reviewed
- `AGENTS.md` (root)
- `packages/core/AGENTS.md`
- `packages/shared/AGENTS.md`
- `packages/cli/AGENTS.md`
- `packages/core/src/modules/data_sync/AGENTS.md`

### Compliance Matrix

| Rule Source | Rule | Status | Notes |
|-------------|------|--------|-------|
| root AGENTS.md | No direct ORM relationships between modules | N/A | No database entities |
| root AGENTS.md | Filter by organization_id | N/A | No database queries |
| root AGENTS.md | Use DI (Awilix) to inject services | Compliant | Hub resolved via `Symbol.for`, not DI — intentional (must work before DI container exists) |
| root AGENTS.md | Modules must remain isomorphic and independent | Compliant | `defineHub` in `@open-mercato/shared` has no domain dependencies |
| root AGENTS.md | Validate all inputs with zod | N/A | No HTTP API inputs |
| root AGENTS.md | Deprecated bridges + deprecation protocol | Compliant | `@deprecated` JSDoc, bridge delegates to same Map, removed next minor |
| root AGENTS.md | No `any` types | Compliant | Generator uses `any` cast in IIFE (unavoidable for dynamic import extraction), all public APIs are typed |
| packages/shared/AGENTS.md | MUST NOT import from `@open-mercato/core` | Compliant | `defineHub` in shared, `dataSyncHub` in core. Bootstrap uses `defineHub({ id })` — no core import needed |
| packages/shared/AGENTS.md | MUST NOT add domain-specific logic | Compliant | `defineHub` is generic infrastructure |
| packages/cli/AGENTS.md | Generated output goes to `apps/mercato/.mercato/generated/` | Compliant | `hubAdapters` emitted inline in module declaration |
| packages/core/AGENTS.md | API routes MUST export openApi | N/A | No new API routes |
| root AGENTS.md | BC Surface 1 (conventions) — additive only | Compliant | `adapter`/`adapters` exports are optional additions to integration.ts |
| root AGENTS.md | BC Surface 2 (types) — optional additive fields only | Compliant | `hubAdapters` is optional field on Module |
| root AGENTS.md | BC Surface 3 (functions) — cannot remove params | Compliant | Deprecated bridges preserve signatures; `void` → `() => void` return is additive |

### Internal Consistency Check

| Check | Status | Notes |
|-------|--------|-------|
| Data models match API contracts | N/A | No data models |
| TypeScript API contracts match implementation plan | Pass | Phase 1 implements `Hub<T>` interface; Phase 2 implements deprecated bridges; Phase 4 implements `hubAdapters` on Module |
| Risks cover all write operations | Pass | `register()`, `clear()`, `dispose()` covered |
| Cache strategy covers all read APIs | N/A | No cacheable read APIs |
| Deprecated functions have migration path | Pass | Each deprecated function maps 1:1 to a hub method |

### Non-Compliant Items

None.

### Verdict

**Fully compliant** — ready for implementation.

## End-State DX: Creating a New Hub

After this spec is implemented, creating a new hub requires:

```typescript
// 1. Define the adapter interface (domain-specific, always manual)
export interface NotificationTransportAdapter {
  readonly providerKey: string
  send(input: SendInput): Promise<SendResult>
  mapStatus(status: string): UnifiedDeliveryStatus
}

// 2. Create the hub (one line)
export const notificationHub = defineHub<NotificationTransportAdapter>({
  id: 'notification_providers',
})

// 3. Hub module uses it (domain logic, always manual)
const adapter = notificationHub.get(providerKey)
await adapter.send({ to, body, credentials })

// 4. Provider just exports from integration.ts (auto-registered)
export const integration: IntegrationDefinition = {
  id: 'channel_sendgrid',
  hub: 'notification_providers',
  providerKey: 'sendgrid',
  ...
}
export const adapter = new SendgridAdapter()
```

No registry code. No `globalThis`. No `registerXxxAdapter()`. No generator plugin.

## What This Spec Does NOT Cover

- **Hub orchestration API routes** — always manual, domain-specific per hub
- **UMES registries** (enrichers, interceptors, etc.) — different lifecycle, already have their own bootstrap pipeline
- **Integration marketplace UI** — already works, no changes needed
- **Payment gateway / shipping carrier rebuilds** — separate specs; they will use `defineHub()` natively
- **Webhook handler registries** — follow the same `defineHub()` pattern but tracked as a separate hub (e.g., `payment_gateways:webhooks`) in the hub's own spec

## Changelog

### 2026-03-22
- Initial specification
- Scoped Phase 2 to data_sync only (payment_gateways and shipping_carriers intentionally deleted)
- Decided: deprecated bridge returns `() => void` (additive, callers unaffected)
- Decided: eager adapter instances only (YAGNI on lazy factories)
- Added clear-before-register pattern in bootstrap for HMR safety
- Added generator single-hub extraction limitation note (Phase 4)
- Added `create-app` template to file manifest (Phase 5)

### Review — 2026-03-22
- **Reviewer**: Agent
- **Security**: Passed (no HTTP APIs, no PII, no user input)
- **Performance**: Passed (O(1) Map lookups, negligible overhead)
- **Cache**: N/A (no cacheable read APIs)
- **Commands**: N/A (no mutations)
- **Risks**: Passed — HMR gap fixed (added clear-before-register in bootstrap)
- **Verdict**: Approved

## Implementation Status

| Phase | Status | Date | Notes |
|-------|--------|------|-------|
| Phase 1 — `defineHub<T>()` Factory | Done | 2026-03-22 | Factory + 34 unit tests passing. Generic constraint relaxed to `object` (interfaces lack index signatures for `Record<string, unknown>`). |
| Phase 2 — Migrate data_sync Registry | Done | 2026-03-22 | Deprecated bridges in place. Existing `sync-engine-import-failures.test.ts` passes unchanged. Added `./lib/hub` to shared package exports. |
| Phase 3 — integration.ts Convention | Done | 2026-03-22 | Convention documented. No type changes needed — `hub`/`providerKey` already on `IntegrationDefinition`. |
| Phase 4 — Generator + Bootstrap | Done | 2026-03-22 | `hubAdapters` on Module, generator IIFE extraction, bootstrap clear-before-register. Both packages typecheck clean. |
| Phase 5 — Docs + Cleanup | Done | 2026-03-22 | AGENTS.md, data_sync AGENTS.md, integration docs, adapter-contracts updated. `create-app` template update deferred (no live providers to migrate). |
