# Pre-Implementation Analysis: Portal UI Refresh — shadcn Primitives & Block-Based Redesign

## Executive Summary

The spec is **ready for implementation** with no blocking issues. After 8 prior review passes, all critical gaps have been addressed. This analysis found **zero backward compatibility violations**, confirmed all 13 contract surface categories are clean, and identified only 2 minor gaps worth noting. The spec is the most thoroughly reviewed UI-only spec in the project.

**Recommendation: Proceed with implementation.**

---

## Backward Compatibility

### All 13 Contract Surface Categories — Audit Results

| # | Surface | Classification | Spec Impact | Verdict |
|---|---------|---------------|-------------|---------|
| 1 | Auto-discovery file conventions | FROZEN | No portal auto-discovery files renamed or removed. No new module files (no `events.ts`, `acl.ts`, `search.ts`). | **CLEAN** |
| 2 | Type definitions & interfaces | STABLE | `PortalShellProps`, `PortalLayoutShellProps`, `PortalProviderProps`, `PortalNotificationPanelProps`, `PortalFeatureCardProps`, all hook return types — spec explicitly preserves all. No fields removed or narrowed. | **CLEAN** |
| 3 | Function signatures | STABLE | All hook signatures unchanged (`usePortalInjectedMenuItems`, `usePortalNotifications`, `usePortalEventBridge`, `usePortalAppEvent`, `usePortalDashboardWidgets`, `useTenantContext`, `useCustomerAuth`). No params removed or reordered. | **CLEAN** |
| 4 | Import paths | STABLE | No files moved or renamed. `PortalLayoutProvider.tsx` deprecated alias preserved. New import paths added (`@open-mercato/ui/primitives/sheet`, etc.) — additive only. | **CLEAN** |
| 5 | Event IDs | FROZEN | No event IDs modified. All 6 `portalBroadcast: true` events in `customer_accounts/events.ts` unaffected. `om:portal-event` DOM event name (`PORTAL_EVENT_DOM_NAME`) unaffected. `om:portal-bridge:reconnected` synthetic event unaffected. | **CLEAN** |
| 6 | Widget injection spot IDs | FROZEN | All portal spots preserved: 4 menu spots (`menu:portal:sidebar:main`, `menu:portal:sidebar:account`, `menu:portal:header:actions`, `menu:portal:user-dropdown`), `portal:dashboard:sections/profile/sidebar`, and page before/after patterns. Spec correctly notes 4 spots are declared-but-unrendered. | **CLEAN** |
| 7 | API route URLs | STABLE | No API routes modified. Portal hooks consume `/api/customer_accounts/portal/profile`, `/api/customer_accounts/portal/events/stream`, `/api/customer_accounts/portal/notifications` — all unchanged. | **CLEAN** |
| 8 | Database schema | ADDITIVE-ONLY | N/A — no data model changes. | **CLEAN** |
| 9 | DI service names | STABLE | N/A — no DI registrations modified. | **CLEAN** |
| 10 | ACL feature IDs | FROZEN | N/A — no feature IDs modified. | **CLEAN** |
| 11 | Notification type IDs | FROZEN | N/A — no notification types modified. | **CLEAN** |
| 12 | CLI commands | STABLE | N/A — no portal CLI commands exist. | **CLEAN** |
| 13 | Generated file contracts | STABLE | Generated files (`injection-tables.generated.ts`, `injection-widgets.generated.ts`, `events.generated.ts`) are derived from module declarations. No changes to generation inputs. `modules:prepare` not needed. | **CLEAN** |

### Violations Found

None.

### Missing BC Section

The spec has a thorough "Migration & Backward Compatibility" section covering FROZEN surfaces, STABLE surfaces, DOM structure changes, and SidebarProvider/component replacement interaction. This section was validated and expanded across multiple review passes.

---

## Spec Completeness

### Required Sections Check

| Section | Present | Quality |
|---------|---------|---------|
| TLDR & Overview | Yes | Clear scope, concerns, market reference |
| Problem Statement | Yes | 4 concrete problems with evidence |
| Proposed Solution | Yes | Includes "What Does NOT Change", "What Changes Behaviorally", design decisions |
| Architecture | Yes | File structure, component hierarchy, 3 wireframes |
| Data Models | Yes (N/A) | Correctly marked N/A |
| API Contracts | Yes (N/A) | Correctly marked N/A |
| UI/UX | Yes | Wireframes for sidebar-08, login-03, signup-05 |
| Internationalization | Yes | 8 new translation keys enumerated |
| Risks & Impact Review | Yes | 12 risks with scenario/severity/mitigation/residual |
| Phasing | Yes | 5 phases (0-4) with deployment strategy |
| Implementation Plan | Yes | Detailed steps per phase |
| Integration Test Coverage | Yes | 11 test cases |
| Final Compliance Report | Yes | 15-row compliance matrix, 7-row consistency check |
| Changelog | Yes | 4 entries documenting review history |

### Missing Sections

None.

### Incomplete Sections

