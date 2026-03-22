# Genericize Portal Identity Layer: Customer → PortalUser

## TLDR
**Key Points:**
- Rename all `Customer*` types, services, hooks, and module identifiers to `Portal*` equivalents, establishing a domain-agnostic identity layer for the portal frontend.
- The portal is the universal public-facing frontend; its identity layer should reflect this — not assume commerce.

**Scope:**
- Module rename: `customer_accounts` → `portal_accounts`
- Type/interface rename: `Customer*` → `Portal*` (shared + core + UI)
- Hook rename: `useCustomerAuth` → `usePortalAuth`
- DI service rename: `customer*Service` → `portal*Service`
- Cookie rename: `customer_auth_token` → `portal_auth_token`
- Event ID rename: `customer_accounts.*` → `portal_accounts.*`
- Page metadata rename: `requireCustomerAuth` → `requirePortalAuth`
- Default role cleanup: drop `buyer`, keep `portal_admin` + `member` + `viewer`
- Auth context cleanup: externalize CRM-specific fields (`customerEntityId`, `personEntityId`)

**Approach:** No deprecation bridges — clean rename. No external consumers exist.

---

## Overview

Open Mercato positions the **portal** as a universal, extensible public frontend — the counterpart to the admin **backend**. Any module (SaaS, healthcare, education, logistics) can extend the portal with pages, menus, widgets, and features.

However, the identity layer powering the portal uses **commerce-specific terminology**: `customer_accounts`, `CustomerUser`, `CustomerAuthContext`, `buyer` role. This creates a cognitive mismatch for non-commerce adopters and signals a domain assumption that doesn't exist in the actual architecture.

The portal extensibility mechanics are already fully generic. Only the **naming** is commerce-flavored.

> **Market Reference**: Studied Keycloak (realms + users), Auth0 (applications + users), Clerk (organizations + users), Supabase Auth, and Firebase Auth. All use generic "user" terminology with scoping. Since Open Mercato already has `User` for staff, `PortalUser` provides clean disambiguation — same pattern as Clerk's distinction between "organization members" and "admin users".

## Problem Statement

1. **Domain mismatch**: A healthcare SaaS using Open Mercato sees `CustomerUser`, `buyer` role, `customer_accounts` module — signals this is a commerce platform, not a generic framework.
2. **Naming inconsistency**: Portal UI components are already generic (`PortalShell`, `PortalCard`, `usePortalContext`) but the identity layer underneath says "Customer" everywhere.
3. **Onboarding friction**: New adopters must mentally translate "customer = portal user" — an unnecessary cognitive load.
4. **Documentation confusion**: AGENTS.md mixes "customer" and "portal" terminology when describing the same user type.

## Proposed Solution

Rename the entire `Customer*` surface to `Portal*`, creating a consistent naming story:

- **Backend** = admin panel, powered by `User` + `Auth` (staff)
- **Portal** = public frontend, powered by `PortalUser` + `PortalAuth` (external users)

No deprecation bridges. No dual-emit. No re-exports. Clean, direct rename across the entire codebase.

### Design Decisions

| Decision | Rationale |
|----------|-----------|
| Keep `portal` naming | FROZEN spot IDs, handles, and injection points are already generic |
| `PortalUser` over `Member`/`ExternalUser` | Creates symmetry with existing portal naming; self-explanatory in any domain |
| Module ID `portal_accounts` | Mirrors the `portal` concept; `portal_accounts.user.updated` reads naturally as events |
| Keep DB table names unchanged | Low value, high risk — ORM entities rename but `@Entity({ tableName: 'customer_users' })` stays. No data migration needed |
| `isPortalAdmin` stays | Already generic — no "customer" in the name |
| Feature prefix `portal.*` stays | Already generic |
| No deprecation bridges | No external consumers — clean rename is safe and simpler |
| `type: 'portal'` in JWT | Clean break from `'customer'` — no active sessions to preserve |

### Alternatives Considered

| Alternative | Why Rejected |
|-------------|-------------|
| Rename `portal` to `client`/`app`/`site` | FROZEN contract surfaces (spot IDs, handles, events) are already generic — no need |
| `Member*` naming | Too generic — "member" could mean team member (staff). `PortalUser` is unambiguous |
| `ExternalUser*` naming | Verbose, clinical. Doesn't tie to the portal concept |
| Rename DB tables | High-risk migration for internal implementation detail. ORM entity names are what developers see |
| Deprecation bridges | No external consumers — adds complexity with zero benefit |

