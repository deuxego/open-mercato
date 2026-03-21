# Portal UI Refresh — shadcn Primitives & Block-Based Redesign

## TLDR

Replace hand-rolled portal UI with shadcn primitives and block-based layouts. Add 5 new primitives (Sheet, Avatar, Select, Skeleton, Sidebar), migrate inline SVGs to lucide-react, refactor PortalShell to use shadcn Sidebar system (sidebar-08 block), redesign login/signup pages using shadcn blocks (login-03, signup-05), and polish all portal pages. No hook/logic changes, no backend admin changes, all FROZEN contracts preserved.

**Concerns**: DOM structure changes in PortalShell (shadcn Sidebar adds wrappers); SSR handling for SidebarProvider state; must preserve all `data-portal-handle` and `data-menu-item-id` attributes for backward compatibility.

## Overview

The customer portal (`packages/ui/src/portal/` + `packages/core/src/modules/portal/frontend/`) currently uses hand-rolled HTML with Tailwind classes for its sidebar, notification panel, mobile drawer, and auth pages. The existing `packages/ui/src/primitives/` already follow shadcn patterns (CVA + Radix + `cn()`) but are missing key components needed by the portal.

This spec upgrades the portal to use proper shadcn primitives and block-based page layouts while preserving all backward compatibility contracts, FROZEN handle IDs, injection spots, and public API surfaces.

**Market Reference**: shadcn/ui — adopted its primitive patterns (CVA + Radix + `cn()`), Sidebar system (sidebar-08 block), and auth page blocks (login-03, signup-05). Rejected full primitive replacement since existing primitives have project-specific customizations (`data-slot`, `IconButton`, mobile-first Dialog, custom Tabs context).

## Problem Statement

1. **Visual inconsistency**: Portal uses raw `<button>`, `<select>`, `<a>` elements while the backend uses proper `Button`, `IconButton` primitives — violating the project's own AGENTS.md rule ("MUST NOT use raw `<button>` elements").
2. **Missing primitives**: No Sheet, Avatar, Select, Skeleton, or Sidebar primitives exist, forcing hand-rolled implementations.
3. **Developer experience**: Building new portal pages requires copy-pasting raw HTML patterns instead of composing proper components.
4. **Polish**: Notification panel has no focus trapping or scroll lock; mobile sidebar is a manual overlay; loading states use `Spinner` instead of Skeleton placeholders; inline SVG icons are duplicated across files.

## User Stories

1. **Portal developer**: "I want to build a new portal page using proper primitives (Sidebar, Sheet, Avatar) so I don't copy-paste raw HTML and maintain consistency with the rest of the system."
2. **End user**: "I want the portal to feel polished — smooth sidebar transitions, proper focus management in the notification panel, skeleton loading states instead of spinners."
3. **Module author**: "I want to inject widgets and menu items into the portal and have them render with the same visual quality as built-in elements, using the same component library."

## Proposed Solution

### Approach

- Add missing shadcn primitives to `packages/ui/src/primitives/`
- Use shadcn blocks as the basis for portal page layouts (sidebar-08, login-03, signup-05)
- Refactor portal components to wrap existing primitives (Card, Separator, Badge, Tabs, Button, IconButton)
- Replace all inline SVGs with lucide-react icons
- Keep all hooks, context, API routes, and business logic unchanged

### What Does NOT Change

- Existing primitives in `packages/ui/src/primitives/` (they already follow shadcn patterns with project-specific customizations like `data-slot`, `IconButton`, mobile-first Dialog)
- All hooks: `usePortalInjectedMenuItems`, `usePortalNotifications`, `usePortalEventBridge`, `usePortalAppEvent`, `usePortalDashboardWidgets`, `useTenantContext`, `useCustomerAuth`
- `PortalContext.tsx`, `PortalLayoutShell.tsx`, `PortalLayoutProvider.tsx` (deprecated alias)
- Backend admin pages / `AppShell`
- Staff auth pages (login, reset)
- API routes and data contracts
- All FROZEN handle IDs, injection spot IDs, menu item IDs, event IDs

