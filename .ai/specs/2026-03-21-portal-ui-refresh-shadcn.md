# Portal UI Refresh — shadcn Primitives & Block-Based Redesign

## TLDR

**Key Points:**
- Replace hand-rolled portal UI with shadcn primitives and block-based layouts, preserving all FROZEN contracts and backward compatibility.
- Add 5 new primitives (Sheet, Avatar, Select, Skeleton, Sidebar), migrate inline SVGs to lucide-react, refactor PortalShell to shadcn Sidebar system, redesign auth pages, and polish all portal pages.

**Scope:**
- 5 new shadcn primitives in `packages/ui/src/primitives/`
- Portal component upgrades with icon migration (PortalCard, PortalNotificationPanel, PortalNotificationBell, PortalFeatureCard, LanguageSwitcher, PortalErrorBoundary)
- PortalShell refactor to shadcn sidebar-08 block layout
- Auth page redesign (login-03, signup-05 blocks) + portal page polish

**Concerns:**
- DOM structure changes in PortalShell (shadcn Sidebar adds wrappers); SSR handling for SidebarProvider state; breakpoint mismatch between `useIsMobile` (767px) and current sidebar `lg:` (1024px); must preserve all `data-portal-handle` and `data-menu-item-id` attributes for backward compatibility.

---

## Overview

The customer portal (`packages/ui/src/portal/` + `packages/core/src/modules/portal/frontend/`) currently uses hand-rolled HTML with Tailwind classes for its sidebar, notification panel, mobile drawer, and auth pages. The existing `packages/ui/src/primitives/` already follow shadcn patterns (CVA + Radix + `cn()`) but are missing key components needed by the portal.

This spec upgrades the portal to use proper shadcn primitives and block-based page layouts while preserving all backward compatibility contracts, FROZEN handle IDs, injection spots, and public API surfaces.

