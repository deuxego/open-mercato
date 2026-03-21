# Pre-Implementation Analysis: SPEC-069 — Inngest Integration

## Executive Summary

SPEC-069 is well-architected with clean module isolation, proper tenant scoping, and zero-residue removability. **No backward compatibility violations** — all changes are additive. However, **3 critical implementation gaps** block Phase 2 (Event Bridge): `matchEventPattern` is not exported, the persistent worker doesn't pass `eventName` to subscriber context, and `process.exit(1)` in the serve route is unsafe. Overall readiness is high — fix the gaps and this is ready to implement.

---

## Backward Compatibility

### Violations Found

| # | Surface | Issue | Severity | Proposed Fix |
|---|---------|-------|----------|-------------|
| — | — | No violations found | — | — |

All changes are **additive**:
- New package (`packages/inngest/`) — no existing code modified
- New convention file (`inngest.workflows.ts`) — new discovery path, doesn't alter existing ones
- New DI service names (`inngestClient`, `inngestRegisteredEvents`) — additions
- New generated file (`inngest-workflows.generated.ts`) — addition
- New API route (`/api/inngest`) — addition
- Events worker wildcard fix — **behavioral change** but non-breaking (no existing persistent subscriber uses wildcards; ephemeral already supports them)

### BC Surface Audit (All 13 Categories)

| # | Surface | Status | Notes |
|---|---------|--------|-------|
| 1 | Auto-discovery file conventions | Clean | New `workflows/*.ts` + `inngest.workflows.ts` — additive; doesn't modify existing convention files |
| 2 | Type definitions & interfaces | Clean | New types only (`WorkflowMeta`, `WorkflowHandler`, `WorkflowContext`) |
| 3 | Function signatures | Clean | New functions only (`wrapWorkflow`, `createScopedWorkflowContainer`) |
| 4 | Import paths | Clean | New package `@open-mercato/inngest` — no moved modules |
| 5 | Event IDs | Clean | No event IDs created, renamed, or removed; bridge forwards existing events |
| 6 | Widget injection spot IDs | N/A | No UI widgets |
| 7 | API route URLs | Clean | New `/api/inngest` endpoint — addition only |
| 8 | Database schema | N/A | No Mercato database changes (Inngest uses its own DB) |
| 9 | DI service names | Clean | New names only: `inngestClient`, `inngestRegisteredEvents` |
| 10 | ACL feature IDs | N/A | No new features/permissions |
| 11 | Notification type IDs | N/A | No notifications |
| 12 | CLI commands | N/A | No CLI changes |
| 13 | Generated file contracts | Clean | New `inngest-workflows.generated.ts` with new exports `functions`, `registeredEvents` |

### Missing BC Section