## Architecture

### File Structure (changes only)

```
packages/ui/src/
├── primitives/
│   ├── sheet.tsx          # NEW — Radix Dialog-based side drawer
│   ├── avatar.tsx         # NEW — image + fallback initials
│   ├── select.tsx         # NEW — Radix Select
│   ├── skeleton.tsx       # NEW — pulse animation placeholder
│   └── sidebar.tsx        # NEW — shadcn Sidebar system
├── portal/
│   ├── PortalShell.tsx    # REFACTORED — sidebar-08 block layout
│   └── components/
│       ├── PortalCard.tsx              # REFACTORED — wraps Card primitive
│       ├── PortalNotificationPanel.tsx # REFACTORED — uses Sheet + Tabs
│       ├── PortalNotificationBell.tsx  # REFACTORED — lucide Bell, Badge
│       ├── PortalFeatureCard.tsx       # REFACTORED — uses Card + Button
│       ├── PortalPageHeader.tsx        # MINOR POLISH
│       ├── PortalEmptyState.tsx        # MINOR POLISH (icon migration)
│       └── index.ts                   # UNCHANGED exports
├── frontend/
│   └── LanguageSwitcher.tsx           # REFACTORED — uses Select primitive
```

```
packages/core/src/modules/portal/frontend/[orgSlug]/portal/
├── page.tsx              # POLISHED — lucide icons, Card for features
├── login/page.tsx        # REDESIGNED — login-03 block layout
├── signup/page.tsx       # REDESIGNED — signup-05 block layout
├── dashboard/page.tsx    # POLISHED — Skeleton loading, lucide icons
└── profile/page.tsx      # POLISHED — Avatar, Badge, Skeleton, Separator
```

### Component Hierarchy (Authenticated Portal)

```
PortalLayoutShell (server-resolved props)
  └── PortalProvider (auth + tenant context)
      └── PortalShell [data-portal-handle="page:portal:layout"]
          └── SidebarProvider (inside PortalShell, not above it)
              ├── Sidebar [data-portal-handle="section:portal:sidebar"]
              │   ├── SidebarHeader (org logo + name)
              │   ├── SidebarContent
              │   │   ├── SidebarGroup "Portal" (merged main nav items)
              │   │   └── SidebarGroup "Account" (merged account items)
              │   └── SidebarFooter
              │       ├── Avatar + user info
              │       └── Logout button [data-portal-handle="section:portal:user-menu"]
              ├── SidebarInset
              │   ├── header [data-portal-handle="section:portal:header"]
              │   │   ├── SidebarTrigger (mobile)
              │   │   └── PortalNotificationBell → Sheet (notification panel)
              │   ├── main (children)
              │   └── footer [data-portal-handle="section:portal:footer"]
              └── Sheet (mobile sidebar, built into Sidebar system)
```

### Key Design Decisions

1. **SidebarProvider lives inside PortalShell** — keeps the public API unchanged and ensures component replacement consumers of `section:portal:sidebar` don't need SidebarProvider knowledge.

2. **SSR handling** — `SidebarProvider` defaults to `collapsed=false` and `isMobile=false` during SSR. The `useIsMobile()` hook (from shadcn) returns `false` on server, updates on client mount.

3. **PortalNotificationPanel keeps its props contract** — Sheet is used internally but the component still accepts `{ open, onClose, notifications, unreadCount, onMarkAsRead, onDismiss, onMarkAllRead, t }`. The `open`/`onClose` props map to Sheet's `open`/`onOpenChange`. Sheet inherits Radix Dialog's Escape-to-close behavior. No `Cmd/Ctrl+Enter` shortcut needed as the notification panel has no primary submit action.

4. **Existing primitives are NOT replaced** — they have project-specific customizations (`data-slot`, `IconButton`, mobile-first Dialog, custom Alert variants, custom Tabs context). Only new primitives are added.