**Market Reference:** [shadcn/ui](https://ui.shadcn.com) — adopted its primitive patterns (CVA + Radix + `cn()`), Sidebar system (sidebar-08 block), and auth page blocks (login-03, signup-05). Rejected full primitive replacement since existing primitives have project-specific customizations (`data-slot`, `IconButton`, mobile-first Dialog, custom Tabs context).

---

## Problem Statement

1. **Visual inconsistency**: Portal uses raw `<button>`, `<select>`, `<a>` elements while the backend uses proper `Button`, `IconButton` primitives — violating `packages/ui/AGENTS.md` ("MUST NOT use raw `<button>` elements").
2. **Missing primitives**: No Sheet, Avatar, Select, Skeleton, or Sidebar primitives exist, forcing hand-rolled implementations.
3. **Developer experience**: Building new portal pages requires copy-pasting raw HTML patterns instead of composing proper components.
4. **Polish**: Notification panel has no focus trapping or scroll lock; mobile sidebar is a manual overlay; loading states use Spinner instead of Skeleton placeholders; inline SVG icons are duplicated across files.

---

## User Stories

1. **Portal developer**: "I want to build a new portal page using proper primitives (Sidebar, Sheet, Avatar) so I don't copy-paste raw HTML and maintain consistency with the rest of the system."
2. **End user**: "I want the portal to feel polished — smooth sidebar transitions, proper focus management in the notification panel, skeleton loading states instead of spinners."
3. **Module author**: "I want to inject widgets and menu items into the portal and have them render with the same visual quality as built-in elements, using the same component library."

---

## Proposed Solution

### Approach

- Add missing shadcn primitives to `packages/ui/src/primitives/`
- Use shadcn blocks as the structural basis for portal page layouts (sidebar-08, login-03, signup-05) — inject existing portal logic into shadcn block structure
- Refactor portal components to wrap existing primitives (Card, Separator, Badge, Tabs, Button, IconButton)
- Replace all inline SVGs with lucide-react icons (done within each component's refactor phase, not as a separate pass)
- Dark mode works out of the box — the portal already has the full CSS variable layer (`--background`, `--foreground`, `--border`, etc.) defined in `apps/mercato/src/app/globals.css` with both `:root` (light) and `.dark` (dark) themes, Tailwind `@theme inline` mapping, and a `ThemeProvider` with localStorage persistence. No additional CSS setup needed.
- Keep all hooks, context, API routes, and business logic unchanged

### What Does NOT Change

- Existing primitives in `packages/ui/src/primitives/` (they already follow shadcn patterns with project-specific customizations like `data-slot`, `IconButton`, mobile-first Dialog)
- All hooks: `usePortalInjectedMenuItems`, `usePortalNotifications`, `usePortalEventBridge`, `usePortalAppEvent`, `usePortalDashboardWidgets`, `useTenantContext`, `useCustomerAuth`
- `PortalContext.tsx`, `PortalLayoutShell.tsx` (server component), `PortalLayoutProvider.tsx` (deprecated alias)
- Backend admin pages / AppShell
- Staff auth pages (login, reset)
- API routes and data contracts
- All FROZEN handle IDs, injection spot IDs, menu item IDs, event IDs

### What Changes Behaviorally

While the spec preserves all contracts and props types, it does replace custom behavior with Radix-provided equivalents. These are not "no logic changes" — they are logic *swaps* where hand-rolled behavior is replaced by battle-tested library behavior:

| Before | After | Behavioral Difference |
|--------|-------|-----------------------|
| Manual Escape key handler in PortalNotificationPanel | Radix Sheet's built-in Escape-to-close | Radix also handles focus return to trigger element. **Mapping note:** Sheet's `onOpenChange` fires with `(open: boolean)` on both open and close. Wire as `onOpenChange={(open) => { if (!open) onClose() }}` — do not pass `onClose` directly (type mismatch: `() => void` vs `(open: boolean) => void`). |
| Hand-rolled backdrop div with click handler | Radix Sheet overlay with `onOpenChange` | Radix adds scroll lock on body and animated transitions |
| `mobileOpen` state + manual overlay in PortalShell | Sidebar's built-in mobile Sheet | Radix handles focus trapping, scroll lock, backdrop; removes ~30 lines of manual state management |
| Manual `SidebarNavItem` component with active state | `SidebarMenuButton` with `isActive` prop | shadcn Sidebar handles active styling via `data-active` attribute |
| Raw `<button>` tab elements in PortalNotificationPanel | Radix `Tabs`/`TabsList`/`TabsTrigger` | Gains arrow-key navigation between tabs, Home/End keys, roving tabindex, and ARIA `role="tablist"` semantics |

These swaps are low-risk because they improve accessibility (focus trapping, scroll lock, ARIA attributes) and the external contract (props, handles, selectors) is unchanged. But they are not invisible — integration tests should verify the behavioral equivalence.

### Design Decisions

| Decision | Rationale |
|----------|-----------|
| SidebarProvider lives inside PortalShell | Keeps public API unchanged; component replacement consumers of `section:portal:sidebar` don't need SidebarProvider knowledge |
| SSR defaults: `collapsed=false`, `isMobile=false` | Standard Next.js pattern; sidebar renders expanded, updates on client mount — no hydration mismatch |
| Portal-specific sidebar breakpoint (1023px) | Current sidebar hides at `lg:` (1024px). `useIsMobile` uses 767px. PortalShell must compute its own mobile state via `useMediaQuery('(max-width: 1023px)')` and pass it to SidebarProvider — do NOT use the default `useIsMobile` for sidebar mode switching. See "Breakpoint Mismatch" risk. |
| Disable sidebar cookie persistence | shadcn SidebarProvider persists collapsed state to a `sidebar:state` cookie by default. Disable this for the portal to avoid cookie conflicts with the backend admin app on the same domain. Pass `defaultOpen={true}` without cookie persistence. |
| Sheet for notification panel (not custom drawer) | Gains focus trapping, scroll lock, animated transitions, Escape-to-close for free from Radix Dialog |
| Full shadcn Sidebar system (15+ sub-components) | The portal currently needs ~8 of these (Provider, Content, Group, MenuItem, MenuButton, Header, Footer, Trigger, Inset). Shipping the full system is a deliberate over-investment: it avoids maintaining a minimal fork and provides ready-made primitives for future portal features (collapsible sub-menus, rail mode). The unused sub-components are tree-shaken from the bundle. |
| Existing primitives preserved | Project-specific customizations (`data-slot`, `IconButton`, mobile-first Dialog, custom Alert variants, custom Tabs context) would be lost if replaced |
| Icon migration merged into component phases | Avoids touching files twice — icons are replaced in the same pass that refactors each component |
| No CSS variable setup needed | Portal already has complete shadcn CSS variable theming in `globals.css` (OKLch colors, `:root` + `.dark`, Tailwind `@theme inline` mapping, `ThemeProvider` with localStorage) |

### Deployment Strategy

Each phase produces a working build and a functionally complete application. Phases MAY be shipped as separate PRs for smaller review scope, or as a single monolithic PR. Per-phase rollback is supported because:

- Phase 0: Adds dependencies only (no behavior change)
- Phase 1: Adds new primitives with no consumers (dead code until Phase 2)
- Phase 2: Upgrades portal components internally (all prop interfaces preserved)
- Phase 3: Refactors PortalShell (all contracts preserved)
- Phase 4: Redesigns auth pages and polishes portal pages

After Phase 2, the portal is in a hybrid state where upgraded components (Sheet-based notification panel, Card-wrapped PortalCard) coexist with the old PortalShell layout. This is intentional and safe — the upgraded components are self-contained and consumed via unchanged prop interfaces.

---

## Architecture

### File Structure (changes only)

```
packages/ui/src/
├── primitives/
│   ├── sheet.tsx          # NEW — Radix Dialog-based side drawer
│   ├── avatar.tsx         # NEW — image + fallback initials
│   ├── select.tsx         # NEW — Radix Select
│   ├── skeleton.tsx       # NEW — pulse animation placeholder
│   └── sidebar.tsx        # NEW — full shadcn Sidebar system
├── portal/
│   ├── PortalShell.tsx    # REFACTORED — sidebar-08 block layout
│   └── components/
│       ├── PortalCard.tsx              # REFACTORED — wraps Card primitive
│       ├── PortalNotificationPanel.tsx # REFACTORED — uses Sheet + Tabs
│       ├── PortalNotificationBell.tsx  # REFACTORED — lucide Bell, Badge
│       ├── PortalFeatureCard.tsx       # REFACTORED — uses Card + Button
│       ├── PortalPageHeader.tsx        # MINOR POLISH
│       ├── PortalEmptyState.tsx        # MINOR POLISH (icon migration)
│       ├── PortalErrorBoundary.tsx     # NEW — error boundary wrapper
│       └── index.ts                   # UNCHANGED exports (9 existing)
├── frontend/
│   └── LanguageSwitcher.tsx           # REFACTORED — uses Select primitive

packages/core/src/modules/portal/frontend/[orgSlug]/portal/
├── page.tsx              # POLISHED — lucide icons, Card for features
├── login/page.tsx        # REDESIGNED — login-03 block layout
├── signup/page.tsx       # REDESIGNED — signup-05 block layout
├── dashboard/page.tsx    # POLISHED — Skeleton loading, lucide icons
└── profile/page.tsx      # POLISHED — Avatar, Badge, Skeleton, Separator
```

### Component Hierarchy (Authenticated Portal)

```
PortalLayoutShell (server component — server-resolved props)
  └── PortalProvider (auth + tenant context + i18n)
      └── PortalShell [data-portal-handle="page:portal:layout"]
          └── SidebarProvider (inside PortalShell, not above it)
              ├── Sidebar [data-portal-handle="section:portal:sidebar"]
              │   ├── SidebarHeader (org logo + name)
              │   ├── SidebarContent
              │   │   ├── nav [aria-label="Portal navigation"]
              │   │   │   ├── SidebarGroup "Portal" (merged main nav items)
              │   │   │   └── SidebarGroup "Account" (merged account items)
              │   └── SidebarFooter
              │       ├── Avatar + user info
              │       └── Logout button [data-portal-handle="section:portal:user-menu"]
              ├── SidebarInset
              │   ├── header [data-portal-handle="section:portal:header"]
              │   │   ├── SidebarTrigger (mobile)
              │   │   └── PortalNotificationBell → Sheet (notification panel)
              │   ├── PortalErrorBoundary
              │   │   └── main (children)
              │   └── footer [data-portal-handle="section:portal:footer"]
              └── Sheet (mobile sidebar, built into Sidebar system)
```

### Wireframes

#### Authenticated Portal Layout (sidebar-08)

```
┌──────────────────────────────────────────────────────────────────┐
│ ┌─────────────┐ ┌──────────────────────────────────────────────┐ │
│ │  Org Logo   │ │  ☰ (mobile only)              🔔 (notifs)  │ │
│ │             │ ├──────────────────────────────────────────────┤ │
│ ├─────────────┤ │                                              │ │
│ │ Portal      │ │                                              │ │
│ │  Dashboard  │ │           Main Content Area                  │ │
│ │  Orders     │ │           (children)                         │ │
│ │  Messages   │ │                                              │ │
│ │             │ │                                              │ │
│ ├─────────────┤ │                                              │ │
│ │ Account     │ │                                              │ │
│ │  Profile    │ │                                              │ │
│ │  Settings   │ │                                              │ │
│ ├─────────────┤ ├──────────────────────────────────────────────┤ │
│ │ 👤 User     │ │  Footer                                     │ │
│ │  [Logout]   │ │                                              │ │
│ └─────────────┘ └──────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
  ◄── Sidebar ──►  ◄──────────── SidebarInset ─────────────────►
```

#### Login Page (login-03)

```
┌──────────────────────────────────────────────────────────────────┐
│                        bg-muted                                  │
│                                                                  │
│              ▲ InjectionSpot: portal:login:before                │
│              ┌──────────────────────────┐                        │
│              │         Card             │                        │
│              │                          │                        │
│              │   🏢 Org Name            │                        │
│              │   "Sign in to portal"    │                        │
│              │                          │                        │
│              │   ┌──────────────────┐   │                        │
│              │   │ Email            │   │                        │
│              │   └──────────────────┘   │                        │
│              │   ┌──────────────────┐   │                        │
│              │   │ Password         │   │                        │
│              │   └──────────────────┘   │                        │
│              │                          │                        │
│              │   [ Sign In Button  ]    │                        │
│              │                          │                        │
│              │   Don't have account?    │                        │
│              │   Sign up                │                        │
│              └──────────────────────────┘                        │
│              ▼ InjectionSpot: portal:login:after                 │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

#### Signup Page (signup-05)

```
┌──────────────────────────────────────────────────────────────────┐
│                        bg-muted                                  │
│                                                                  │
│              ▲ InjectionSpot: portal:signup:before               │
│              ┌──────────────────────────┐                        │
│              │         Card             │                        │
│              │                          │                        │
│              │   🏢 Org Name            │                        │
│              │   "Create your account"  │                        │
│              │                          │                        │
│              │   ┌──────────────────┐   │                        │
│              │   │ Display Name     │   │                        │
│              │   └──────────────────┘   │                        │
│              │   ┌──────────────────┐   │                        │
│              │   │ Email            │   │                        │
│              │   └──────────────────┘   │                        │
│              │   ┌──────────────────┐   │                        │
│              │   │ Password         │   │                        │
│              │   └──────────────────┘   │                        │
│              │                          │                        │
│              │   [Social Provider Slots] │  ← injection-driven  │
│              │                          │                        │
│              │   [ Create Account  ]    │                        │
│              │                          │                        │
│              │   Already have account?  │                        │
│              │   Sign in                │                        │
│              └──────────────────────────┘                        │
│              ▼ InjectionSpot: portal:signup:after                │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Data Models

N/A — no data model changes. This spec is a pure UI/component refactor.

---

## API Contracts

N/A — no API route changes. All existing portal API routes remain unchanged.

---

## Internationalization

### New Translation Keys

The following NEW i18n keys are needed. Add to the portal locale namespace.

| Key | Default (English) | Used By |
|-----|-------------------|---------|
| `portal.error.fallback_title` | `Something went wrong` | PortalErrorBoundary |
| `portal.error.fallback_description` | `An error occurred while loading this page.` | PortalErrorBoundary |
| `portal.error.retry` | `Try again` | PortalErrorBoundary retry button |
| `portal.sidebar.toggle` | `Toggle sidebar` | SidebarTrigger `aria-label` |
| `portal.sidebar.group.portal` | `Portal` | SidebarGroup label |
| `portal.sidebar.group.account` | `Account` | SidebarGroup label |
| `portal.notifications.open` | `Notifications` | Notification bell `aria-label` |
| `portal.notifications.close` | `Close notifications` | Notification panel close `aria-label` |

Existing hardcoded `aria-label` strings in `PortalShell.tsx` (e.g., `"Close menu"`, `"Open menu"`) should be converted to `useT()` keys as part of the refactor. The current hardcoded English strings are a pre-existing i18n violation being fixed opportunistically.

---

## Implementation Rules (All Phases)

- Use `IconButton` (not `Button size="icon"`) for all icon-only buttons (close, sidebar toggle, notification bell)
- Pass `type="button"` explicitly on all non-submit `Button`/`IconButton` instances
- All user-facing strings MUST use `useT()` with translation keys, never hard-coded strings
- All `IconButton` instances MUST have an `aria-label` using `useT()` — never hardcoded English
- Use `cn()` from `@open-mercato/shared/lib/utils` in all new primitives
- New primitives MUST use shadcn CSS variable classes (`bg-background`, `text-foreground`, `border-border`, etc.) — the variable layer is already defined in `globals.css`
- New primitives MUST add `data-slot` attributes for component replacement targeting
- New primitives MUST use `forwardRef` where applicable
- New primitives MUST follow existing CVA patterns where variants are needed
- When refactoring a component, replace its inline SVGs with lucide-react icons in the same pass — do not leave icon migration for a separate phase

---

## Implementation Phases

### Phase 0: Dependencies

Add missing dependencies to `packages/ui/package.json` that currently work via hoisting but would break on standalone install, plus new Radix packages for new primitives:

```json
{
  "dependencies": {
    "@radix-ui/react-dialog": "^1.0.5",
    "@radix-ui/react-checkbox": "^1.3.3",
    "@radix-ui/react-label": "^2.1.8",
    "@radix-ui/react-slot": "^1.2.4",
    "@radix-ui/react-avatar": "^1.1.0",
    "@radix-ui/react-select": "^2.1.0"
  },
  "peerDependencies": {
    "lucide-react": ">=0.400.0"
  }
}
```

**Version pinning note:** The versions above are illustrative — do not copy them verbatim. Before adding, check `yarn.lock` for already-resolved versions of these packages (they may be transitively installed). Pin to the version already in the lockfile to avoid resolution churn. For `@radix-ui/react-dialog` specifically, verify the resolved version is `>=1.1.0` — older versions may lack Sheet features (animated side variants, proper `onOpenChange` behavior). For truly new packages (`@radix-ui/react-avatar`, `@radix-ui/react-select`), use the latest stable version.

**Steps:**
1. Add all dependencies above to `packages/ui/package.json` (match existing lockfile versions where applicable)
2. Run `yarn install` — verify no unexpected resolution changes
3. Verify build passes: `yarn build:packages`

---

### Phase 1: New Primitives

Add to `packages/ui/src/primitives/`:

| Primitive | Radix Dependency | Notes |
|-----------|-----------------|-------|
| `skeleton.tsx` | None | `animate-pulse` div with `cn()` |
| `avatar.tsx` | `@radix-ui/react-avatar` | Image + fallback initials |
| `sheet.tsx` | `@radix-ui/react-dialog` | Side drawer with `side` variant (`top`/`right`/`bottom`/`left`), overlay, animated transitions |
| `select.tsx` | `@radix-ui/react-select` | Trigger + content + item + group + label + separator |
| `sidebar.tsx` | `@radix-ui/react-slot` | Full shadcn Sidebar system: Provider, Content, Group, Menu, MenuItem, MenuButton, MenuSub, MenuSubButton, MenuSubContent, Footer, Header, Trigger, Rail, Inset, Separator. Uses existing `useIsMobile` hook from `packages/ui/src/hooks/useIsMobile.ts`. SidebarProvider must accept an optional `isMobile` prop override for consumers that need a different breakpoint (e.g., the portal uses 1023px, not the default 767px). |

New primitives are imported directly by path (e.g., `@open-mercato/ui/primitives/sheet`) — no barrel export update needed.

**Steps:**
1. Create `skeleton.tsx` — simplest primitive, no Radix dependency
2. Create `avatar.tsx` — Radix Avatar with image + fallback
3. Create `sheet.tsx` — Radix Dialog-based side drawer with `side` variant
4. Create `select.tsx` — Radix Select with trigger, content, item, group, label, separator
5. Create `sidebar.tsx` — full shadcn Sidebar system adapted with project conventions (`cn()`, `data-slot`, `useIsMobile`), with `isMobile` prop override on SidebarProvider
6. Verify build passes: `yarn build:packages`
7. Measure bundle delta: `next build` + `@next/bundle-analyzer` — record baseline

**Primitive contracts:**

All new primitives export `forwardRef`-wrapped components with `className` prop support via `cn()`. Each component has a `data-slot` attribute for replacement targeting. Dark mode is handled through CSS variables (already present) — no explicit dark/light logic.

---

### Phase 2: Portal Component Upgrades

Refactor all portal components in `packages/ui/src/portal/components/` and `packages/ui/src/frontend/LanguageSwitcher.tsx`. Each component's inline SVGs are replaced with lucide-react icons as part of the same refactor — no separate icon migration pass.

#### Icon Migration Reference

| File | Inline SVG | lucide-react Replacement |
|------|-----------|-------------------------|
| `PortalNotificationPanel.tsx` | XIcon | `X` |
| `PortalNotificationPanel.tsx` | CheckIcon | `Check` |
| `PortalNotificationBell.tsx` | BellIcon | `Bell` |

(PortalShell icons — MenuIcon, XIcon, LogOutIcon — are migrated in Phase 3 when the shell is refactored. Portal page icons — ShoppingBag, User, Shield, LayoutGrid, CheckCircle — are migrated in Phase 4 when pages are polished.)

#### PortalCard.tsx

- Wrap existing `Card` primitive internally
- Keep all 4 exports with identical props: `PortalCard`, `PortalCardHeader`, `PortalStatRow`, `PortalCardDivider`
- `PortalCardDivider` → use `Separator` primitive internally

#### PortalNotificationPanel.tsx

- Rewrite using `Sheet` (side="right") + existing `Tabs` + `Badge` + `Button`
- Use `IconButton` for the close button (replacing inline XIcon SVG with lucide `X`), with `aria-label={t('portal.notifications.close')}`
- Props type MUST remain identical: `{ open, onClose, notifications, unreadCount, onMarkAsRead, onDismiss, onMarkAllRead, t }`
- Map `open` → Sheet's `open`, `onClose` → Sheet's `onOpenChange` via `onOpenChange={(open) => { if (!open) onClose() }}` (do NOT pass `onClose` directly — type mismatch)
- Gains: focus trapping, scroll lock, proper accessibility, animated transitions
- Remove manual Escape handler and hand-rolled backdrop (Sheet handles both — see "What Changes Behaviorally" section)
- Replace raw `<button>` tab elements with `Tabs`/`TabsList`/`TabsTrigger`
- Replace severity badge `<span>` with `Badge` primitive
- Replace inline CheckIcon SVG with lucide `Check`

#### PortalNotificationBell.tsx

- Replace inline SVG BellIcon with lucide `Bell`
- Replace unread count `<span>` with `Badge` primitive
- Add `aria-label={t('portal.notifications.open')}` to the bell `IconButton`
- Keep pulse animation logic unchanged

#### PortalFeatureCard.tsx

- Use `Card` primitive internally for the container
- Use `Button asChild` for href variant (wrapping `<a>`)
- Use `Button` with `type="button"` for onClick variant
- Props type MUST remain identical: `{ icon?: ReactNode, title: string, description?: string, href?: string, onClick?: () => void }` (note: `icon`, `description`, `href`, `onClick` are all optional; only `title` is required)

#### PortalPageHeader.tsx & PortalEmptyState.tsx

- Minor polish: typography refinement, ensure icon prop accepts lucide icons cleanly
- No structural changes

#### LanguageSwitcher.tsx

- Replace raw `<select>` with `Select`/`SelectTrigger`/`SelectContent`/`SelectItem` primitives
- Preserve `disabled={pending}` state during locale transition — pass `disabled` to Radix Select
- Keep locale change logic (POST to `/api/auth/locale`, router refresh) unchanged. **Note:** the existing component uses raw `fetch` instead of `apiCall` — this is a pre-existing violation of `packages/ui/AGENTS.md` but is out of scope for this spec. Do not fix it here to avoid scope creep; track separately if desired.
- **UX tradeoff:** Native `<select>` renders platform-native UI on mobile (iOS bottom sheet, Android spinner). Radix Select renders a custom dropdown everywhere. For a 4-item locale picker this is an acceptable tradeoff — the visual consistency gain outweighs the minor mobile UX regression. If mobile UX is a concern, the Select primitive supports `position="popper"` which renders closer to native positioning.

#### PortalErrorBoundary.tsx (NEW — scope expansion)

- Create error boundary component in `packages/ui/src/portal/components/`
- **Implementation pattern:** Must be a React class component (required for `componentDidCatch`). The class component renders a functional `ErrorFallback` child component that can use hooks including `useT()`. This works because `PortalProvider` (which provides the i18n context) is above `PortalErrorBoundary` in the component tree — the error boundary only catches errors in `{children}` (page content), not in the provider chain above it.
- Catches render errors in portal content, displays fallback UI with retry action
- Used in PortalShell to wrap `{children}` in authenticated layout (wired in Phase 3)
- **Scope note:** This is additive new behavior, not a UI refresh of existing code. It's included here because it's small, improves resilience, and is best wired during the PortalShell refactor. Can be dropped without affecting the rest of the spec.

#### index.ts

- UNCHANGED — same 9 named exports. `PortalErrorBoundary` is intentionally NOT added to the barrel export: it's an internal implementation detail of PortalShell, not a public API for module authors. If a module author needs an error boundary for their portal pages, they should use React's standard `ErrorBoundary` pattern. Import path: `@open-mercato/ui/portal/components/PortalErrorBoundary` (internal, not part of STABLE contract).

**Steps:**
1. Add new i18n translation keys to portal locale files (see Internationalization section)
2. Refactor PortalCard (Card + Separator)
3. Refactor PortalNotificationPanel (Sheet + Tabs + Badge + IconButton + lucide icons)
4. Refactor PortalNotificationBell (lucide Bell + Badge)
5. Refactor PortalFeatureCard (Card + Button)
6. Polish PortalPageHeader and PortalEmptyState
7. Refactor LanguageSwitcher (Select primitive, preserve `disabled` state)
8. Create PortalErrorBoundary (class component + functional ErrorFallback child)
9. Verify all props types are identical (TypeScript will catch narrowing)
10. Verify build passes: `yarn build:packages`

---

### Phase 3: PortalShell Refactor

Base on shadcn sidebar-08 block layout — inject existing portal logic into the block structure. Inline SVG icons (MenuIcon, XIcon, LogOutIcon) are replaced with lucide equivalents as part of this refactor.

#### Public Layout (Unauthenticated)

- Keep current structure (header + hero + footer)
- Replace any inline SVG icons with lucide (public layout shares MenuIcon/XIcon definitions with authenticated layout — once those component-level definitions are removed and replaced with lucide imports, both layouts benefit)
- Use `Button` consistently

#### Authenticated Layout

- Replace hand-rolled `<aside>` sidebar with shadcn `Sidebar` + `SidebarProvider`
- Compute portal-specific mobile state via `useMediaQuery('(max-width: 1023px)')` matching the current `lg:` breakpoint, and pass to `SidebarProvider` as `isMobile` prop — do NOT use the default `useIsMobile` (767px) which would cause a layout regression on tablet viewports (768-1023px)
- Disable cookie-based sidebar persistence — pass `defaultOpen={true}` without `persistState`/cookie configuration to avoid conflicts with backend admin app
- Replace manual mobile overlay (`mobileOpen` state + backdrop div) with Sidebar's built-in mobile Sheet (see "What Changes Behaviorally")
- Replace `SidebarNavItem` component with `SidebarMenuItem` + `SidebarMenuButton`
- Replace inline user avatar with `Avatar` primitive
- Replace inline SVG icons (MenuIcon, XIcon, LogOutIcon) with lucide (`Menu`, `X`, `LogOut`)
- Use `IconButton` for mobile menu toggle (`SidebarTrigger`), with `aria-label={t('portal.sidebar.toggle')}`
- Wrap `SidebarContent` children in `<nav aria-label={t('portal.sidebar.navigation', 'Portal navigation')}>` to preserve the existing `<nav>` landmark for screen readers
- Wrap `{children}` with `PortalErrorBoundary` (created in Phase 2)

#### Preserved Contracts

| Contract | Status |
|----------|--------|
| `data-portal-handle` on shell root, header, footer, sidebar, user-menu | Preserved on equivalent DOM elements |
| `data-menu-item-id` on every nav item | Attached to `SidebarMenuButton` or its child `Link` |
| All 5 FROZEN component replacement handle exports | Unchanged |
| `PortalShellProps` type | Unchanged |
| `PortalLayoutShellProps` type | Unchanged (not modified by this spec) |
| `PortalProviderProps` / `usePortalContext` exports | Unchanged (not modified by this spec) |
| Hook calls: `usePortalInjectedMenuItems`, `mergeMenuItems`, `usePortalContext`, `useT`, `usePathname` | Unchanged |
| `PortalEventBridgeMount` component | Unchanged |

#### SSR Considerations

- `SidebarProvider` defaults: `defaultOpen={true}` (sidebar expanded), no cookie persistence
- Portal-specific mobile detection: `useMediaQuery('(max-width: 1023px)')` returns `false` during SSR (standard `useSyncExternalStore` pattern), updates on client mount
- No hydration mismatch: sidebar renders expanded by default, collapses on mobile/tablet after mount
- Brief visual layout shift on mobile/tablet (~50-100ms) as sidebar transitions from expanded to Sheet mode — see "SSR Layout Shift" risk

**Steps:**
1. Import Sidebar primitives, Avatar, lucide icons, PortalErrorBoundary
2. Add portal-specific mobile detection (`useMediaQuery` at 1023px breakpoint)
3. Refactor authenticated layout to sidebar-08 structure (see wireframe above)
4. Wire `SidebarProvider` inside PortalShell (below `page:portal:layout` handle) with `isMobile` override and `defaultOpen={true}`, no cookie persistence
5. Move nav items to `SidebarGroup`/`SidebarMenuItem`/`SidebarMenuButton`
6. Wrap `SidebarContent` children in `<nav>` landmark with `aria-label`
7. Preserve all `data-portal-handle` attributes on equivalent elements
8. Preserve all `data-menu-item-id` attributes on `SidebarMenuButton` elements
9. Remove manual mobile overlay logic (replaced by Sidebar's built-in Sheet)
10. Wire `Avatar` in sidebar footer
11. Wrap `{children}` with `PortalErrorBoundary`
12. Remove dead inline SVG component definitions (MenuIcon, XIcon, LogOutIcon)
13. Verify all 5 handle exports are unchanged
14. Verify `PortalShellProps` type is unchanged
15. Verify build
16. Measure bundle delta: `next build` + `@next/bundle-analyzer` — compare against Phase 1 baseline

---

### Phase 4: Auth Pages & Portal Page Polish

Redesign auth pages and polish remaining portal pages. Inline SVG icons in portal pages are replaced with lucide equivalents as part of this phase.

#### Icon Migration Reference (Portal Pages)

| File | Inline SVG | lucide-react Replacement |
|------|-----------|-------------------------|
| Portal landing `page.tsx` | ShoppingBag icon | `ShoppingBag` |
| Portal landing `page.tsx` | User icon | `User` |
| Portal landing `page.tsx` | Shield icon | `Shield` |
| Portal dashboard `page.tsx` | Widget icon | `LayoutGrid` |
| Portal signup `page.tsx` | Inline check SVG | `CheckCircle` |

#### Portal Login (`login/page.tsx`)

- Redesign using login-03 block layout (card centered on muted background — see wireframe above)
- Keep form fields: email, password
- Keep error handling logic (401, 423/locked, generic)
- Keep `InjectionSpot` placements: `portal:login:before`, `portal:login:after`
- Use `Card`, `Input`, `Label`, `Button` primitives

#### Portal Signup (`signup/page.tsx`)

- Redesign using signup-05 block layout (see wireframe above)
- Keep form fields: displayName, email, password
- Keep success confirmation screen
- Keep `InjectionSpot` placements: `portal:signup:before`, `portal:signup:after`
- Social provider buttons are placeholder slots (rendered only when providers are configured via injection)
- Replace inline check SVG with lucide `CheckCircle`

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
- Preserve `portal:dashboard:profile`, `portal:dashboard:sidebar` injection spots (declared but currently unrendered — see FROZEN Surfaces note)

#### Profile Page (`profile/page.tsx`)

- Replace loading spinners with `Skeleton` placeholders
- Use `Avatar` for user display
- Use `Badge` for role pills and feature pills (replace raw `<span>` elements)
- Use `Separator` between card sections
- Preserve `InjectionSpot` placements: `portal:profile:before`, `portal:profile:after`

**Steps:**
1. Redesign login page to login-03 layout, preserving form logic and injection spots
2. Redesign signup page to signup-05 layout, preserving form logic, success screen, and injection spots
3. Polish landing page (lucide icons, PortalFeatureCard with Card, typography)
4. Polish dashboard page (Skeleton loading, lucide LayoutGrid icon)
5. Polish profile page (Avatar, Badge, Skeleton, Separator)
6. Final sweep: verify no inline SVG definitions remain in any portal file
7. Verify all injection spots are preserved
8. Verify build: `yarn build:packages`

---

## Migration & Backward Compatibility

### FROZEN Surfaces — No Changes

| Surface | IDs | Status |
|---------|-----|--------|
| Component replacement handles | `page:portal:layout`, `section:portal:header`, `section:portal:footer`, `section:portal:sidebar`, `section:portal:user-menu` | Preserved on equivalent DOM elements |
| Menu injection spots | `menu:portal:sidebar:main`, `menu:portal:sidebar:account`, `menu:portal:header:actions`\*, `menu:portal:user-dropdown`\* | Hook calls unchanged |
| Page injection spots | `portal:home:before/after`, `portal:login:before/after`, `portal:signup:before/after`, `portal:dashboard:before/after`, `portal:dashboard:sections`, `portal:dashboard:profile`\*, `portal:dashboard:sidebar`\*, `portal:profile:before/after` | All `InjectionSpot` components and hook references preserved |
| Menu item test selectors | `data-menu-item-id` on all nav items | Attached to `SidebarMenuButton` elements |

\* **Declared but unrendered:** `menu:portal:header:actions`, `menu:portal:user-dropdown`, `portal:dashboard:profile`, and `portal:dashboard:sidebar` are declared in `spotIds.ts` and accepted by the injection system, but no PortalShell or portal page code currently renders items from these spots. This spec preserves the declarations (they remain valid FROZEN IDs) but does not add rendering for them — wiring these spots is out of scope. Module authors should be aware that injecting into these spots currently produces no visible output.

### STABLE Surfaces — No Breaking Changes

| Surface | Contract | Status |
|---------|----------|--------|
| Import paths | All files under `packages/ui/src/portal/components/`, `packages/ui/src/portal/PortalShell.tsx`, `packages/ui/src/portal/PortalContext.tsx`, `packages/ui/src/portal/PortalLayoutShell.tsx` | No files moved or renamed |
| Export names | `PortalCard`, `PortalCardHeader`, `PortalStatRow`, `PortalCardDivider`, `PortalPageHeader`, `PortalEmptyState`, `PortalFeatureCard`, `PortalNotificationBell`, `PortalNotificationPanel` (9 exports) | All preserved with identical names |
| Props types | All portal component props, `PortalShellProps`, `PortalLayoutShellProps`, `PortalProviderProps` | Identical types, no removed/narrowed fields |
| Handle exports | `PORTAL_SHELL_HANDLE`, `PORTAL_HEADER_HANDLE`, `PORTAL_FOOTER_HANDLE`, `PORTAL_SIDEBAR_HANDLE`, `PORTAL_USER_MENU_HANDLE` | Same values, same export names |
| Context exports | `usePortalContext`, `PortalProvider` from `PortalContext.tsx` | Unchanged |
| New import paths | New primitives create new import paths (`@open-mercato/ui/primitives/sheet`, etc.) | No existing paths affected |

### DOM Structure Changes

The internal DOM structure of PortalShell changes (shadcn Sidebar adds wrapper elements). This is an internal implementation detail, not a contract surface. However:

- `data-portal-handle` attributes remain on the outermost semantic element for each section
- `data-menu-item-id` attributes remain on clickable nav items
- Integration tests using these selectors will continue to work

### SidebarProvider and Component Replacement

SidebarProvider lives inside PortalShell, below the `page:portal:layout` handle boundary. Modules that replace `section:portal:sidebar` will receive a different internal structure but the same data flow (merged menu items, active state, i18n labels). This is acceptable because:

1. Component replacement is documented as replacing the visual rendering, not the internal implementation
2. The `data-portal-handle` attribute on the replacement boundary is preserved
3. No replacement consumer currently depends on specific child DOM nesting

---

## Risks & Impact Review

### N/A Risk Categories

- **Data integrity failures**: N/A — no data model or database changes
- **Tenant & data isolation risks**: N/A — no changes to tenant scoping, auth, or data access patterns
- **Migration & deployment risks**: N/A — no database migrations; all changes deploy as a single monorepo build

### Risk Register

#### Breakpoint Mismatch (Sidebar Mobile Detection)
- **Scenario**: Current sidebar hides at `lg:` (below 1024px) and shows a hamburger menu. The default `useIsMobile()` hook returns `true` only below 768px. After migration, tablet viewports (768-1023px) would show an inline sidebar where users currently see a hamburger menu — a silent layout regression.
- **Severity**: Critical
- **Affected area**: Portal layout on tablet-sized viewports (768-1023px)
- **Mitigation**: PortalShell computes its own mobile state via `useMediaQuery('(max-width: 1023px)')` matching the current `lg:` behavior, and passes it to `SidebarProvider` as an `isMobile` prop override. The Sidebar primitive must accept this override (specified in Phase 1 sidebar.tsx requirements).
- **Residual risk**: None if breakpoint is aligned; the `SidebarProvider` `isMobile` override is a standard shadcn pattern

#### SSR Layout Shift on Mobile
- **Scenario**: On mobile/tablet devices, the sidebar renders in expanded desktop layout during SSR and initial hydration, then collapses to Sheet mode after `useMediaQuery` updates (~50-100ms). This causes a visible layout shift.
- **Severity**: Medium
- **Affected area**: Portal authenticated layout on mobile/tablet devices
- **Mitigation**: The current code uses CSS `lg:block`/`lg:hidden` classes for instant responsive hiding. The shadcn Sidebar's CSS-based `group-data-[collapsible=offcanvas]` selector hides the sidebar when in mobile mode. Verify during Phase 3 that the Sidebar's CSS handles the mobile case without JS. If the flash is noticeable, add a CSS fallback: `@media (max-width: 1023px) { [data-slot="sidebar"] { display: none } }` to hide the sidebar below the `lg:` breakpoint during initial load.
- **Residual risk**: Low if CSS fallback is added

#### Sidebar Cookie Persistence Conflict
- **Scenario**: shadcn `SidebarProvider` persists collapsed state to a `sidebar:state` cookie by default. If the backend admin app also uses a shadcn Sidebar on the same domain, state bleeds between portal and admin.
- **Severity**: Medium
- **Affected area**: Portal sidebar UX, potential conflict with backend admin sidebar
- **Mitigation**: Disable cookie persistence for the portal's `SidebarProvider`. Pass `defaultOpen={true}` without enabling the cookie storage mechanism. Sidebar always starts expanded on each visit.
- **Residual risk**: None

#### SSR Hydration Mismatch
- **Scenario**: `SidebarProvider` reads `document.cookie` for collapsed state and `useMediaQuery` calls `window.matchMedia` — both unavailable during SSR, causing React hydration warnings.
- **Severity**: Medium
- **Affected area**: Portal authenticated layout (all pages inside PortalShell)
- **Mitigation**: Cookie persistence is disabled (see above). `useMediaQuery` uses `useSyncExternalStore` with a `getServerSnapshot` that returns `false`. Sidebar renders expanded by default, collapses on mobile/tablet after mount.
- **Residual risk**: Low — well-trodden Next.js pattern

#### Behavioral Divergence from Radix Swap
- **Scenario**: Replacing hand-rolled Escape handler, backdrop, and mobile overlay with Radix Sheet/Sidebar introduces subtle behavioral differences (focus trapping order, scroll lock scope, animation timing) that break user workflows or integration tests.
- **Severity**: Medium
- **Affected area**: Notification panel (Sheet), mobile sidebar (Sidebar's built-in Sheet)
- **Mitigation**: Radix behavior is a superset of the hand-rolled behavior (adds focus trapping, scroll lock, ARIA attributes). The external contract (props, handles, selectors) is unchanged. Integration tests verify behavioral equivalence. Manual QA covers Escape-to-close, backdrop click, and focus return.
- **Residual risk**: Low — Radix is battle-tested; the risk is cosmetic (animation timing), not functional

#### Nav Landmark Dropped
- **Scenario**: Current sidebar wraps nav items in `<nav aria-label="Portal navigation">`. shadcn `SidebarContent` renders a `<div>`, dropping the navigation landmark that screen readers use.
- **Severity**: Medium
- **Affected area**: Accessibility — screen reader sidebar navigation
- **Mitigation**: Explicitly wrap `SidebarContent` children in `<nav aria-label={t(...)}>` in Phase 3. Verify with axe-core or Lighthouse after Phase 3.
- **Residual risk**: None

#### Double Sheet Conflict
- **Scenario**: On mobile, both the sidebar (Sheet) and notification panel (Sheet) are open simultaneously due to programmatic triggering or fast sequential taps before the first overlay renders.
- **Severity**: Low
- **Affected area**: Mobile portal layout
- **Mitigation**: Radix handles stacked Dialogs correctly (z-index ordering, focus scope stacking). In practice, the overlay prevents trigger access — opening one Sheet makes the other trigger inaccessible behind the overlay. The visual result of double Sheets (double overlay, double drawer) is ugly but not broken. For polish, close the notification panel when the sidebar opens and vice versa.
- **Residual risk**: Low — the overlay prevents trigger access in practice

#### Z-Index Conflicts with Injected Widget Overlays
- **Scenario**: Notification panel Sheet and mobile Sidebar Sheet both render as React portals into `document.body`. Injected widgets inside the notification panel that use non-Radix overlays (custom tooltips, third-party date pickers) may render behind the Sheet's overlay.
- **Severity**: Low
- **Affected area**: Notification panel with injected interactive content
- **Mitigation**: Radix portals use DOM ordering for stacking, which works for Radix-on-Radix nesting. Injected widgets should use Radix-based overlays. The notification panel currently has no injection spots, so this is theoretical.
- **Residual risk**: None for current scope

#### Component Replacement DOM Divergence
- **Scenario**: A third-party module replaces `section:portal:sidebar` and expects specific child DOM nesting from the old hand-rolled sidebar.
- **Severity**: Low
- **Affected area**: Modules using `useRegisteredComponent('section:portal:sidebar', ...)`
- **Mitigation**: `data-portal-handle` stays on the same semantic boundary. Replacement targets the visual container, not internal nesting. No existing consumer depends on specific child DOM.
- **Residual risk**: Low

#### PortalNotificationPanel Props Contract Break
- **Scenario**: Rewrite accidentally changes the props type (e.g., dropping `open`/`onClose` in favor of Sheet's internal state).
- **Severity**: High
- **Affected area**: `PortalNotificationBell` and any consumer importing `PortalNotificationPanel`
- **Mitigation**: Props type explicitly preserved in spec. Sheet's `open`/`onOpenChange` mapped to existing `open`/`onClose` props. TypeScript will catch any type narrowing at build time.
- **Residual risk**: None (mechanical check)

#### Integration Test Selector Breakage
- **Scenario**: `data-menu-item-id` or `data-portal-handle` attributes are accidentally omitted from shadcn Sidebar elements, breaking integration tests.
- **Severity**: Medium
- **Affected area**: Integration tests using `[data-menu-item-id="..."]` and `[data-portal-handle="..."]` selectors
- **Mitigation**: Attributes explicitly listed in spec's Preserved Contracts section. Integration tests run as validation gate after each phase.
- **Residual risk**: Low

#### Bundle Size Increase
- **Scenario**: Adding Radix Select, Avatar, and the Sidebar system increases JS bundle sent to portal users.
- **Severity**: Low
- **Affected area**: Portal page load performance
- **Mitigation**: Measure actual bundle delta at two checkpoints: after Phase 1 (primitives added) and after Phase 3 (Sidebar wired into PortalShell) using `next build` + `@next/bundle-analyzer`. Radix packages share internal dependencies with already-installed packages (Dialog, Popover, Tooltip). Tree-shaking eliminates unused Sidebar sub-components. Expected: <20KB gzipped incremental.
- **Residual risk**: Low — if delta exceeds 20KB, consider lazy-loading the Sidebar primitive

---

## Testing

### Manual Verification

- Portal login/signup flows (both success and error states)
- Authenticated portal navigation (sidebar, mobile menu, notifications)
- Dashboard widget customization (show/hide, localStorage persistence)
- Profile page display (avatar, roles, features)
- Language switcher (Select primitive, disabled state during transition)
- Component replacement handles (verify `data-portal-handle` selectors work)
- Menu injection (verify `data-menu-item-id` selectors work)
- Mobile responsive behavior (sidebar Sheet, notification Sheet)
- Tablet responsive behavior (768-1023px — verify sidebar collapses, not inline)
- SSR: no hydration warnings in console
- Dark mode: verify all new primitives render correctly with dark theme
- Behavioral equivalence: Escape-to-close, backdrop click, focus return to trigger in notification panel and mobile sidebar
- Accessibility: sidebar `<nav>` landmark present, all `IconButton` instances have `aria-label`, axe-core clean
- Focus management: sidebar collapse/expand does not move focus on desktop

### Integration Tests

Existing portal-related integration tests must pass unchanged. Additionally, verify or add coverage for:

| Test Case | What to Verify |
|-----------|---------------|
| Portal login flow | Login form renders in login-03 layout, submits correctly, handles errors (401, 423) |
| Portal signup flow | Signup form renders in signup-05 layout, success screen displays, redirects to login |
| Sidebar navigation | Nav items render with `data-menu-item-id`, active state highlights correctly, injected items appear |
| Mobile sidebar | Sheet opens on mobile toggle, closes on item click and Escape, backdrop dismisses |
| Notification panel | Sheet opens from bell icon, tabs switch (All/Unread), mark read/dismiss/view actions work, Escape closes |
| Component replacement handles | All 5 `[data-portal-handle="..."]` selectors resolve to DOM elements |
| Dashboard widgets | Injected widgets render in grid, hide/show persists to localStorage |
| Profile display | Avatar renders with initials, role/feature badges display, email verified badge shows |
| Public portal landing | Unauthenticated landing page renders feature cards, navigation, CTA buttons correctly |
| Language switcher | Select opens, locale selection changes, pending state disables Select |
| Error boundary fallback | Render error in portal content shows fallback UI, retry action recovers |

---

## Final Compliance Report — 2026-03-21

### AGENTS.md Files Reviewed

- `AGENTS.md` (root) — conventions, critical rules, import paths, backward compatibility contract
- `packages/ui/AGENTS.md` — Button/IconButton rules, portal extension patterns, component replacement handles, injection spots
- `BACKWARD_COMPATIBILITY.md` — 13 contract surface categories

### Compliance Matrix

| Rule Source | Rule | Status | Notes |
|-------------|------|--------|-------|
| `packages/ui/AGENTS.md` | MUST NOT use raw `<button>` elements | Compliant | All raw buttons replaced with Button/IconButton |
| `packages/ui/AGENTS.md` | MUST use IconButton for icon-only buttons | Compliant | Close, toggle, bell buttons use IconButton |
| `packages/ui/AGENTS.md` | MUST pass `type="button"` on non-submit buttons | Compliant | Explicit in implementation rules |
| `AGENTS.md` | Never hard-code user-facing strings | Compliant | All strings use `useT()`; new key inventory in Internationalization section |
| `AGENTS.md` | Never hard-code user-facing strings (new components) | Compliant | PortalErrorBoundary uses class component + functional ErrorFallback child with `useT()` |
| `AGENTS.md` | Never hard-code `aria-label` strings | Compliant | All `aria-label` values use `useT()` keys; new keys listed in i18n section |
| `AGENTS.md` | No direct ORM relationships between modules | N/A | No data changes |
| `AGENTS.md` | Always filter by `organization_id` | N/A | No API changes |
| `BACKWARD_COMPATIBILITY.md` | FROZEN surfaces cannot be renamed/removed | Compliant | All 5 handles, all injection spots preserved |
| `BACKWARD_COMPATIBILITY.md` | STABLE surfaces: import paths cannot be removed | Compliant | No files moved or renamed |
| `BACKWARD_COMPATIBILITY.md` | STABLE surfaces: type fields cannot be narrowed | Compliant | All props types identical |
| `packages/ui/AGENTS.md` | Portal component replacement handles | Compliant | All preserved on equivalent DOM elements |
| `packages/ui/AGENTS.md` | Portal injection spots (FROZEN) | Compliant | Full inventory in migration table (including unrendered spots) |
| `packages/ui/AGENTS.md` | `data-menu-item-id` on menu items | Compliant | Attached to SidebarMenuButton elements |
| `AGENTS.md` | Spec MUST list integration coverage | Compliant | 11 test cases defined |

### Internal Consistency Check

| Check | Status | Notes |
|-------|--------|-------|
| Data models match API contracts | N/A | No data models or APIs |
| Risks cover all write operations | N/A | No write operations |
| Commands defined for all mutations | N/A | No mutations |
| Architecture matches implementation phases | Pass | File structure, component hierarchy, and phases are aligned |
| Backward compatibility inventory is complete | Pass | All FROZEN/STABLE surfaces enumerated, including unrendered spots |
| i18n keys enumerated for new components | Pass | 8 new keys listed in Internationalization section |
| Behavioral changes documented | Pass | 5 logic swaps in "What Changes Behaviorally" table |

### Verdict

**Fully compliant** — ready for implementation.

---

## Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-03-21 | — | Initial specification |
| 2026-03-21 | — | Architectural review: consolidated 8 phases → 5, merged icon migration into component phases, added wireframes, called out behavioral logic swaps honestly, clarified CSS variable layer is already present, acknowledged Sidebar over-investment tradeoff, added bundle size measurement step |
| 2026-03-21 | — | Triple review (3 passes): (1) Added bundle measurement checkpoint after Phase 3, noted PortalErrorBoundary as scope expansion. (2) Clarified Sheet onOpenChange→onClose mapping to prevent type mismatch bug, acknowledged Select mobile UX regression tradeoff, noted LanguageSwitcher pre-existing fetch violation as out-of-scope, fixed wireframe injection spot placement. (3) Added version pinning guidance for Radix deps, clarified public layout icon coverage, explicit PortalErrorBoundary export strategy, added i18n compliance row for new component. |
| 2026-03-21 | — | 5-agent review (19 findings resolved): **Critical:** (C1) PortalErrorBoundary must use class component + functional ErrorFallback child to access `useT()` hooks, (C2) breakpoint mismatch — portal must use 1023px breakpoint via `useMediaQuery` override, not default `useIsMobile` 767px. **Important:** (I1) disable sidebar cookie persistence to avoid admin/portal conflicts, (I2) added Internationalization section with 8 new translation keys, (I3) preserve `<nav>` landmark with `aria-label` in sidebar, (I4) added 3 integration tests (public landing, language switcher, error boundary), (I5) preserve LanguageSwitcher `disabled` pending state, (I6) all `aria-label` values must use `useT()`, (I7) i18n locale file step added to Phase 2, (I8) added Deployment Strategy section. **Medium:** (M1) clarified 4 FROZEN spots as declared-but-unrendered, (M2) added SSR Layout Shift risk with CSS fallback mitigation, (M3) added Radix Dialog `>=1.1.0` version requirement, (M4) added Tabs keyboard navigation to behavioral changes table. **Low:** (L1) added Double Sheet risk, (L2) added z-index conflict risk, (L3) added explicit bundle measurement steps in Phase 1 and Phase 3, (L4) added "(server component)" clarification for PortalLayoutShell, (L5) clarified PortalFeatureCard props optionality. |