## Architecture

### Rename Mapping (Complete)

#### Types & Interfaces (`packages/shared`)

| Current | New | File |
|---------|-----|------|
| `CustomerAuthContext` | `PortalAuthContext` | `modules/portal-auth.ts` (rename from `customer-auth.ts`) |
| `CustomerUser` | `PortalUser` | `modules/portal-auth.ts` |
| `CustomerRole` | `PortalRole` | `modules/portal-auth.ts` |
| `CustomerAuthResult` | `PortalAuthResult` | `modules/portal-auth.ts` |
| `DefaultCustomerRoleFeatures` | `DefaultPortalRoleFeatures` | `modules/setup.ts` |

Delete old `modules/customer-auth.ts`.

#### Page Metadata (`packages/shared`)

| Current | New | File |
|---------|-----|------|
| `requireCustomerAuth` | `requirePortalAuth` | `modules/registry.ts` |
| `requireCustomerFeatures` | `requirePortalFeatures` | `modules/registry.ts` |

Remove old keys entirely.

#### Hooks (`packages/ui`)

| Current | New |
|---------|-----|
| `useCustomerAuth` | `usePortalAuth` (rename file to `usePortalAuth.ts`) |

Delete old `useCustomerAuth.ts`.

#### Auth Context Shape

```typescript
// Before
interface CustomerAuthContext {
  sub: string
  type: 'customer'
  tenantId: string
  orgId: string
  email: string
  displayName: string
  customerEntityId?: string | null   // CRM-specific
  personEntityId?: string | null     // CRM-specific
  resolvedFeatures: string[]
}

// After
interface PortalAuthContext {
  sub: string
  type: 'portal'
  tenantId: string
  orgId: string
  email: string
  displayName: string
  links?: Record<string, string>     // Generic extension bag
  resolvedFeatures: string[]
}
```

- `type` changes from `'customer'` to `'portal'`
- `customerEntityId`/`personEntityId` → `links: { customer: '...', person: '...' }` — CRM module populates via enricher
- DB columns `customer_entity_id` and `person_entity_id` on `customer_users` table stay (mapped into `links` at read time)

#### Module (`packages/core`)

| Current | New |
|---------|-----|
| Module folder: `customer_accounts/` | `portal_accounts/` |
| Module ID: `customer_accounts` | `portal_accounts` |
| `requires: ['customer_accounts']` (portal module) | `requires: ['portal_accounts']` |

#### DI Services

| Current | New |
|---------|-----|
| `customerUserService` | `portalUserService` |
| `customerSessionService` | `portalSessionService` |
| `customerTokenService` | `portalTokenService` |
| `customerRbacService` | `portalRbacService` |
| `customerInvitationService` | `portalInvitationService` |

#### Service Classes

| Current | New |
|---------|-----|
| `CustomerUserService` | `PortalUserService` |
| `CustomerSessionService` | `PortalSessionService` |
| `CustomerTokenService` | `PortalTokenService` |
| `CustomerRbacService` | `PortalRbacService` |
| `CustomerInvitationService` | `PortalInvitationService` |

#### ORM Entities

| Current Class | New Class | Table Name (unchanged) |
|---------------|-----------|----------------------|
| `CustomerUser` | `PortalUserEntity` | `customer_users` |
| `CustomerRole` | `PortalRoleEntity` | `customer_roles` |
| `CustomerRoleAcl` | `PortalRoleAcl` | `customer_role_acls` |
| `CustomerUserRole` | `PortalUserRole` | `customer_user_roles` |
| `CustomerUserAcl` | `PortalUserAcl` | `customer_user_acls` |
| `CustomerUserSession` | `PortalUserSession` | `customer_user_sessions` |
| `CustomerUserEmailVerification` | `PortalUserEmailVerification` | `customer_user_email_verifications` |
| `CustomerUserPasswordReset` | `PortalUserPasswordReset` | `customer_user_password_resets` |
| `CustomerUserInvitation` | `PortalUserInvitation` | `customer_user_invitations` |

DB table names stay unchanged — no migration needed.

#### Cookies

