# Pre-Implementation Analysis: Unified Hub Adapter Registry — `defineHub<T>()`

**Spec**: `.ai/specs/2026-03-22-define-hub-factory.md`
**Date**: 2026-03-22

## Executive Summary

The spec is **well-structured, low-risk, and ready for implementation** with minor additions. All 13 backward compatibility surfaces are compliant — every change is additive. The only live migration target (`data_sync`) has all consumers internal to its own module. Two gaps should be addressed before implementation: (1) the generator's single-hub extraction assumption should be documented as a known limitation, and (2) the `create-app` template example should be updated alongside documentation.

## Backward Compatibility

### 13-Surface Audit

| # | Surface | Classification | Applies? | Status | Detail |
|---|---------|---------------|----------|--------|--------|
| 1 | Auto-discovery file conventions | FROZEN | Yes | **Compliant** | `adapter`/`adapters` are optional additive exports on existing `integration.ts` convention. No files renamed or removed. |
| 2 | Type definitions & interfaces | STABLE | Yes | **Compliant** | `hubAdapters` added as optional field on `Module`. No fields removed from `IntegrationDefinition` (which already has `hub` and `providerKey`). |
| 3 | Function signatures | STABLE | Yes | **Compliant** | `registerDataSyncAdapter` widens return from `void` to `() => void` — additive. `getDataSyncAdapter`, `getAllDataSyncAdapters` unchanged. New `dataSyncHub` export is purely additive. |
| 4 | Import paths | STABLE | Yes | **Compliant** | New path `@open-mercato/shared/lib/hub` is additive. Existing `@open-mercato/core/modules/data_sync/lib/adapter-registry` preserved with deprecated bridges. |
| 5 | Event IDs | FROZEN | No | N/A | No events touched. |
| 6 | Widget injection spot IDs | FROZEN | No | N/A | No spots touched. |
| 7 | API route URLs | STABLE | No | N/A | No routes touched. |
| 8 | Database schema | ADDITIVE-ONLY | No | N/A | No database changes. |
| 9 | DI service names | STABLE | No | N/A | No DI registrations changed. |
| 10 | ACL feature IDs | FROZEN | No | N/A | No features touched. |
| 11 | Notification type IDs | FROZEN | No | N/A | No notifications touched. |
| 12 | CLI commands | STABLE | No | N/A | No CLI commands changed. |
| 13 | Generated file contracts | STABLE | Yes | **Compliant** | `hubAdapters` is an optional field on `Module` (which lives inside `BootstrapData.modules`). `BootstrapData` shape itself is unchanged — no fields added/removed on the top-level interface. |

### Violations Found

None.

### Return Type Change Detail (Surface 3)

`registerDataSyncAdapter` and its deprecated bridges have been removed. `dataSyncHub` is now the sole API for adapter registration. The original return-type widening (`void` to `() => void`) is moot — no callers remain.

**Verdict**: Removal complete. No bridge in place.

### Missing BC Section

The spec **has** a "Migration & Compatibility" section with a full table and deprecation protocol. Compliant.

## Spec Completeness

### Present Sections

| Section | Status | Notes |
|---------|--------|-------|
| TLDR & Overview | Present | Clear scope, market reference |
| Problem Statement | Present | Quantified with line counts and status |
| Proposed Solution | Present | Design decisions table + alternatives considered |
| Architecture | Present | Component flow, package deps, internal design diagrams |
| Data Models | N/A | Explicitly marked — runtime registry, no DB |
| API Contracts | Present | Full TypeScript API with behavioral contract table |
| UI/UX | N/A | No UI changes |
| Risks & Impact Review | Present | 5 categories + 3 registered risks |
| Phasing | Present | 5 phases with goals |
| Implementation Plan | Present | Detailed steps per phase with code snippets |
| Final Compliance Report | Present | Full matrix + internal consistency check |
| Changelog | Present | With review entry |

### Missing Sections

| Section | Impact | Recommendation |
|---------|--------|---------------|
| Integration Test Coverage | Low | No HTTP APIs or UI changes to test. The spec covers unit tests (Phase 1), integration verification (Phase 2), and build verification (all phases). Formal integration test scenarios are N/A for this infrastructure-only change. No action needed. |

### Incomplete Sections

| Section | Gap | Recommendation |
|---------|-----|---------------|
| File Manifest | Missing `create-app` template file | Add `packages/create-app/template/src/modules/example/di.ts` (Phase 5, modify — remove adapter registration example if present) |
| Phase 4 Step 2 | Generator IIFE reads only first integration's hub/providerKey | Add a note that all integrations in a bundle are expected to share the same hub. If they differ, only the first is used. This matches existing bundle semantics. |

## AGENTS.md Compliance

### Rules Checked

