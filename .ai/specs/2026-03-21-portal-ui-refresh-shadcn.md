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
- DOM structure changes in PortalShell (shadcn Sidebar adds wrappers); SSR handling for SidebarProvider state; must preserve all `data-portal-handle` and `data-menu-item-id` attributes for backward compatibility.

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
- `PortalContext.tsx`, `PortalLayoutShell.tsx`, `PortalLayoutProvider.tsx` (deprecated alias)
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

These swaps are low-risk because they improve accessibility (focus trapping, scroll lock, ARIA attributes) and the external contract (props, handles, selectors) is unchanged. But they are not invisible — integration tests should verify the behavioral equivalence.

### Design Decisions

| Decision | Rationale |
|----------|-----------|
| SidebarProvider lives inside PortalShell | Keeps public API unchanged; component replacement consumers of `section:portal:sidebar` don't need SidebarProvider knowledge |
| SSR defaults: `collapsed=false`, `isMobile=false` | Standard Next.js pattern; sidebar renders expanded, updates on client mount — no hydration mismatch |
| Sheet for notification panel (not custom drawer) | Gains focus trapping, scroll lock, animated transitions, Escape-to-close for free from Radix Dialog |
| Full shadcn Sidebar system (15+ sub-components) | The portal currently needs ~8 of these (Provider, Content, Group, MenuItem, MenuButton, Header, Footer, Trigger, Inset). Shipping the full system is a deliberate over-investment: it avoids maintaining a minimal fork and provides ready-made primitives for future portal features (collapsible sub-menus, rail mode). The unused sub-components are tree-shaken from the bundle. |
| Existing primitives preserved | Project-specific customizations (`data-slot`, `IconButton`, mobile-first Dialog, custom Alert variants, custom Tabs context) would be lost if replaced |
| Icon migration merged into component phases | Avoids touching files twice — icons are replaced in the same pass that refactors each component |
| No CSS variable setup needed | Portal already has complete shadcn CSS variable theming in `globals.css` (OKLch colors, `:root` + `.dark`, Tailwind `@theme inline` mapping, `ThemeProvider` with localStorage) |

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

(portal:login:before renders above the Card, portal:login:after below it)
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