### Implementation Rules

All phases MUST follow these conventions:

- Use `IconButton` (not `Button size="icon"`) for all icon-only buttons (close, sidebar toggle, notification bell)
- Pass `type="button"` explicitly on all non-submit `Button`/`IconButton` instances
- All user-facing strings MUST use `useT()` with translation keys, never hard-coded strings
- Use `cn()` from `@open-mercato/shared/lib/utils` in all new primitives

## Data Models

N/A — no data model changes. This spec is a pure UI/component refactor.

## API Contracts

N/A — no API route changes. All existing portal API routes remain unchanged.

## Implementation Phases

### Phase 0: Pre-work — Fix Dependency Declarations

Add missing dependencies to `packages/ui/package.json` that currently work via hoisting but would break on standalone install:

```json
{
  "dependencies": {
    "@radix-ui/react-dialog": "^1.0.5",
    "@radix-ui/react-checkbox": "^1.3.3",
    "@radix-ui/react-label": "^2.1.8",
    "@radix-ui/react-slot": "^1.2.4"
  },
  "peerDependencies": {
    "lucide-react": ">=0.400.0"
  }
}
```

### Phase 1: New Primitives

Add to `packages/ui/src/primitives/`:

| Primitive | Radix Dependency | Notes |
|-----------|-----------------|-------|
| `sheet.tsx` | `@radix-ui/react-dialog` (declared in Phase 0) | Side drawer with `side` prop (top/right/bottom/left) |
| `avatar.tsx` | `@radix-ui/react-avatar` (new) | Image + fallback initials |
| `select.tsx` | `@radix-ui/react-select` (new) | Trigger + content + items |
| `skeleton.tsx` | None | `animate-pulse` div with `cn()` |
| `sidebar.tsx` | `@radix-ui/react-slot` (declared in Phase 0) | Full shadcn Sidebar system: Provider, Content, Group, Menu, MenuItem, MenuButton, Footer, Header, Trigger, Inset |

All new primitives MUST:
- Use `cn()` from `@open-mercato/shared/lib/utils`
- Add `data-slot` attributes for component replacement targeting
- Use `forwardRef` where applicable
- Follow existing CVA patterns where variants are needed

New dependencies to add to `packages/ui/package.json`:
```json
{
  "dependencies": {
    "@radix-ui/react-avatar": "^1.1.0",
    "@radix-ui/react-select": "^2.1.0"
  }
}
```

### Phase 2: Icon Migration

Replace all 11 inline SVG icons with `lucide-react` equivalents:

| File | Inline SVG | lucide-react Replacement |
|------|-----------|------------------------|
| `PortalShell.tsx` | `MenuIcon` | `Menu` |
| `PortalShell.tsx` | `XIcon` | `X` |
| `PortalShell.tsx` | `LogOutIcon` | `LogOut` |
| `PortalNotificationPanel.tsx` | `XIcon` | `X` |
| `PortalNotificationPanel.tsx` | `CheckIcon` | `Check` |
| `PortalNotificationBell.tsx` | `BellIcon` | `Bell` |
| Portal landing `page.tsx` | ShoppingBag icon | `ShoppingBag` |
| Portal landing `page.tsx` | User icon | `User` |
| Portal landing `page.tsx` | Shield icon | `Shield` |
| Portal dashboard `page.tsx` | Widget icon | `LayoutGrid` |
| Portal signup `page.tsx` | Inline check SVG | `CheckCircle` |

### Phase 3: Portal Component Upgrades

#### PortalCard.tsx
- Wrap existing `Card` primitive internally
- Keep all 4 exports with identical props: `PortalCard`, `PortalCardHeader`, `PortalStatRow`, `PortalCardDivider`
- `PortalCardDivider` → use `Separator` primitive internally