The spec does not include a "Migration & Backward Compatibility" section. Not strictly needed since all changes are additive, but the events worker wildcard fix should be documented as a behavioral change (even though it's non-breaking).

---

## Spec Completeness

### Present Sections

| Section | Status |
|---------|--------|
| TLDR & Overview | Present |
| Problem Statement | Present |
| Proposed Solution + Architecture | Present — with design decision analysis |
| Types | Present |
| Risks & Impact Review | Present — 7 risks with mitigations |
| Phasing | Present — 5 phases |
| Implementation Plan | Present — steps per phase |
| Integration Test Coverage | Present — 7 test scenarios |
| Removability | Present — 7-step removal plan |
| Constraints | Present — 11 documented constraints |
| Changelog | Present |

### Missing Sections

| Section | Impact | Recommendation |
|---------|--------|---------------|
| Data Models | Low | N/A — no Mercato entities. Inngest manages its own state. Note this explicitly. |
| API Contracts | Low | Only `/api/inngest` (Inngest SDK-managed). Add a brief note: "API contract owned by Inngest SDK; no custom endpoints." |
| UI/UX | Low | N/A for Phase 1-5. Future phases may add Inngest dashboard link in admin. |
| Final Compliance Report | Medium | Required by spec-writing skill. Add compliance matrix (can reuse the architectural review from earlier). |

### Incomplete Sections

| Section | Gap | Recommendation |
|---------|-----|---------------|
| Phase 1 steps | Missing `registry.ts` creation (defined in 10.4 but not listed in Phase 1 steps) | Add step: "Create `registry.ts` with `registerInngestBridge`, `getInngestClient`, `getRegisteredEvents`" |
| Phase 2 steps | Missing `matchEventPattern` export step | Add step: "Export `matchEventPattern` from `packages/events/src/bus.ts`" |
| Phase 2 steps | Missing worker `eventName` propagation fix | Add step: "Pass `eventName` to subscriber context in events worker" |
| Docker (11.1) | `inngest` service needs `command` — Inngest image default entrypoint may not start dev server correctly | Add pre-verification step result and explicit `command` if needed |
| Section 10.4 | Duplicate section number (two "10.4" subsections) | Renumber serve route to 10.5 |

---

## AGENTS.md Compliance

### Violations

| Rule | Source | Location | Fix |
|------|--------|----------|-----|
| `matchEventPattern` is private to `bus.ts` | Events AGENTS.md | Spec §9.1 — worker fix references it but doesn't address export | Export from `bus.ts` or extract to `packages/events/src/lib/match-event-pattern.ts` |
| Worker doesn't pass `eventName` to subscriber handlers | Events AGENTS.md / `SubscriberContext` type | Spec §9.2 — bridge uses `ctx.eventName` but worker doesn't provide it | Fix worker to pass `eventName` in context: `{ resolve: ctx.resolve, eventName: event }` |
| Docker changes must use `dev-container-maintenance` skill | Dev Container AGENTS.md | Spec §11 | Note in implementation plan: "Use `dev-container-maintenance` skill for Phase 3" |
| Integration packages must be dedicated npm packages | Root AGENTS.md | Spec §4 | Compliant — `packages/inngest/` is a standalone package |
| Persistent subscribers must be idempotent | Events AGENTS.md | Spec §9.2 | Compliant — `inngest.send()` is idempotent (Inngest deduplicates) |
| Use `findWithDecryption` for entity reads | Core AGENTS.md | Spec §7 constraints | Compliant — documented as constraint |
| `process.exit(1)` is unsafe | Lessons.md (spirit of) | Spec §10.4 serve route | Replace with `throw new Error(...)` — Next.js handles startup errors gracefully |

### Compliant Items

| Rule | Status |
|------|--------|
| Module placement in `packages/<name>/` | Compliant |
| DI via Awilix, not direct `new` | Compliant |
| Tenant scoping via `organization_id` filters | Compliant |
| Convention file follows `<module>.<concept>.ts` pattern | Compliant |
| GeneratorPlugin matches existing interface | Compliant |
| No cross-module ORM relationships | Compliant (N/A — no entities) |
| Subscriber exports `metadata` with `{ event, persistent, id }` | Compliant |

---

## Risk Assessment

### High Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Worker doesn't pass `eventName` to subscriber context | Bridge subscriber uses `ctx.eventName` — will be `undefined`, causing silent no-op (all events skipped) | Fix worker dispatch to include `eventName` in context object |
| `matchEventPattern` not exported | Worker fix in §9.1 will fail to compile — blocks Phase 2 entirely | Export from `bus.ts` or extract to shared utility |

### Medium Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| `process.exit(1)` kills Next.js process | Misconfiguration crashes prod instead of surfacing error | Replace with `throw new Error(...)` |
| Inngest SDK version not pinned | Breaking changes between Inngest SDK majors could break build | Pin to `^3.x.x` (or whatever verified version) in `package.json` |
| Bootstrap registrations currently empty | `runBootstrapRegistrations()` exists but has no calls — need to verify generator correctly appends to it | Verify with `yarn generate` after Phase 1; inspect generated `bootstrap-registrations.generated.ts` |
| Burst recovery after Inngest outage | Events queue in BullMQ during downtime, all fire simultaneously on recovery | Document expected behavior; consider adding jitter or rate-limited drain |

### Low Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Wildcard iteration O(n) in persistent worker | Performance impact negligible with <100 subscriber patterns | Monitor; optimize to pre-filter exact matches before pattern iteration if needed |
| Convention file BC burden | `inngest.workflows.ts` is FROZEN once shipped | Matches existing precedent (`security.mfa-providers.ts`) — acceptable |
| Docker image `inngest/inngest:latest` unpinned | Build reproducibility | Pin to specific verified tag after Phase 3 pre-verification step |

---

## Gap Analysis

### Critical Gaps (Block Implementation)

1. **`matchEventPattern` not exported from `bus.ts`**: The events worker fix (§9.1) uses this function but it's private. Must export it or extract to a shared location. Without this, Phase 2 cannot compile.

2. **Worker doesn't propagate `eventName` to subscriber context**: The `SubscriberContext` type includes `eventName?: string` but the worker currently constructs context as `{ resolve: ctx.resolve }` only. The bridge subscriber checks `ctx.eventName` — it will always be `undefined`, silently skipping all events. Must fix worker to pass `{ resolve: ctx.resolve, eventName: event }`.

3. **`process.exit(1)` in serve route**: Replace with `throw new Error(...)` to let Next.js handle the error without killing the process.

### Important Gaps (Should Address)

4. **Inngest SDK version not specified**: `package.json` in spec lists `inngest` as dependency without version range. Pin to verified semver range.

5. **`registry.ts` not in Phase 1 implementation steps**: The file is defined in §10.4 but not listed as a Phase 1 deliverable. Add it.

6. **Duplicate section numbering**: Two "10.4" subsections (Bridge Registration Function and Serve Route). Renumber.

7. **No unit test plan**: Integration tests are listed but no unit tests for `WorkflowContext`, `wrapWorkflow`, `assertJsonSerializable`, or the bridge subscriber. These are critical correctness paths.

8. **`_inngestOrigin` as reserved field not documented in events system**: Should be documented as a reserved payload field in events AGENTS.md or types to prevent accidental use/stripping by other modules.

### Nice-to-Have Gaps

9. **Inngest Docker image `command` not specified**: Default entrypoint may or may not start the dev server on port 8288. Pre-verification step (§11.6) should resolve this, but result should be captured in spec.

10. **No `INNGEST_DEV` in `fullapp.dev.yml`**: Dev container sets it but fullapp.dev doesn't. Document intentional choice or add it.

11. **No monitoring/observability section**: How to view Inngest dashboard, check workflow status, debug failed steps. Add to Phase 5 docs.

---

## Remediation Plan

### Before Implementation (Must Do)

1. **Export `matchEventPattern`**: Either add `export` to the function in `packages/events/src/bus.ts`, or extract to `packages/events/src/lib/match-event-pattern.ts` and import in both `bus.ts` and `events.worker.ts`.

2. **Fix worker `eventName` propagation**: In `events.worker.ts`, change the subscriber invocation from `sub.handler(payload, { resolve: ctx.resolve })` to `sub.handler(payload, { resolve: ctx.resolve, eventName: event })`.

3. **Replace `process.exit(1)` with `throw`**: In the serve route, use `throw new Error('INNGEST_DEV=1 is not allowed outside development')`.

4. **Add `registry.ts` to Phase 1 steps**: Include it as step 1b after creating the core files.

5. **Pin Inngest SDK version**: Specify `"inngest": "^3.0.0"` (or verified version) in spec.

6. **Fix duplicate section numbering**: Renumber §10.4 (Serve Route) to §10.5.

### During Implementation (Add to Spec)

7. **Add unit test plan**: Test `WorkflowContext.resolve()` outside step (error), `assertJsonSerializable` with MikroORM-like objects, bridge subscriber with/without `_inngestOrigin`, bridge subscriber with unregistered events.

8. **Document `_inngestOrigin` as reserved field**: Add note to events package AGENTS.md.

9. **Use `dev-container-maintenance` skill for Phase 3**: All Docker/devcontainer changes must go through that skill.

10. **Capture Docker pre-verification results**: After running §11.6 commands, update spec with pinned image tag and confirmed entrypoint/command.

### Post-Implementation (Follow Up)

11. **Add Task Router row**: Root AGENTS.md should get "Inngest workflow authoring" → `packages/inngest/AGENTS.md`.

12. **Add observability docs**: How to access Inngest dashboard, debug workflows, view step history.

13. **Consider `assertJsonSerializable` in production**: Currently dev-only — evaluate adding a lightweight check in prod (warn, don't throw).

---

## Recommendation

**Ready to implement after 6 pre-implementation fixes** (items 1-6 above). None require architectural changes — they are targeted code fixes and spec corrections. The core design is sound, well-isolated, and follows established patterns. Estimated fix time: <30 minutes of spec updates.