| Section | Gap | Severity | Recommendation |
|---------|-----|----------|---------------|
| Implementation Plan | Phase 3 step "Add portal-specific mobile detection (`useMediaQuery` at 1023px breakpoint)" — `useMediaQuery` hook may not exist in the codebase. Need to verify or create it. | Low | Verify during Phase 3; if missing, implement as a thin wrapper around `useSyncExternalStore` + `matchMedia`, similar to the existing `useIsMobile`. |
| Testing | No test case for tablet viewport (768-1023px) sidebar behavior, despite being a key risk | Low | Add integration test: "Tablet sidebar — viewport 768-1023px shows mobile Sheet, not inline sidebar" |

---

## AGENTS.md Compliance

### Rules Checked

| Rule Source | Rule | Spec Compliance | Notes |
|-------------|------|-----------------|-------|
| `packages/ui/AGENTS.md` | MUST NOT use raw `<button>` | Compliant | All raw buttons replaced |
| `packages/ui/AGENTS.md` | MUST use IconButton for icon-only | Compliant | Close, toggle, bell use IconButton |
| `packages/ui/AGENTS.md` | MUST pass `type="button"` | Compliant | In implementation rules |
| `packages/ui/AGENTS.md` | Portal handles (FROZEN) | Compliant | All 5 preserved |
| `packages/ui/AGENTS.md` | Portal injection spots (FROZEN) | Compliant | Full inventory with unrendered spots noted |
| `packages/ui/AGENTS.md` | `data-menu-item-id` on menu items | Compliant | On SidebarMenuButton elements |
| `AGENTS.md` | Never hard-code user-facing strings | Compliant | `useT()` with new key inventory |
| `AGENTS.md` | No direct ORM between modules | N/A | No data changes |
| `AGENTS.md` | Filter by `organization_id` | N/A | No API changes |
| `AGENTS.md` | Spec MUST list integration coverage | Compliant | 11 test cases |
| `BACKWARD_COMPATIBILITY.md` | FROZEN surfaces immutable | Compliant | All surfaces preserved |
| `BACKWARD_COMPATIBILITY.md` | STABLE types not narrowed | Compliant | All props identical |
| `.ai/lessons.md` | MUST use Button/IconButton primitives | Compliant | Spec addresses this directly |

### Violations

None.

---

## Risk Assessment

### Risks Already in Spec (12 total)

The spec's risk register is comprehensive. All risks have concrete scenarios, severity classifications, mitigations, and residual risk assessments. The critical risk (breakpoint mismatch) and high risk (props contract break) have strong mitigations.

### Additional Risks Not in Spec

| Risk | Severity | Impact | Mitigation |
|------|----------|--------|-----------|
| `useMediaQuery` hook may not exist | Low | Phase 3 blocked until hook is created | Implement as thin `useSyncExternalStore` wrapper; ~15 lines of code. Pattern identical to existing `useIsMobile`. |
| Built-in menu item IDs (`portal-dashboard`, `portal-profile`) not explicitly listed in spec | Low | Could be accidentally omitted from new SidebarMenuButton elements | The spec says "Preserve all `data-menu-item-id` attributes on `SidebarMenuButton` elements" which covers these, but they're not enumerated by name like `portal-logout` is. Implementer should verify all 3 built-in IDs are preserved. |

---

## Gap Analysis

### Critical Gaps (Block Implementation)

None.

### Important Gaps (Should Address)

None — all important gaps were resolved in prior review passes.

### Nice-to-Have Gaps

| Gap | What's Needed |
|-----|---------------|
| `useMediaQuery` hook existence | Verify hook exists or plan to create it in Phase 1 as a sibling to `useIsMobile.ts` |
| Tablet viewport integration test | Add test case verifying 768-1023px shows mobile Sheet behavior |
| Built-in menu item ID enumeration | List `portal-dashboard`, `portal-profile`, `portal-logout` explicitly in Phase 3 Preserved Contracts table |

---

## Remediation Plan

### Before Implementation (Must Do)

Nothing — spec is ready.

### During Implementation (Add to Spec)

1. **Verify `useMediaQuery` hook**: If it doesn't exist, create `packages/ui/src/hooks/useMediaQuery.ts` as a thin `useSyncExternalStore` wrapper during Phase 1 (alongside other primitives). Add to Phase 1 steps.
2. **Verify built-in menu item IDs**: During Phase 3, confirm `data-menu-item-id="portal-dashboard"`, `data-menu-item-id="portal-profile"`, and `data-menu-item-id="portal-logout"` are all present on the new SidebarMenuButton elements.

### Post-Implementation (Follow Up)

1. **Run axe-core/Lighthouse** after Phase 3 to verify accessibility (nav landmark, aria-labels, focus management).
2. **Measure bundle delta** at Phase 1 and Phase 3 checkpoints as specified in the risk register.
3. **Tablet viewport QA**: Manual test at 768px, 900px, and 1023px viewports to verify sidebar behavior matches current `lg:` breakpoint behavior.

---

## Recommendation

**Ready to implement.** The spec has been through 8 review passes (3 solo + 5 parallel agents) resolving 31 findings. All 13 backward compatibility categories are clean. The 2 nice-to-have gaps are trivially addressable during implementation. No spec updates needed before starting Phase 0.
