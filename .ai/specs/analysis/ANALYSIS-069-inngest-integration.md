# Pre-Implementation Analysis: SPEC-069 — Inngest Integration (v0.9)

## Executive Summary

SPEC-069 v0.9 is **ready to implement**. Zero backward compatibility violations — all changes are additive. The architecture is clean: standalone package, inferred types from SDK, flat handler args, proper widget injection pattern, tenant-scoped DI. Two minor gaps remain (missing spec template sections, `injection-table.ts` export format), neither blocks implementation.

---

## Backward Compatibility

### Violations Found

| # | Surface | Issue | Severity | Proposed Fix |
|---|---------|-------|----------|-------------|
| — | — | No violations found | — | — |

All 13 contract surfaces pass — purely additive changes:

| # | Surface | Status |
|---|---------|--------|
| 1 | Auto-discovery conventions | PASS — new `workflows/*.ts` + `inngest.workflows.ts` |
| 2 | Type definitions | PASS — new types only (`WorkflowMeta`, `WorkflowTools`, `WorkflowHandler`) |
| 3 | Function signatures | PASS — new functions only (`wrapWorkflow`, `buildDIRun`) |
| 4 | Import paths | PASS — new `@open-mercato/inngest` package |
| 5 | Event IDs | PASS — no events created or modified |
| 6 | Widget injection spot IDs | PASS — uses existing `menu:sidebar:settings` |
| 7 | API route URLs | PASS — new `/api/inngest` endpoint |
| 8 | Database schema | PASS — no Mercato schema changes |
| 9 | DI service names | PASS — new `inngestClient` |
| 10 | ACL feature IDs | N/A |
| 11 | Notification type IDs | N/A |
| 12 | CLI commands | N/A |
| 13 | Generated file contracts | PASS — new `inngest-workflows.generated.ts` |

### Missing BC Section

Not strictly needed — all changes are additive. The `inngest.workflows.ts` convention file is correctly marked as FROZEN once shipped.

---

## Spec Completeness

### Present Sections

- [x] TLDR & Overview
- [x] Problem Statement
- [x] Proposed Solution + Architecture + Design Decisions
- [x] Package Structure
- [x] Implementation details (Client, Container, Tools, Adapter, Triggering, Discovery)
- [x] Docker Infrastructure
- [x] Types
- [x] Constraints
- [x] Removability
- [x] Risks & Impact Review
- [x] Phasing (4 phases, each results in working app)
- [x] Integration Test Coverage
- [x] Changelog

### Missing Sections

| Section | Impact | Recommendation |
|---------|--------|---------------|
| Data Models | None | Add one-liner: "N/A — no Mercato entities. Inngest manages workflow state in its own PostgreSQL database." |
| API Contracts | Low | Add brief note: "/api/inngest — SDK-managed, exports GET/POST/PUT via `serve()`. Does not export `openApi` (consumed by Inngest, not app's OpenAPI spec)." |
| Final Compliance Report | Low | Can be derived from this analysis. Add reference to ANALYSIS-069. |

### Incomplete Sections

| Section | Gap | Recommendation |
|---------|-----|---------------|
| §10.5 Widget | `injection-table.ts` uses named re-export, but real examples use `ModuleInjectionTable` type with spot→widgetId mapping | Verify during implementation which pattern the scanner expects — the current approach may work if the scanner handles both |
| §9.3 Example | Contains `import { referenceFunction }` inside a function body (invalid TS) | Move import to top of file in the example |
| §3.1 Architecture diagram | References `ctx.run()` and `ctx.step.sleep()` — stale from v0.8 class-based approach | Update to `run()` and `step.sleep()` (no `ctx.` prefix) |

---

## AGENTS.md Compliance

### Violations

| Rule | Location | Fix |
|------|----------|-----|
| Widget injection: map via `injection-table.ts` | §10.5 | The spec's `injection-table.ts` uses a named re-export pattern. Verify against the integrations module's `ModuleInjectionTable` pattern during implementation. Both patterns may be valid — the scanner may support both. |
| No hardcoded user-facing strings | §10.5 widget | `'Inngest Dashboard'` is hardcoded. Acceptable: "Inngest" is a brand name, widget is dev-only. Add i18n key if the widget becomes user-facing in future. |

### Compliant Items

| Rule | Status |
|------|--------|
| Package placement in `packages/<name>/` | Compliant |
| DI via Awilix, not direct `new` | Compliant |
| Tenant scoping via queryEngine/findWithDecryption | Compliant |
| Convention file follows `<module>.<concept>.ts` | Compliant |
| GeneratorPlugin uses `Record<string, unknown>` casts (not `any`) | Compliant |
| Subscriber exports `metadata` with `{ event, persistent, id }` | Compliant (§9.2 example) |
| No cross-module ORM relationships | N/A — no entities |
| Serve route placement justified | Compliant — comment explains why |

---

## Risk Assessment

### High Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Inngest SDK v4 type inference may not work as specced | Types like `Parameters<typeof inngest.createFunction>[0]` could resolve to `any` or over-broad unions depending on SDK overloads | Phase 1 Step 1 explicitly verifies type exports before building on them |

### Medium Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Inngest server down — `inngest.send()` fails | Events lost unless caller handles retry | Documented in R1. Persistent subscribers provide BullMQ retry. API routes return error to client. |
| `run()` vs `step.run()` confusion | Developer uses wrong one, gets runtime error | Decision tree in §9.5. AGENTS.md for the package (Phase 4) should include common mistakes section. |

### Low Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Docker profile activation unfamiliar to developers | First profile-gated service — developers may not know how to enable | §11.1 documents activation methods |
| Workflow ID naming collision with domain events | A workflow ID without hyphens could match a domain event | §14 constraint: "Workflow IDs MUST contain hyphens" — convention-enforced |

---

## Gap Analysis

### Critical Gaps (Block Implementation)

None.

### Important Gaps (Should Address)

1. **§3.1 architecture diagram uses `ctx.` prefix** — stale from v0.8 class-based approach. Update to match v0.9 flat pattern (`run()`, `step.sleep()`).
2. **§9.3 example has invalid `import` inside function body** — move `import { referenceFunction }` to top-level.
3. **Verify `injection-table.ts` export format** during Phase 1 — the spec uses named re-export but the integrations module uses `ModuleInjectionTable` type. Both may work.

### Nice-to-Have Gaps

4. Add "Data Models: N/A" and "API Contracts: /api/inngest (SDK-managed)" one-liners for spec template completeness.
5. Consider adding `assertJsonSerializable` as a lightweight prod check (currently dev-only) — low priority, documented as acceptable tradeoff.

---

## Remediation Plan

### Before Implementation (Must Do)

1. **Fix §3.1 diagram** — replace `ctx.run()` / `ctx.step.sleep()` with `run()` / `step.sleep()`
2. **Fix §9.3 import** — move `import { referenceFunction }` to top-level of example

### During Implementation (Verify)

3. **Phase 1 Step 1** — verify `Parameters<typeof inngest.createFunction>` resolves correctly with Inngest SDK v4.0.4
4. **Phase 1 Step 4** — verify `injection-table.ts` format works with the module scanner

### Post-Implementation (Follow Up)

5. Add Task Router row to root AGENTS.md: "Inngest workflow authoring" → `packages/inngest/AGENTS.md`
6. Update ANALYSIS-069 with implementation results

---

## Recommendation

**Ready to implement.** Two trivial spec fixes (stale `ctx.` prefix in diagram, invalid import in example) can be addressed inline during implementation. No architectural changes needed. The v0.9 rewrite to flat `WorkflowTools` and inferred SDK types is clean and well-aligned with codebase patterns.
