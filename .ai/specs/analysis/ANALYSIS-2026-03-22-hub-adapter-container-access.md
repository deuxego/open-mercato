# Pre-Implementation Analysis: Hub Adapter Container Access

## Executive Summary

The spec is well-structured, BC-safe, and ready for implementation with one gap: the `ConsoleChannelAdapter` implementation file is missing from the implementation plan. All 13 backward compatibility surfaces pass — changes are purely additive (optional `ctx?` parameter). No critical blockers.

**Recommendation: Ready to implement** after addressing the gap below.

## Backward Compatibility

### Violations Found

None. All changes are additive.

| # | Surface | Check | Result |
|---|---------|-------|--------|
| 1 | Auto-discovery file conventions | No convention files renamed/removed | **Pass** |
| 2 | Type definitions & interfaces | Optional `ctx?` added to interface methods (additive) | **Pass** |
| 3 | Function signatures | New optional parameter appended at end | **Pass** |
| 4 | Import paths | New exports (`AdapterContext`, `AdapterLogger`) from existing `@open-mercato/shared/lib/hub` path | **Pass** |
| 5 | Event IDs | No events changed | **N/A** |
| 6 | Widget injection spot IDs | No spots changed | **N/A** |
| 7 | API route URLs | No API routes changed | **N/A** |
| 8 | Database schema | No schema changes | **N/A** |
| 9 | DI service names | No DI keys renamed; `resolve` added to `EngineDeps` (internal type, not DI key) | **Pass** |
| 10 | ACL feature IDs | No features changed | **N/A** |
| 11 | Notification type IDs | No notification types changed | **N/A** |
| 12 | CLI commands | No CLI changes | **N/A** |
| 13 | Generated file contracts | No generated exports changed | **N/A** |

### BC Section in Spec

Present and thorough. Covers surfaces #1-5 with correct classifications.

### Additional BC Note

`dataSyncHub` is listed in `BACKWARD_COMPATIBILITY.md` Surface #3 (Function Signatures) at line 108: _"Sole API for adapter registration. MUST NOT change method signatures."_ The spec correctly leaves `dataSyncHub` API (`register`, `get`, `list`, `clear`) unchanged. Only the adapter interface methods gain the optional parameter.

## Spec Completeness

### Missing Sections

| Section | Impact | Recommendation |
|---------|--------|---------------|
| Integration Test Coverage | Low — API contracts unchanged, E2E tests unaffected | Add a note: "No new integration tests required. E2E tests exercise adapter methods indirectly via API routes; the `ctx` parameter is built server-side and transparent to API consumers." |

### Incomplete Sections

| Section | Gap | Recommendation |
|---------|-----|---------------|
| Implementation Plan Phase 2 | Does not mention updating `ConsoleChannelAdapter` implementation | Add Step 2.3: Update `apps/mercato/src/modules/channel_console/lib/adapter.ts` — add `ctx?` parameter to `send()` method |
| Implementation Plan Phase 4 | Does not mention `hub-bootstrap-integration.test.ts` | Verify if `packages/shared/src/lib/hub/__tests__/hub-bootstrap-integration.test.ts` has a `TestSyncAdapter` interface that needs `ctx?` added |
| Implementation Plan Phase 3 | Doesn't note why `api/run.ts` and `api/options.ts` are excluded | Add a note: "api/run.ts and api/options.ts call `dataSyncHub.get()` but only read adapter properties (providerKey, direction, supportedEntities) — they never invoke adapter methods, so no ctx needed." |
| Architecture | `getInitialCursor` is defined but never called in production code | Non-blocking, but note for awareness — adding `ctx?` is correct for interface consistency |

## AGENTS.md Compliance

### Violations

| Rule | Location | Fix |
|------|----------|-----|
| `shared/AGENTS.md`: "MUST check for existing utilities before adding new helpers" | Phase 1: AdapterLogger type | Verify no existing logger interface exists in `packages/shared/src/lib/` that could be reused. If not, the inline type is correct. |
| `core/AGENTS.md`: "Integration provider packages MUST own their env-backed preconfiguration inside the provider package" | N/A — no provider-specific logic | **Compliant** — AdapterContext is framework infrastructure, not provider-specific |