| Current | New |
|---------|-----|
| `customer_auth_token` | `portal_auth_token` |
| `customer_session_token` | `portal_session_token` |

Clean switch — no grace period needed.

#### Events

| Current | New |
|---------|-----|
| `customer_accounts.user.created` | `portal_accounts.user.created` |
| `customer_accounts.user.updated` | `portal_accounts.user.updated` |
| `customer_accounts.user.locked` | `portal_accounts.user.locked` |
| `customer_accounts.user.unlocked` | `portal_accounts.user.unlocked` |
| `customer_accounts.email.verified` | `portal_accounts.email.verified` |
| `customer_accounts.password.reset` | `portal_accounts.password.reset` |
| `customer_accounts.role.updated` | `portal_accounts.role.updated` |
| `customer_accounts.role.created` | `portal_accounts.role.created` |
| `customer_accounts.user.deleted` | `portal_accounts.user.deleted` |
| `customer_accounts.login.success` | `portal_accounts.login.success` |
| `customer_accounts.login.failed` | `portal_accounts.login.failed` |
| `customer_accounts.invitation.created` | `portal_accounts.invitation.created` |
| `customer_accounts.invitation.accepted` | `portal_accounts.invitation.accepted` |
| `customer_accounts.role.deleted` | `portal_accounts.role.deleted` |

Note: `portal_accounts.user.created` and `portal_accounts.invitation.accepted` have `clientBroadcast: true` (admin SSE). Portal-broadcast events (`portalBroadcast: true`): `user.updated`, `user.locked`, `user.unlocked`, `email.verified`, `password.reset`, `role.updated`.

Single emit — no dual-emit needed.

#### Notification Type IDs

| Current | New |
|---------|-----|
| `customer_accounts.user.signup` | `portal_accounts.user.signup` |
| `customer_accounts.user.locked` | `portal_accounts.user.locked` |

Notification link paths update: `/backend/customer_accounts/{id}` → `/backend/portal_accounts/{id}`.

#### i18n Locale Keys

All locale files (`locales/en.json`, `de.json`, `es.json`, `pl.json`) rename top-level namespace:
- `customer_accounts.*` → `portal_accounts.*`
- Includes: page titles, feature labels, notification templates, form labels

#### Search Config

| Current | New |
|---------|-----|
| Entity type: `customer_accounts:customer_user` | `portal_accounts:portal_user` |
| Search badge module reference | Updated to `portal_accounts` |

#### Custom Entity Declarations (ce.ts)

Entity IDs update from `customer_accounts:*` prefix to `portal_accounts:*`.

#### Subscriber & Worker Metadata

| File | Field | Current | New |
|------|-------|---------|-----|
| `subscribers/notifyStaffOnSignup.ts` | `metadata.event` | `customer_accounts.user.created` | `portal_accounts.user.created` |
| `workers/cleanupExpiredSessions.ts` | `metadata.queue` | `customer_accounts` | `portal_accounts` |
| `workers/cleanupExpiredTokens.ts` | `metadata.queue` | `customer_accounts` | `portal_accounts` |

#### API Routes

| Current | New |
|---------|-----|
| `/api/customer_accounts/login` | `/api/portal_accounts/login` |
| `/api/customer_accounts/signup` | `/api/portal_accounts/signup` |
| `/api/customer_accounts/magic-link/*` | `/api/portal_accounts/magic-link/*` |
| `/api/customer_accounts/password/*` | `/api/portal_accounts/password/*` |
| `/api/customer_accounts/portal/*` | `/api/portal_accounts/*` (flatten — `/portal/` sub-path now redundant) |
| `/api/customer_accounts/admin/*` | `/api/portal_accounts/admin/*` |
| `/api/customer_accounts/invitations/*` | `/api/portal_accounts/invitations/*` |
| `/api/customer_accounts/email/*` | `/api/portal_accounts/email/*` |

The `/portal/` sub-path under the module becomes redundant. Flatten: `/api/portal_accounts/portal/profile` → `/api/portal_accounts/profile`.

#### ACL Features

| Current | New |
|---------|-----|
| `customer_accounts.view` | `portal_accounts.view` |
| `customer_accounts.manage` | `portal_accounts.manage` |
| `customer_accounts.roles.manage` | `portal_accounts.roles.manage` |
| `customer_accounts.invite` | `portal_accounts.invite` |