| Rule | Source | Status | Notes |
|------|--------|--------|-------|
| `@open-mercato/shared` MUST NOT import from `@open-mercato/core` | `packages/shared/AGENTS.md` | **Compliant** | `defineHub` in shared; `dataSyncHub` in core. Bootstrap uses `defineHub({ id })` — resolves via Symbol.for, no core import. |
| `@open-mercato/shared` MUST NOT add domain-specific logic | `packages/shared/AGENTS.md` | **Compliant** | `defineHub` is generic infrastructure — no domain awareness. |
| No `any` types | Root `AGENTS.md` | **Acceptable** | Generator IIFE uses `(e: any)` for dynamic import extraction. Same pattern as existing lines 1026-1027. Internal generated code, not public API. |
| Import strategy: package-level over deep relative | Root `AGENTS.md` | **Compliant** | `@open-mercato/shared/lib/hub` for cross-package; `./adapter` for same-module. |
| Convention files: correct exports | `packages/core/AGENTS.md` | **Compliant** | `integration.ts` already auto-discovered. `adapter`/`adapters` are additive optional exports. |
| Generated files: never edit manually | `packages/cli/AGENTS.md` | **Compliant** | `hubAdapters` emitted by generator, consumed by bootstrap. |
| External integrations as separate npm packages | Root `AGENTS.md` | **N/A** | Spec doesn't create providers — establishes the registration pattern. |
| Run `npm run modules:prepare` after changes | `packages/core/AGENTS.md` | **Noted** | Spec mentions `yarn generate` verification in Phase 4 but doesn't list `modules:prepare` explicitly. Implementation should run it. |

### Violations

None.

## Risk Assessment

### High Risks

None identified. All changes are additive with deprecated bridges.

### Medium Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Generator IIFE reads `integrations[0].hub` — bundle with mixed hubs would silently use wrong hub for adapter | Provider whose non-first integration hub is different would have adapter registered in wrong hub | Document as known limitation. All existing bundle patterns (Shopify, Akeneo, Medusa) share one hub per bundle. If mixed-hub bundles emerge, extend generator to per-integration extraction. |
| Test mock in `sync-engine-import-failures.test.ts` mocks `getDataSyncAdapter` at module level — could break if module internals change | Test failure in Phase 2 | The mock targets `'../lib/adapter-registry'` — since the deprecated bridge still exports `getDataSyncAdapter` with the same name, the jest mock should still intercept. Verify during implementation. |
| Dev-mode `console.warn` on duplicate key during HMR | Noisy console in development | Spec already addresses this: bootstrap clears hubs before re-registering. Warn only fires for genuine within-run conflicts. |

### Low Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| `adapterKeyField` property missing on adapter instance at registration time | Bootstrap throws, app fails to start | Runtime validation in `hub.register()` with descriptive error message. Provider will see clear error immediately. |
| `create-app` template not updated | New projects scaffold with old registration pattern | Add template update to Phase 5 file manifest. |
| Lessons.md entry "Global event bus storage for dev HMR survival" | Relevant pattern — hub uses same `globalThis`+`Symbol.for` approach | Already adopted in spec. Consistent with lesson. |

## Gap Analysis

### Critical Gaps (Block Implementation)

None.

### Important Gaps (Should Address)

- **Template parity**: `packages/create-app/template/src/modules/example/di.ts` should be updated in Phase 5 to demonstrate the new `integration.ts` adapter export pattern. The brief mentioned this but the spec's file manifest omits it.
- **Generator limitation documentation**: Add a note that `hubAdapters` extraction assumes all integrations in a bundle share the same `hub`. This is true for all existing bundle patterns but should be explicitly stated.

### Nice-to-Have Gaps

- **Generator-level validation**: The generator could emit a build-time warning if `integration.ts` exports `adapter` but the integration definition lacks `hub` or `providerKey`. Currently silently produces empty `hubAdapters: []`. Not blocking — provider will notice at runtime.
- **Type narrowing for `adapterKeyField`**: The `Hub<T>` type could use `T extends Record<K, string>` with a generic `K` to enforce the key field exists at compile time. Current `T extends Record<string, unknown>` is simpler but relies on runtime validation. Acceptable for v1.

## Remediation Plan

### Before Implementation (Must Do)

1. **Add template file to manifest**: Add `packages/create-app/template/src/modules/example/di.ts` to Phase 5 file manifest (Modify — update example to show new pattern).
2. **Document generator assumption**: Add a one-line note in Phase 4 Step 2 that all integrations in a bundle are expected to share the same `hub`/`providerKey`. If they differ, only the first entry's values are used.

### During Implementation (Verify)

1. **Test mock compatibility**: In Phase 2, verify that `sync-engine-import-failures.test.ts` still works with the hub delegation. The jest mock targets the module path, so the function-level mock should still intercept `getDataSyncAdapter`. Run the test before moving to Phase 3.
2. **HMR verification**: After Phase 4, test the dev server with `yarn dev` — trigger a file change and verify no duplicate-key warnings spam the console.
3. **Build verification**: Run `yarn build:packages && yarn build` after each phase to confirm no type errors.

### Post-Implementation (Follow Up)

1. **Update `.ai/lessons.md`**: Add lesson about hub registry pattern (`Symbol.for`+`globalThis` for cross-package singleton) — aligns with existing lesson about global event bus HMR survival.
2. **Update integration-builder skill**: Already in Phase 5 doc updates — ensure the skill's scaffolding templates generate `export const adapter = ...` in new providers' `integration.ts`.

## Recommendation

**Ready to implement.** Zero BC violations, all changes additive, single live migration target with only internal consumers. Apply the two "Before Implementation" remediations (template file + generator assumption note) to the spec, then proceed phase-by-phase.