#### PortalNotificationPanel.tsx
- Rewrite using `Sheet` (side="right") + existing `Tabs` + `Badge` + `Button`
- Use `IconButton` for the close button (not `Button size="icon"`)
- Props type MUST remain identical: `{ open, onClose, notifications, unreadCount, onMarkAsRead, onDismiss, onMarkAllRead, t }`
- Map `open` → Sheet's `open`, `onClose` → Sheet's `onOpenChange`
- Gains: focus trapping, scroll lock, proper accessibility, animated transitions
- Remove manual Escape handler and hand-rolled backdrop (Sheet handles both)
- Replace raw `<button>` tab elements with `Tabs`/`TabsList`/`TabsTrigger`
- Replace severity badge `<span>` with `Badge` primitive

#### PortalNotificationBell.tsx
- Replace inline SVG `BellIcon` with lucide `Bell`
- Use `IconButton` for the bell button (already uses it)
- Replace unread count `<span>` with `Badge` primitive
- Keep pulse animation logic unchanged

#### PortalFeatureCard.tsx
- Use `Card` primitive internally for the container
- Use `Button asChild` for `href` variant (wrapping `<a>`)
- Use `Button` with `type="button"` for `onClick` variant
- Props type MUST remain identical: `{ icon, title, description, href, onClick }`

#### PortalPageHeader.tsx
- Minor polish: typography refinement only
- No structural changes

#### PortalEmptyState.tsx
- Minor polish: ensure icon prop consumers can pass lucide icons cleanly
- No structural changes

#### index.ts
- UNCHANGED — same 9 named exports: `PortalCard`, `PortalCardHeader`, `PortalStatRow`, `PortalCardDivider`, `PortalPageHeader`, `PortalEmptyState`, `PortalFeatureCard`, `PortalNotificationBell`, `PortalNotificationPanel`

### Phase 4: PortalShell Refactor

Base on **sidebar-08** block layout from shadcn.

#### Public Layout (Unauthenticated)
- Keep current structure (header + hero + footer)
- Replace inline SVG icons with lucide
- Use `Button` consistently (already mostly correct)

#### Authenticated Layout
- Replace hand-rolled `<aside>` sidebar with shadcn `Sidebar` + `SidebarProvider`
- Replace manual mobile overlay (`mobileOpen` state + backdrop div) with Sidebar's built-in mobile Sheet
- Replace `SidebarNavItem` component with `SidebarMenuItem` + `SidebarMenuButton`
- Replace `UserAvatar` with `Avatar` primitive
- Replace inline SVG icons with lucide
- Use `IconButton` for mobile menu toggle (SidebarTrigger)

#### Preserved Contracts
- `data-portal-handle` attributes on: shell root, header, footer, sidebar, user-menu
- `data-menu-item-id` attributes on every nav item (attached to `SidebarMenuButton` or its child `Link`)
- All 5 FROZEN component replacement handle exports unchanged
- `PortalShellProps` type unchanged
- Hook calls: `usePortalInjectedMenuItems`, `mergeMenuItems`, `usePortalContext`, `useT`, `usePathname`
- Event bridge: `PortalEventBridgeMount` component unchanged

#### SSR Considerations
- `SidebarProvider` defaults: `defaultOpen={true}` (sidebar expanded)
- `useIsMobile()` returns `false` during SSR, updates on client mount
- No hydration mismatch: sidebar renders expanded by default, collapses on mobile after mount

### Phase 5: Auth Page Redesign

#### Portal Login (`login/page.tsx`)
- Redesign using **login-03** block layout (card centered on muted background)
- Keep form fields: email, password
- Keep error handling logic (401, 423/locked, generic)
- Keep `InjectionSpot` placements: `portal:login:before`, `portal:login:after`
- Use `Card`, `Input`, `Label`, `Button` primitives (already used, layout changes only)

#### Portal Signup (`signup/page.tsx`)
- Redesign using **signup-05** block layout (social provider button slots)
- Keep form fields: displayName, email, password
- Keep success confirmation screen
- Keep `InjectionSpot` placements: `portal:signup:before`, `portal:signup:after`
- Social provider buttons are placeholder slots (rendered only when providers are configured via injection)