(portal:signup:before renders above the Card, portal:signup:after below it)
```

---

## Data Models

N/A — no data model changes. This spec is a pure UI/component refactor.

---

## API Contracts

N/A — no API route changes. All existing portal API routes remain unchanged.

---

## Implementation Rules (All Phases)

- Use `IconButton` (not `Button size="icon"`) for all icon-only buttons (close, sidebar toggle, notification bell)
- Pass `type="button"` explicitly on all non-submit `Button`/`IconButton` instances
- All user-facing strings MUST use `useT()` with translation keys, never hard-coded strings
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

**Version pinning note:** The versions above are illustrative. Before adding, check `yarn.lock` for already-resolved versions of these packages (they may be transitively installed). Pin to the version already in the lockfile to avoid resolution churn. For truly new packages (`@radix-ui/react-avatar`, `@radix-ui/react-select`), use the latest stable version.

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
| `sidebar.tsx` | `@radix-ui/react-slot` | Full shadcn Sidebar system: Provider, Content, Group, Menu, MenuItem, MenuButton, MenuSub, MenuSubButton, MenuSubContent, Footer, Header, Trigger, Rail, Inset, Separator. Uses existing `useIsMobile` hook from `packages/ui/src/hooks/useIsMobile.ts`. |

**Steps:**
1. Create `skeleton.tsx` — simplest primitive, no Radix dependency
2. Create `avatar.tsx` — Radix Avatar with image + fallback
3. Create `sheet.tsx` — Radix Dialog-based side drawer with `side` variant
4. Create `select.tsx` — Radix Select with trigger, content, item, group, label, separator
5. Create `sidebar.tsx` — full shadcn Sidebar system adapted with project conventions (`cn()`, `data-slot`, `useIsMobile`)
6. Verify build passes: `yarn build:packages`

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
- Use `IconButton` for the close button (replacing inline XIcon SVG with lucide `X`)
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
- Keep pulse animation logic unchanged

#### PortalFeatureCard.tsx

- Use `Card` primitive internally for the container
- Use `Button asChild` for href variant (wrapping `<a>`)
- Use `Button` with `type="button"` for onClick variant
- Props type MUST remain identical: `{ icon, title, description, href, onClick }`

#### PortalPageHeader.tsx & PortalEmptyState.tsx

- Minor polish: typography refinement, ensure icon prop accepts lucide icons cleanly
- No structural changes

#### LanguageSwitcher.tsx

- Replace raw `<select>` with `Select`/`SelectTrigger`/`SelectContent`/`SelectItem` primitives
- Keep locale change logic (POST to `/api/auth/locale`, router refresh) unchanged. **Note:** the existing component uses raw `fetch` instead of `apiCall` — this is a pre-existing violation of `packages/ui/AGENTS.md` but is out of scope for this spec. Do not fix it here to avoid scope creep; track separately if desired.
- **UX tradeoff:** Native `<select>` renders platform-native UI on mobile (iOS bottom sheet, Android spinner). Radix Select renders a custom dropdown everywhere. For a 4-item locale picker this is an acceptable tradeoff — the visual consistency gain outweighs the minor mobile UX regression. If mobile UX is a concern, the Select primitive supports `position="popper"` which renders closer to native positioning.

#### PortalErrorBoundary.tsx (NEW — scope expansion)

- Create error boundary component in `packages/ui/src/portal/components/`
- Catches render errors in portal content, displays fallback UI with retry action (retry button and fallback text MUST use `useT()`)
- Used in PortalShell to wrap `{children}` in authenticated layout (wired in Phase 3)
- **Scope note:** This is additive new behavior, not a UI refresh of existing code. It's included here because it's small, improves resilience, and is best wired during the PortalShell refactor. Can be dropped without affecting the rest of the spec.

#### index.ts

- UNCHANGED — same 9 named exports. `PortalErrorBoundary` is intentionally NOT added to the barrel export: it's an internal implementation detail of PortalShell, not a public API for module authors. If a module author needs an error boundary for their portal pages, they should use React's standard `ErrorBoundary` pattern. Import path: `@open-mercato/ui/portal/components/PortalErrorBoundary` (internal, not part of STABLE contract).

**Steps:**
1. Refactor PortalCard (Card + Separator)
2. Refactor PortalNotificationPanel (Sheet + Tabs + Badge + IconButton + lucide icons)
3. Refactor PortalNotificationBell (lucide Bell + Badge)
4. Refactor PortalFeatureCard (Card + Button)
5. Polish PortalPageHeader and PortalEmptyState
6. Refactor LanguageSwitcher (Select primitive)
7. Create PortalErrorBoundary
8. Verify all props types are identical (TypeScript will catch narrowing)
9. Verify build passes: `yarn build:packages`

---

### Phase 3: PortalShell Refactor

Base on shadcn sidebar-08 block layout — inject existing portal logic into the block structure. Inline SVG icons (MenuIcon, XIcon, LogOutIcon) are replaced with lucide equivalents as part of this refactor.

#### Public Layout (Unauthenticated)

- Keep current structure (header + hero + footer)
- Replace any inline SVG icons with lucide (public layout shares MenuIcon/XIcon definitions with authenticated layout — once those component-level definitions are removed and replaced with lucide imports, both layouts benefit)
- Use `Button` consistently

#### Authenticated Layout

- Replace hand-rolled `<aside>` sidebar with shadcn `Sidebar` + `SidebarProvider`
- Replace manual mobile overlay (`mobileOpen` state + backdrop div) with Sidebar's built-in mobile Sheet (see "What Changes Behaviorally")
- Replace `SidebarNavItem` component with `SidebarMenuItem` + `SidebarMenuButton`
- Replace inline user avatar with `Avatar` primitive
- Replace inline SVG icons (MenuIcon, XIcon, LogOutIcon) with lucide (`Menu`, `X`, `LogOut`)
- Use `IconButton` for mobile menu toggle (`SidebarTrigger`)
- Wrap `{children}` with `PortalErrorBoundary` (created in Phase 2)

#### Preserved Contracts

| Contract | Status |
|----------|--------|
| `data-portal-handle` on shell root, header, footer, sidebar, user-menu | Preserved on equivalent DOM elements |
| `data-menu-item-id` on every nav item | Attached to `SidebarMenuButton` or its child `Link` |
| All 5 FROZEN component replacement handle exports | Unchanged |
| `PortalShellProps` type | Unchanged |
| Hook calls: `usePortalInjectedMenuItems`, `mergeMenuItems`, `usePortalContext`, `useT`, `usePathname` | Unchanged |
| `PortalEventBridgeMount` component | Unchanged |

#### SSR Considerations

- `SidebarProvider` defaults: `defaultOpen={true}` (sidebar expanded)
- `useIsMobile()` (from `packages/ui/src/hooks/useIsMobile.ts`) returns `false` during SSR via `useSyncExternalStore` server snapshot, updates on client mount
- No hydration mismatch: sidebar renders expanded by default, collapses on mobile after mount

**Steps:**
1. Import Sidebar primitives, Avatar, lucide icons, PortalErrorBoundary
2. Refactor authenticated layout to sidebar-08 structure (see wireframe above)
3. Wire `SidebarProvider` inside PortalShell (below `page:portal:layout` handle)
4. Move nav items to `SidebarGroup`/`SidebarMenuItem`/`SidebarMenuButton`
5. Preserve all `data-portal-handle` attributes on equivalent elements
6. Preserve all `data-menu-item-id` attributes on `SidebarMenuButton` elements
7. Remove manual mobile overlay logic (replaced by Sidebar's built-in Sheet)
8. Wire `Avatar` in sidebar footer
9. Wrap `{children}` with `PortalErrorBoundary`
10. Remove dead inline SVG component definitions (MenuIcon, XIcon, LogOutIcon)
11. Verify all 5 handle exports are unchanged
12. Verify `PortalShellProps` type is unchanged
13. Verify build

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
- Preserve `portal:dashboard:profile`, `portal:dashboard:sidebar` injection spots

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
| Menu injection spots | `menu:portal:sidebar:main`, `menu:portal:sidebar:account`, `menu:portal:header:actions`, `menu:portal:user-dropdown` | Hook calls unchanged |
| Page injection spots | `portal:home:before/after`, `portal:login:before/after`, `portal:signup:before/after`, `portal:dashboard:before/after`, `portal:dashboard:sections`, `portal:dashboard:profile`, `portal:dashboard:sidebar`, `portal:profile:before/after` | All `InjectionSpot` components and hook references preserved |
| Menu item test selectors | `data-menu-item-id` on all nav items | Attached to `SidebarMenuButton` elements |

### STABLE Surfaces — No Breaking Changes

| Surface | Contract | Status |
|---------|----------|--------|
| Import paths | All files under `packages/ui/src/portal/components/` | No files moved or renamed |
| Export names | `PortalCard`, `PortalCardHeader`, `PortalStatRow`, `PortalCardDivider`, `PortalPageHeader`, `PortalEmptyState`, `PortalFeatureCard`, `PortalNotificationBell`, `PortalNotificationPanel` (9 exports) | All preserved with identical names |
| Props types | All portal component props | Identical types, no removed/narrowed fields |
| PortalShellProps | Shell prop interface | Unchanged |
| Handle exports | `PORTAL_SHELL_HANDLE`, `PORTAL_HEADER_HANDLE`, `PORTAL_FOOTER_HANDLE`, `PORTAL_SIDEBAR_HANDLE`, `PORTAL_USER_MENU_HANDLE` | Same values, same export names |
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

#### SSR Hydration Mismatch
- **Scenario**: `SidebarProvider` reads `document.cookie` for collapsed state and `useIsMobile()` calls `window.matchMedia` — both unavailable during SSR, causing React hydration warnings.
- **Severity**: Medium
- **Affected area**: Portal authenticated layout (all pages inside PortalShell)
- **Mitigation**: Default to `collapsed=false` and `isMobile=false` on server. The existing `useIsMobile` hook at `packages/ui/src/hooks/useIsMobile.ts` already uses `useSyncExternalStore` with a `getServerSnapshot` that returns `false`. Sidebar renders expanded by default, collapses on mobile after mount.
- **Residual risk**: Low — well-trodden Next.js pattern

#### Behavioral Divergence from Radix Swap
- **Scenario**: Replacing hand-rolled Escape handler, backdrop, and mobile overlay with Radix Sheet/Sidebar introduces subtle behavioral differences (focus trapping order, scroll lock scope, animation timing) that break user workflows or integration tests.
- **Severity**: Medium
- **Affected area**: Notification panel (Sheet), mobile sidebar (Sidebar's built-in Sheet)
- **Mitigation**: Radix behavior is a superset of the hand-rolled behavior (adds focus trapping, scroll lock, ARIA attributes). The external contract (props, handles, selectors) is unchanged. Integration tests verify behavioral equivalence. Manual QA covers Escape-to-close, backdrop click, and focus return.
- **Residual risk**: Low — Radix is battle-tested; the risk is cosmetic (animation timing), not functional

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
- Language switcher (Select primitive)
- Component replacement handles (verify `data-portal-handle` selectors work)
- Menu injection (verify `data-menu-item-id` selectors work)
- Mobile responsive behavior (sidebar Sheet, notification Sheet)
- SSR: no hydration warnings in console
- Dark mode: verify all new primitives render correctly with dark theme
- Behavioral equivalence: Escape-to-close, backdrop click, focus return to trigger in notification panel and mobile sidebar

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
| `AGENTS.md` | Never hard-code user-facing strings | Compliant | All strings use `useT()` |
| `AGENTS.md` | No direct ORM relationships between modules | N/A | No data changes |
| `AGENTS.md` | Always filter by `organization_id` | N/A | No API changes |
| `BACKWARD_COMPATIBILITY.md` | FROZEN surfaces cannot be renamed/removed | Compliant | All 5 handles, all injection spots preserved |
| `BACKWARD_COMPATIBILITY.md` | STABLE surfaces: import paths cannot be removed | Compliant | No files moved or renamed |
| `BACKWARD_COMPATIBILITY.md` | STABLE surfaces: type fields cannot be narrowed | Compliant | All props types identical |
| `packages/ui/AGENTS.md` | Portal component replacement handles | Compliant | All preserved on equivalent DOM elements |
| `packages/ui/AGENTS.md` | Portal injection spots (FROZEN) | Compliant | Full inventory in migration table |
| `packages/ui/AGENTS.md` | `data-menu-item-id` on menu items | Compliant | Attached to SidebarMenuButton elements |
| `AGENTS.md` | Never hard-code user-facing strings (new components) | Compliant | PortalErrorBoundary fallback text and retry button use `useT()` |
| `AGENTS.md` | Spec MUST list integration coverage | Compliant | 8 test cases defined |

### Internal Consistency Check

| Check | Status | Notes |
|-------|--------|-------|
| Data models match API contracts | N/A | No data models or APIs |
| Risks cover all write operations | N/A | No write operations |
| Commands defined for all mutations | N/A | No mutations |
| Architecture matches implementation phases | Pass | File structure, component hierarchy, and phases are aligned |
| Backward compatibility inventory is complete | Pass | All FROZEN/STABLE surfaces enumerated |

### Verdict

**Fully compliant** — ready for implementation.

---

## Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-03-21 | — | Initial specification |
| 2026-03-21 | — | Architectural review: consolidated 8 phases → 5, merged icon migration into component phases, added wireframes, called out behavioral logic swaps honestly, clarified CSS variable layer is already present, acknowledged Sidebar over-investment tradeoff, added bundle size measurement step |
| 2026-03-21 | — | Triple review (3 passes): (1) Added bundle measurement checkpoint after Phase 3, noted PortalErrorBoundary as scope expansion. (2) Clarified Sheet onOpenChange→onClose mapping to prevent type mismatch bug, acknowledged Select mobile UX regression tradeoff, noted LanguageSwitcher pre-existing fetch violation as out-of-scope, fixed wireframe injection spot placement. (3) Added version pinning guidance for Radix deps, clarified public layout icon coverage, explicit PortalErrorBoundary export strategy, added i18n compliance row for new component. |