#### Default Roles

| Current | New | Change |
|---------|-----|--------|
| `portal_admin` | `portal_admin` | No change |
| `buyer` | `member` | Rename — generic |
| `viewer` | `viewer` | No change |

#### Backend Pages

| Current | New |
|---------|-----|
| `/backend/customer_accounts` | `/backend/portal_accounts` |
| `/backend/customer_accounts/[id]` | `/backend/portal_accounts/[id]` |
| `/backend/customer_accounts/roles` | `/backend/portal_accounts/roles` |
| `/backend/customer_accounts/roles/create` | `/backend/portal_accounts/roles/create` |
| `/backend/customer_accounts/roles/[id]` | `/backend/portal_accounts/roles/[id]` |

#### Rate Limiter Constants

| Current | New |
|---------|-----|
| `customerLoginRateLimitConfig` | `portalLoginRateLimitConfig` |
| `customerSignupRateLimitConfig` | `portalSignupRateLimitConfig` |
| `customerPasswordResetRateLimitConfig` | `portalPasswordResetRateLimitConfig` |
| `customerMagicLinkRateLimitConfig` | `portalMagicLinkRateLimitConfig` |
| (+ IP variants) | (+ IP variants) |

### Import Path Changes

| Current | New |
|---------|-----|
| `@open-mercato/shared/modules/customer-auth` | `@open-mercato/shared/modules/portal-auth` |
| `@open-mercato/core/modules/customer_accounts/lib/customerAuth` | `@open-mercato/core/modules/portal_accounts/lib/portalAuth` |
| `@open-mercato/core/modules/customer_accounts/lib/customerAuthServer` | `@open-mercato/core/modules/portal_accounts/lib/portalAuthServer` |
| `@open-mercato/ui/portal/hooks/useCustomerAuth` | `@open-mercato/ui/portal/hooks/usePortalAuth` |

Old paths deleted — no re-exports.

## Migration & Compatibility

### DB Tables — No Rename
ORM entity classes rename but `@Entity({ tableName: 'customer_users' })` annotations keep old table names. Zero migration risk.

### Feature ID Migration
ACL feature IDs are stored in DB (`role_acls.feature` column). Requires UPDATE migration:
```sql
UPDATE role_acls SET feature = REPLACE(feature, 'customer_accounts.', 'portal_accounts.')
  WHERE feature LIKE 'customer_accounts.%';
```

### Role Slug Migration
```sql
UPDATE customer_roles SET slug = 'member' WHERE slug = 'buyer';
```

### Auth Context `links` Migration
- DB columns `customer_entity_id` and `person_entity_id` stay on the `customer_users` table
- ORM entity maps them into `links` at read time: `links: { customer: this.customerEntityId, person: this.personEntityId }`
- `PortalAuthContext` only exposes `links` — no `customerEntityId`/`personEntityId` fields

## Implementation Plan

### Phase 1: Shared Package Rename

**Goal**: All shared types and interfaces use new names.

1. Rename `packages/shared/src/modules/customer-auth.ts` → `portal-auth.ts`
2. Rename all types inside: `CustomerAuthContext` → `PortalAuthContext`, `CustomerUser` → `PortalUser`, `CustomerRole` → `PortalRole`, `CustomerAuthResult` → `PortalAuthResult`
3. Change `type` field from `'customer'` to `'portal'`
4. Replace `customerEntityId`/`personEntityId` with `links?: Record<string, string>`
5. Update `packages/shared/src/modules/setup.ts`: `DefaultCustomerRoleFeatures` → `DefaultPortalRoleFeatures`, `defaultCustomerRoleFeatures` → `defaultPortalRoleFeatures`
6. Update `packages/shared/src/modules/registry.ts`: `requireCustomerAuth` → `requirePortalAuth`, `requireCustomerFeatures` → `requirePortalFeatures`
7. Update package.json exports if `customer-auth` path is listed
8. Verify `packages/shared` builds

### Phase 2: UI Package Rename

**Goal**: All UI hooks and components use new names.