### Compliance Passes

| Rule | Status |
|------|--------|
| `shared/AGENTS.md`: No domain logic in shared | **Pass** — `AdapterContext` is infrastructure |
| `shared/AGENTS.md`: No `any` types | **Pass** — uses `<T = unknown>` |
| `shared/AGENTS.md`: Export narrow interfaces | **Pass** — 3-field type, no leaked internals |
| `shared/AGENTS.md`: Zero domain dependencies | **Pass** — inline types only, no imports from core |
| `core/AGENTS.md`: DI via Awilix | **Pass** — `resolve` wraps Awilix cradle proxy |
| `core/AGENTS.md`: API routes export `openApi` | **N/A** — no new routes |
| `data_sync/AGENTS.md`: Scope by org/tenant | **Pass** — `ctx.scope` carries both |
| `data_sync/AGENTS.md`: Adapters registered via hub | **Pass** — hub API unchanged |
| Root `AGENTS.md`: No `any` types | **Pass** |
| Root `AGENTS.md`: Prefer functional, data-first utilities | **Pass** — `buildAdapterContext` is a pure function |

## Risk Assessment

### High Risks

None identified beyond what the spec already documents.

### Medium Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| ConsoleChannelAdapter not in plan | Implementation will fail TypeScript type check if interface changes but implementation doesn't | Add to Phase 2 as Step 2.3 |

### Low Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| hub-bootstrap-integration.test.ts | None — test-only interfaces declare readonly properties only, no methods with `ctx` | No change needed |
| No callers of `NotificationChannelAdapter.send()` exist yet | ctx wiring can't be verified end-to-end for notification channel | Acceptable — the interface change is still valid; callers will wire ctx when implemented |
| `getInitialCursor` is never called | Adding ctx to an unused method creates dead code in the interface | Non-blocking; interface consistency is more important than pruning unused optional methods |

## Gap Analysis

### Critical Gaps (Block Implementation)

None.

### Important Gaps (Should Address)

1. **ConsoleChannelAdapter implementation missing from plan**: `apps/mercato/src/modules/channel_console/lib/adapter.ts` implements `NotificationChannelAdapter`. When the interface adds `ctx?` to `send()`, this implementation's method signature must also accept it. Add Step 2.3 to Phase 2.

2. ~~Bootstrap integration test~~ — verified: `TestSyncAdapter` in `hub-bootstrap-integration.test.ts` only declares readonly properties, no adapter methods. No change needed.

### Nice-to-Have Gaps

1. **Explicit exclusion reasoning**: The spec should note why `api/run.ts` and `api/options.ts` don't need changes (they call `dataSyncHub.get()` but only read adapter properties, never invoke methods).

2. **Integration test coverage statement**: Add explicit note that no new integration tests are needed since API contracts are unchanged and ctx is built server-side.

3. **Standalone app template check**: Per lessons.md ("Keep standalone agentic content in sync with module conventions"), check if `packages/create-app/agentic/` references adapter patterns that should mention `ctx`. Since `ctx` is optional and doesn't change convention files, this is low priority.

## Remediation Plan

### Before Implementation (Must Do)

1. **Add Step 2.3**: Update `ConsoleChannelAdapter` in `apps/mercato/src/modules/channel_console/lib/adapter.ts` — add `ctx?: AdapterContext` to `send()` method.

### During Implementation (Add to Spec)

1. **Note api/run.ts and api/options.ts exclusion**: Document in Phase 3 why these files don't need changes.
2. **Note integration test status**: Document that E2E tests are unaffected and no new integration tests are needed.

### Post-Implementation (Follow Up)

1. **Update data_sync/AGENTS.md**: Add a note about `AdapterContext` availability in adapter methods.
2. **Verify standalone agentic content**: Quick check of `packages/create-app/agentic/shared/` for adapter pattern references.

## Recommendation

**Ready to implement** — no critical blockers. Add `ConsoleChannelAdapter` to Phase 2 (Step 2.3) before starting implementation. The spec's BC analysis is correct and thorough. All 13 contract surfaces pass.