### Phase 6: Portal Page Polish

#### Landing Page (`page.tsx`)
- Replace inline SVG icons with lucide (`ShoppingBag`, `User`, `Shield`)
- Use `Card` for feature cards (via updated `PortalFeatureCard`)
- Tighter typography and spacing
- Preserve `InjectionSpot` placements: `portal:home:before`, `portal:home:after`

#### Dashboard Page (`dashboard/page.tsx`)
- Replace `Spinner` loading state with `Skeleton` placeholders
- Replace inline SVG widget icon with lucide `LayoutGrid`
- Preserve widget customization logic and `om:portal:dashboard:hidden` localStorage key
- Preserve `InjectionSpot` placements: `portal:dashboard:before`, `portal:dashboard:after`
- Preserve `portal:dashboard:sections` (consumed via `usePortalDashboardWidgets` hook)
- Preserve `portal:dashboard:profile`, `portal:dashboard:sidebar` injection spots

#### Profile Page (`profile/page.tsx`)
- Replace loading spinners with `Skeleton` placeholders
- Use `Avatar` for user display
- Use `Badge` for role pills and feature pills (replace raw `<span>` elements; note: `Badge` is already used for email verification and admin status on this page)
- Use `Separator` between card sections
- Preserve `InjectionSpot` placements: `portal:profile:before`, `portal:profile:after`

### Phase 7: Cleanup

- **LanguageSwitcher**: Replace raw `<select>` with `Select` primitive
- **Error boundary**: Add `PortalErrorBoundary` wrapper in `PortalShell` for resilience (nice-to-have, can be deferred)
- Remove dead inline SVG component definitions from refactored files

## Migration & Backward Compatibility

### FROZEN Surfaces — No Changes

| Surface | IDs | Status |
|---------|-----|--------|
| Component replacement handles | `page:portal:layout`, `section:portal:header`, `section:portal:footer`, `section:portal:sidebar`, `section:portal:user-menu` | Preserved on equivalent DOM elements |
| Menu injection spots | `menu:portal:sidebar:main`, `menu:portal:sidebar:account`, `menu:portal:header:actions`, `menu:portal:user-dropdown` | Hook calls unchanged |
| Page injection spots | `portal:home:before/after`, `portal:login:before/after`, `portal:signup:before/after`, `portal:dashboard:before/after`, `portal:dashboard:sections`, `portal:dashboard:profile`, `portal:dashboard:sidebar`, `portal:profile:before/after` | All InjectionSpot components and hook references preserved |
| Menu item test selectors | `data-menu-item-id` on all nav items | Attached to SidebarMenuButton elements |

### STABLE Surfaces — No Breaking Changes

| Surface | Contract | Status |
|---------|----------|--------|
| Import paths | All files under `packages/ui/src/portal/components/` | No files moved or renamed |
| Export names | `PortalCard`, `PortalCardHeader`, `PortalStatRow`, `PortalCardDivider`, `PortalPageHeader`, `PortalEmptyState`, `PortalFeatureCard`, `PortalNotificationBell`, `PortalNotificationPanel` (9 exports) | All preserved with identical names |
| Props types | All portal component props | Identical types, no removed/narrowed fields |
| `PortalShellProps` | Shell prop interface | Unchanged |
| Handle exports | `PORTAL_SHELL_HANDLE`, `PORTAL_HEADER_HANDLE`, `PORTAL_FOOTER_HANDLE`, `PORTAL_SIDEBAR_HANDLE`, `PORTAL_USER_MENU_HANDLE` | Same values, same export names |
| New import paths | New primitives create new import paths (`@open-mercato/ui/primitives/sheet`, etc.) | No existing paths affected |

### DOM Structure Changes

The internal DOM structure of `PortalShell` changes (shadcn Sidebar adds wrapper elements). This is an internal implementation detail, not a contract surface. However:

- `data-portal-handle` attributes remain on the outermost semantic element for each section
- `data-menu-item-id` attributes remain on clickable nav items
- Integration tests using these selectors will continue to work

### SidebarProvider and Component Replacement

`SidebarProvider` lives **inside** `PortalShell`, below the `page:portal:layout` handle boundary. Modules that replace `section:portal:sidebar` will receive a different internal structure but the same data flow (merged menu items, active state, i18n labels). This is acceptable because:

1. Component replacement is documented as replacing the **visual rendering**, not the internal implementation
2. The `data-portal-handle` attribute on the replacement boundary is preserved
3. No replacement consumer currently depends on specific child DOM nesting

## Risks & Impact Review

### SSR Hydration Mismatch

- **Scenario**: `SidebarProvider` reads `document.cookie` for collapsed state and `useIsMobile()` calls `window.matchMedia` — both unavailable during SSR, causing React hydration warnings.
- **Severity**: Medium
- **Affected area**: Portal authenticated layout (all pages inside PortalShell)
- **Mitigation**: Default to `collapsed=false` and `isMobile=false` on server. Sidebar renders expanded, updates on client mount. This is a standard Next.js pattern.
- **Residual risk**: Low — well-trodden approach

### Component Replacement DOM Divergence

- **Scenario**: A third-party module replaces `section:portal:sidebar` and expects specific child DOM nesting from the old hand-rolled sidebar.
- **Severity**: Low
- **Affected area**: Modules using `useRegisteredComponent('section:portal:sidebar', ...)`
- **Mitigation**: `data-portal-handle` stays on the same semantic boundary. Replacement targets the visual container, not internal nesting. No existing consumer depends on specific child DOM.
- **Residual risk**: Low

### PortalNotificationPanel Props Contract Break