1. Rename `packages/ui/src/portal/hooks/useCustomerAuth.ts` → `usePortalAuth.ts`
2. Rename hook: `useCustomerAuth` → `usePortalAuth`, update all internal types to `Portal*`
3. Update `PortalContext.tsx`: use `PortalAuthResult`, `PortalAuthContext` types
4. Update `PortalLayoutShell.tsx`: rename `customerAuth` prop → `portalAuth`
5. Update all portal component imports that reference `Customer*` types
6. Update package.json exports if `useCustomerAuth` path is listed
7. Verify `packages/ui` builds

### Phase 3: Core Module Rename

**Goal**: Module folder, services, entities, auth lib, events, ACL — all renamed.

1. Rename folder `packages/core/src/modules/customer_accounts/` → `portal_accounts/`
2. Update `index.ts`: `name: 'portal_accounts'`, `title: 'Portal Accounts'`
3. Update `portal/index.ts`: `requires: ['portal_accounts']`
4. Rename service files and classes:
   - `customerUserService.ts` → `portalUserService.ts` (`PortalUserService`)
   - `customerSessionService.ts` → `portalSessionService.ts` (`PortalSessionService`)
   - `customerTokenService.ts` → `portalTokenService.ts` (`PortalTokenService`)
   - `customerRbacService.ts` → `portalRbacService.ts` (`PortalRbacService`)
   - `customerInvitationService.ts` → `portalInvitationService.ts` (`PortalInvitationService`)
5. Update `di.ts`: register as `portalUserService`, `portalSessionService`, etc.
6. Rename ORM entity classes (keep `tableName` annotations):
   - `CustomerUser` → `PortalUserEntity`, etc.
   - Map `customer_entity_id`/`person_entity_id` columns into `links` getter
7. Rename auth lib files:
   - `customerAuth.ts` → `portalAuth.ts`
   - `customerAuthServer.ts` → `portalAuthServer.ts`
   - Update cookie names to `portal_auth_token` / `portal_session_token`
   - Update JWT `type` to `'portal'`
8. Rename `rateLimiter.ts` constants: `customer*` → `portal*`
9. Update `acl.ts`: feature IDs to `portal_accounts.*`
10. Update `events.ts`: all event IDs to `portal_accounts.*`, rename emitter function
11. Update `setup.ts`:
    - Use `defaultPortalRoleFeatures` in config merging
    - Change default role slug `buyer` → `member`
    - Update feature seeding to `portal_accounts.*`
12. Update `notifications.ts`: rename type IDs to `portal_accounts.*`, update link paths to `/backend/portal_accounts/{id}`
13. Update `search.ts`: rename entity type IDs to `portal_accounts:portal_user`, update badge references
14. Update `ce.ts`: rename custom entity ID prefixes to `portal_accounts:*`
15. Update subscriber metadata: `notifyStaffOnSignup.ts` → `metadata.event: 'portal_accounts.user.created'`
16. Update worker metadata: `cleanupExpiredSessions.ts`, `cleanupExpiredTokens.ts` → `metadata.queue: 'portal_accounts'`
17. Update `data/enrichers.ts`: rename internal entity references
18. Update `api/interceptors.ts`: rename internal references
19. Rename i18n locale files keys: `customer_accounts.*` → `portal_accounts.*` in all 4 locale files (en, de, es, pl)
20. Rename backend page folders: `backend/customer_accounts/` → `backend/portal_accounts/`
21. Flatten API route folders: move `api/portal/*` routes up (remove redundant `/portal/` prefix)
22. Update all internal imports within the module
23. Update AGENTS.md for the module
24. Verify `packages/core` builds

### Phase 4: App & Consumer Updates

**Goal**: All consumers updated. Full build passes.

1. Update `apps/mercato/src/modules.ts`: change `{ id: 'customer_accounts', from: '@open-mercato/core' }` → `{ id: 'portal_accounts', from: '@open-mercato/core' }`
2. Update `apps/mercato/src/app/(frontend)/[...slug]/page.tsx`:
   - `requirePortalAuth` / `requirePortalFeatures`
   - New import paths for `getCustomerAuthFromCookies` → `getPortalAuthFromCookies`
3. Update `apps/mercato/src/app/(frontend)/[...slug]/layout.tsx`:
   - New import paths
   - `customerAuth` → `portalAuth` prop
4. Update `packages/create-app/template/` — same changes:
   - `packages/create-app/template/src/modules.ts` — module reference to `portal_accounts`
   - `packages/create-app/template/src/app/(frontend)/[...slug]/page.tsx` — metadata keys + imports
   - `packages/create-app/template/src/app/(frontend)/[...slug]/layout.tsx` — imports + prop names