- **Scenario**: Rewrite accidentally changes the props type (e.g., dropping `open`/`onClose` in favor of Sheet's internal state).
- **Severity**: High
- **Affected area**: `PortalNotificationBell` and any consumer importing `PortalNotificationPanel`
- **Mitigation**: Props type explicitly preserved in spec. Sheet's `open`/`onOpenChange` mapped to existing `open`/`onClose` props. Code review must verify type identity.
- **Residual risk**: None (mechanical check)

### Integration Test Selector Breakage

- **Scenario**: `data-menu-item-id` or `data-portal-handle` attributes are accidentally omitted from shadcn Sidebar elements, breaking integration tests.
- **Severity**: Medium
- **Affected area**: Integration tests using `[data-menu-item-id="..."]` selectors
- **Mitigation**: Attributes explicitly listed in spec's Preserved Contracts section. Integration tests run as validation gate.
- **Residual risk**: Low

### Bundle Size Increase

- **Scenario**: Adding Radix Select, Avatar, and the Sidebar system increases JS bundle sent to portal users.
- **Severity**: Low
- **Affected area**: Portal page load performance
- **Mitigation**: Under 20KB gzipped incremental. Radix packages share internal dependencies with already-installed packages (Dialog, Popover, Tooltip). Tree-shaking eliminates unused exports.
- **Residual risk**: None

### Partial Deployment Version Mismatch

- **Scenario**: `packages/ui` is updated with new primitives but `packages/core` portal pages are not yet updated to use them, or vice versa.
- **Severity**: Low
- **Affected area**: Monorepo build coherence
- **Mitigation**: All phases are within the same monorepo and deployed together. Phase ordering ensures primitives exist before consumers. No cross-package runtime version negotiation.
- **Residual risk**: None

### N/A Risk Categories

- **Data integrity failures**: N/A — no data model or database changes
- **Tenant & data isolation risks**: N/A — no changes to tenant scoping, auth, or data access patterns
- **Cascading failures**: Addressed via component replacement section above

## Testing

### Manual Verification
- Portal login/signup flows (both success and error states)
- Authenticated portal navigation (sidebar, mobile menu, notifications)
- Dashboard widget customization (show/hide, localStorage persistence)
- Profile page display (avatar, roles, features)
- Language switcher (Select primitive)
- Component replacement handles (verify `data-portal-handle` selectors work)
- Menu injection (verify `data-menu-item-id` selectors work)
- Mobile responsive behavior (sidebar Sheet, notification Sheet)
- SSR: no hydration warnings in console

### Integration Tests

Existing portal-related integration tests must pass unchanged. Additionally, verify or add coverage for:

| Test Case | What to Verify |
|-----------|---------------|
| Portal login flow | Login form renders in login-03 layout, submits correctly, handles errors (401, 423) |
| Portal signup flow | Signup form renders in signup-05 layout, success screen displays, redirects to login |
| Sidebar navigation | Nav items render with `data-menu-item-id`, active state highlights correctly, injected items appear |
| Mobile sidebar | Sheet opens on mobile toggle, closes on item click and Escape, backdrop dismisses |
| Notification panel | Sheet opens from bell icon, tabs switch (All/Unread), mark read/dismiss/view actions work |
| Component replacement handles | All 5 `[data-portal-handle="..."]` selectors resolve to DOM elements |
| Dashboard widgets | Injected widgets render in grid, hide/show persists to localStorage |
| Profile display | Avatar renders with initials, role/feature badges display, email verified badge shows |

## Final Compliance Report

### AGENTS.md Files Reviewed

- Root `AGENTS.md` — conventions, critical rules, import paths, backward compatibility contract
- `packages/ui/AGENTS.md` — Button/IconButton rules, portal extension patterns, component replacement handles, injection spots
- `BACKWARD_COMPATIBILITY.md` — 13 contract surface categories

### Compliance Matrix

| Rule Source | Rule | Status | Notes |
|-------------|------|--------|-------|
| `packages/ui/AGENTS.md` | MUST NOT use raw `<button>` elements | Compliant | All raw buttons replaced with Button/IconButton |
| `packages/ui/AGENTS.md` | MUST use `IconButton` for icon-only buttons | Compliant | Close, toggle, bell buttons use IconButton |
| `packages/ui/AGENTS.md` | MUST pass `type="button"` on non-submit buttons | Compliant | Explicit in implementation rules |
| `AGENTS.md` | Never hard-code user-facing strings | Compliant | All strings use `useT()` |
| `AGENTS.md` | No direct ORM relationships between modules | N/A | No data changes |
| `AGENTS.md` | Always filter by `organization_id` | N/A | No API changes |
| `BACKWARD_COMPATIBILITY.md` | FROZEN surfaces cannot be renamed/removed | Compliant | All 5 handles, all injection spots preserved |
| `BACKWARD_COMPATIBILITY.md` | STABLE surfaces: import paths cannot be removed | Compliant | No files moved or renamed |
| `BACKWARD_COMPATIBILITY.md` | STABLE surfaces: type fields cannot be narrowed | Compliant | All props types identical |
| `packages/ui/AGENTS.md` | Portal component replacement handles | Compliant | All preserved on equivalent DOM elements |
| `packages/ui/AGENTS.md` | Portal injection spots (FROZEN) | Compliant | Full inventory in migration table |
| `packages/ui/AGENTS.md` | `data-menu-item-id` on menu items | Compliant | Attached to SidebarMenuButton elements |
| `AGENTS.md` | Spec MUST list integration coverage | Compliant | 8 test cases defined |

### Verdict

All applicable rules are satisfied. No non-compliant items.

## Changelog

| Date | Change |
|------|--------|
| 2026-03-21 | Initial spec created |
| 2026-03-21 | Added missing sections (Data Models, API Contracts, User Stories, Final Compliance Report). Fixed export count (9, not 6). Added `@radix-ui/react-slot` to Phase 0. Added missing injection spots (`portal:home:before/after`, `portal:dashboard:profile`, `portal:dashboard:sidebar`). Added Implementation Rules section. Restructured Risks with scenario format. Added integration test cases. |