5. Update all modules with `defaultCustomerRoleFeatures` → `defaultPortalRoleFeatures` in `setup.ts`
6. Update all modules that import `Customer*` types → `Portal*`
7. Run `npm run modules:prepare` (triggers `yarn generate`) to regenerate module registry
8. Full `yarn build` pass

### Phase 5: Tests

**Goal**: All unit and integration tests updated and passing.

#### Unit Tests (rename imports + assertions)

Direct module tests — move with the module:
- `packages/core/src/modules/customer_accounts/__tests__/featureMatch.test.ts` → `portal_accounts/__tests__/featureMatch.test.ts`
- `packages/core/src/modules/customer_accounts/__tests__/tokenGenerator.test.ts` → `portal_accounts/__tests__/tokenGenerator.test.ts`
- `packages/core/src/modules/customer_accounts/__tests__/validators.test.ts` → `portal_accounts/__tests__/validators.test.ts`

Tests that reference `Customer*` types or `customer_accounts` strings:
- `packages/core/src/modules/auth/__tests__/cli-setup-acl.test.ts` — update feature ID strings (`customer_accounts.*` → `portal_accounts.*`)
- `packages/core/src/__tests__/module-decoupling.test.ts` — update module name reference
- `packages/shared/src/lib/middleware/__tests__/page-executor.test.ts` — update `requireCustomerAuth` → `requirePortalAuth`
- `packages/shared/src/lib/crud/__tests__/enricher-registry.test.ts` — update any `Customer*` type references
- `packages/shared/src/lib/crud/__tests__/sync-event-runner.test.ts` — update event ID strings
- `packages/shared/src/lib/query/__tests__/engine.test.ts` — update type references
- `packages/shared/src/lib/query/__tests__/query-extension-runner.test.ts` — update type references
- `packages/shared/src/lib/umes/__tests__/enricher-timing.test.ts` — update references
- `packages/shared/src/lib/umes/__tests__/interceptor-activity.test.ts` — update references
- `packages/shared/src/lib/umes/__tests__/conflict-detection.test.ts` — update references
- `packages/shared/src/lib/commands/__tests__/command-interceptor-runner.test.ts` — update references
- `packages/cli/src/lib/__tests__/resolver.test.ts` — update module name if referenced
- `packages/cli/src/lib/__tests__/resolver.enterprise.test.ts` — same
- `packages/cli/src/lib/db/__tests__/commands.test.ts` — update if referencing customer tables

Template integration tests — update `customer_accounts` → `portal_accounts` references:
- `packages/create-app/template/src/modules/example/__integration__/TC-UMES-002.spec.ts`
- `packages/create-app/template/src/modules/example/__integration__/TC-UMES-003.spec.ts`
- `packages/create-app/template/src/modules/example/__integration__/TC-UMES-004.spec.ts`
- `packages/create-app/template/src/modules/example/__integration__/TC-UMES-006-mutation-lifecycle.spec.ts`
- `packages/create-app/template/src/modules/example/__integration__/TC-UMES-007.spec.ts`
- `packages/create-app/template/src/modules/example/__integration__/TC-UMES-008.spec.ts`
- `packages/create-app/template/src/modules/example/__integration__/TC-UMES-010.spec.ts`
- `packages/create-app/template/src/modules/example/__integration__/TC-UMES-011.spec.ts`
- `packages/create-app/template/src/modules/example/__integration__/TC-UMES-012.spec.ts`
- `packages/create-app/template/src/modules/example/widgets/__tests__/injection-table.test.ts`

#### QA Scenarios (update terminology in markdown)

Update `customer_accounts` / `customer` references where they refer to the portal identity module:
- `.ai/qa/scenarios/TC-UMES-ML07-command-interceptor-customer-audit.md`

Note: CRM-prefixed scenarios (TC-CRM-*) and sales scenarios (TC-SALES-*) use "customer" in the CRM/commerce domain sense (companies, persons, deals) — these do NOT need renaming as they refer to business domain customers, not portal identity.

#### Verification
1. `yarn test` — all unit tests pass
2. `yarn test:integration` — all integration tests pass
3. `yarn build` — full build passes

### Phase 6: DB Migration & Documentation

**Goal**: Stored data updated. All docs current.

1. Create migration: rename `customer_accounts.*` → `portal_accounts.*` features in `role_acls` table
2. Create migration: rename `buyer` → `member` role slug in `customer_roles` table
3. Create migration: rename `customer_accounts.*` → `portal_accounts.*` notification type values in `notifications` table
4. Update root `AGENTS.md` — import table, task router, all references
4. Update `packages/ui/AGENTS.md` — portal hook names, type names
5. Update `packages/core/AGENTS.md` — module references
6. Rename `packages/core/src/modules/portal_accounts/AGENTS.md` — full rewrite with new names
7. Update `packages/shared/AGENTS.md` — type references
8. Update existing specs that reference `customer_accounts` or `Customer*`
9. Full `yarn build` + `yarn test` pass

### File Manifest (Key Files)

| File | Action | Purpose |
|------|--------|---------|
| `packages/shared/src/modules/portal-auth.ts` | Create (rename) | Canonical type definitions |
| `packages/shared/src/modules/customer-auth.ts` | Delete | Old types file |
| `packages/shared/src/modules/setup.ts` | Modify | `DefaultPortalRoleFeatures` |
| `packages/shared/src/modules/registry.ts` | Modify | `requirePortalAuth`/`requirePortalFeatures` |
| `packages/ui/src/portal/hooks/usePortalAuth.ts` | Create (rename) | Canonical hook |
| `packages/ui/src/portal/hooks/useCustomerAuth.ts` | Delete | Old hook file |
| `packages/ui/src/portal/PortalContext.tsx` | Modify | Use `Portal*` types |
| `packages/ui/src/portal/PortalLayoutShell.tsx` | Modify | `portalAuth` prop |
| `packages/core/src/modules/portal_accounts/` | Create (rename) | Renamed module folder |
| `packages/core/src/modules/customer_accounts/` | Delete | Old module folder |
| `packages/core/src/modules/portal_accounts/di.ts` | Modify | New DI names |
| `packages/core/src/modules/portal_accounts/events.ts` | Modify | New event IDs |
| `packages/core/src/modules/portal_accounts/acl.ts` | Modify | New feature IDs |
| `packages/core/src/modules/portal_accounts/setup.ts` | Modify | New role slug, new config key |
| `packages/core/src/modules/portal_accounts/lib/portalAuth.ts` | Create (rename) | New cookie names, JWT type |
| `packages/core/src/modules/portal_accounts/lib/portalAuthServer.ts` | Create (rename) | Server-side auth |
| `packages/core/src/modules/portal_accounts/data/entities.ts` | Modify | Rename classes, keep tableName, add `links` getter |
| `packages/core/src/modules/portal_accounts/services/*.ts` | Modify (rename) | Rename classes |
| `packages/core/src/modules/portal_accounts/notifications.ts` | Modify | Rename notification type IDs + link paths |
| `packages/core/src/modules/portal_accounts/search.ts` | Modify | Rename entity type IDs |
| `packages/core/src/modules/portal_accounts/ce.ts` | Modify | Rename entity ID prefixes |
| `packages/core/src/modules/portal_accounts/subscribers/*.ts` | Modify | Update event metadata |
| `packages/core/src/modules/portal_accounts/workers/*.ts` | Modify | Update queue metadata |
| `packages/core/src/modules/portal_accounts/data/enrichers.ts` | Modify | Update internal references |
| `packages/core/src/modules/portal_accounts/api/interceptors.ts` | Modify | Update internal references |
| `packages/core/src/modules/portal_accounts/locales/*.json` | Modify | Rename key namespace |
| `apps/mercato/src/modules.ts` | Modify | Module ID registration |
| `apps/mercato/src/app/(frontend)/[...slug]/page.tsx` | Modify | New metadata keys + imports |
| `apps/mercato/src/app/(frontend)/[...slug]/layout.tsx` | Modify | New import paths + prop names |
| `packages/core/src/modules/portal_accounts/__tests__/*.test.ts` | Rename (move) | Module unit tests |
| `packages/core/src/modules/auth/__tests__/cli-setup-acl.test.ts` | Modify | Update feature ID strings |
| `packages/core/src/__tests__/module-decoupling.test.ts` | Modify | Update module name |
| `packages/shared/src/lib/middleware/__tests__/page-executor.test.ts` | Modify | `requirePortalAuth` |
| `packages/shared/src/lib/crud/__tests__/*.test.ts` | Modify | Update type/event references |
| `packages/shared/src/lib/umes/__tests__/*.test.ts` | Modify | Update references |
| `packages/shared/src/lib/query/__tests__/*.test.ts` | Modify | Update type references |
| `packages/create-app/template/src/modules/example/__integration__/*.spec.ts` | Modify | Update `customer_accounts` refs |
| `packages/create-app/template/src/modules.ts` | Modify | Module reference |
| `packages/create-app/template/src/app/(frontend)/[...slug]/*.tsx` | Modify | Metadata keys + imports |

### Testing Strategy

- **Build verification**: `yarn build` passes at each phase boundary
- **Unit tests**: 3 module-specific tests move with the folder; ~14 cross-cutting tests update `Customer*` → `Portal*` imports and string references
- **Template integration tests**: 9 UMES spec tests + 1 widget test update `customer_accounts` references
- **QA scenarios**: 1 markdown scenario updated (CRM/sales scenarios keep "customer" — domain term, not identity term)
- **Verification commands**: `yarn test`, `yarn test:integration`, `yarn build` at Phase 5 boundary
- **Migration tests**: Feature ID and role slug migrations on fresh and seeded DB

## Risks & Impact Review

### Data Integrity Failures

- **Feature ID migration**: UPDATE on `role_acls` table. If interrupted, some features have old names, some new. Mitigation: run in transaction. Re-runnable.
- **Role slug migration**: Single UPDATE on `customer_roles`. Same transaction mitigation.

### Cascading Failures & Side Effects

- None — no external consumers. All internal code updated atomically in the same release.

### Tenant & Data Isolation Risks

- No change to tenant isolation — naming-only refactor. All `organization_id` scoping remains intact.

### Migration & Deployment Risks

#### Feature ID Migration
- **Scenario**: `role_acls` table UPDATE interrupted mid-transaction.
- **Severity**: Low
- **Affected area**: RBAC resolution
- **Mitigation**: Transaction + re-runnable migration. Table is small.
- **Residual risk**: Acceptable.

### Operational Risks

- **Blast radius**: Zero — naming refactor, not behavior change.
- **Monitoring**: No new monitoring needed — existing health checks apply.

## Final Compliance Report — 2026-03-22

### AGENTS.md Files Reviewed
- `AGENTS.md` (root)
- `packages/core/AGENTS.md`
- `packages/shared/AGENTS.md`
- `packages/ui/AGENTS.md`
- `packages/core/src/modules/customer_accounts/AGENTS.md`

### Compliance Matrix

| Rule Source | Rule | Status | Notes |
|-------------|------|--------|-------|
| root AGENTS.md | No direct ORM relationships between modules | Compliant | No new relationships |
| root AGENTS.md | Filter by organization_id | Compliant | No query changes |
| root AGENTS.md | Event IDs: `module.entity.action` | Compliant | `portal_accounts.user.updated` follows convention |
| root AGENTS.md | Modules: plural, snake_case | Compliant | `portal_accounts` |
| packages/core/AGENTS.md | API routes MUST export openApi | Compliant | Renamed routes keep openApi exports |

### Internal Consistency Check

| Check | Status | Notes |
|-------|--------|-------|
| Data models match API contracts | Pass | Entity renames don't change API shape |
| API contracts match UI/UX section | Pass | Hook renames produce same data shape |
| Risks cover all write operations | Pass | Feature migration covered |
| Commands defined for all mutations | N/A | No new mutations — rename only |
| Cache strategy covers all read APIs | Pass | Existing cache config unchanged |

### Non-Compliant Items

None.

### Verdict

**Fully compliant** — Ready for implementation.

## Changelog
### 2026-03-22
- Initial specification
- Decided: keep `portal` naming (already generic)
- Decided: `Customer*` → `Portal*` (Option A)
- Decided: keep DB table names unchanged (ORM class rename only)
- Decided: default roles `portal_admin` + `member` + `viewer` (drop `buyer`)
- Decided: externalize CRM fields to `links` bag
- Decided: no deprecation bridges — clean rename, no external consumers
