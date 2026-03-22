# Unified Hub Adapter Registry — `defineHub<T>()`

## TLDR

**Key Points:**
- Replace three inconsistent adapter registries (payment gateways, shipping carriers, data sync) with a single `defineHub<T>()` factory in `@open-mercato/shared`
- Providers export adapters from `integration.ts` (already auto-discovered); generator + bootstrap auto-register them into the correct hub

**Scope:**
- `defineHub<T>()` factory with `Symbol.for`-backed `globalThis` storage
- Migration of existing registries to hub instances with deprecated bridges
- Generator extraction of `adapter`/`adapters` exports from `integration.ts`
- Bootstrap auto-registration loop
- Provider `di.ts` cleanup (adapter registration moves to `integration.ts`)

**Concerns:**
- Payment gateways and shipping carriers modules were recently deleted (commits `8411d3745`, `bfae0c6a1`). Only `data_sync` remains as a live registry to migrate.

## Open Questions

- **Q1**: Payment gateways and shipping carriers were deleted from the codebase on 2026-03-21/22. Phase 2 assumes all three registries exist. Options:
  - **(a)** Phase 2 migrates only `data_sync`. When payment_gateways/shipping_carriers are rebuilt (via separate specs), they use `defineHub()` from the start — no deprecated bridges needed for them.
  - **(b)** Phase 2 pre-creates empty hub instances (`paymentGatewayHub`, `shippingCarrierHub`) in `@open-mercato/shared` even without the modules, so future specs can import them immediately.
  - **(c)** Restore the deleted registry files as deprecated bridges that delegate to hub instances. Not recommended — adds dead code.

- **Q2**: Current `registerDataSyncAdapter()` returns `void` (not a dispose function) and the registry has no `clear()`. The new `hub.register()` returns `() => void`. Should the deprecated bridge:
  - **(a)** Keep returning `void` (exact BC match) and discard the dispose function?
  - **(b)** Change to return `() => void` (minor BC improvement, technically additive since callers ignoring the return value are unaffected)?

- **Q3**: The brief shows eager adapter instances (`export const adapter = new StripeAdapter()`). Some future adapters may need DI container access for construction. Should we also support a lazy factory form: `export const adapter = (container: AppContainer) => new StripeAdapter(container.resolve('...'))`? Or is this YAGNI given adapters receive credentials at call-time?

---

## Overview

*(Pending Q1–Q3 answers)*

## Problem Statement

Hub adapter registries are inconsistent and require manual boilerplate:

| Hub | Storage | Key type | Versioned | Package | Boilerplate |
|-----|---------|----------|-----------|---------|-------------|
| Payment gateways | `globalThis` string keys | String literal | Yes | `@open-mercato/shared` | ~100 lines (deleted) |
| Shipping carriers | `globalThis` Symbol.for | Symbol | No | `@open-mercato/core` | ~33 lines (deleted) |
| Data sync | Module-scoped `Map` | Closure | No | `@open-mercato/core` | ~15 lines (live) |

Each registry copy-pastes similar code. Providers must manually call `registerXxxAdapter()` in `di.ts` even though `integration.ts` is already auto-discovered. Creating a new hub requires writing a new registry from scratch.

## Proposed Solution

*(Pending Q1–Q3 answers — high-level approach from brief will be expanded here)*

## Architecture

*(Pending)*

## Data Models

*(N/A — no database entities)*

## API Contracts

*(N/A — no HTTP APIs; TypeScript API only)*

## Implementation Plan

*(Pending — phases outlined in brief, will be refined based on Q1–Q3)*

## Risks & Impact Review

*(Pending)*

## Changelog

### 2026-03-22
- Skeleton spec created from detailed brief
- Research validated: payment_gateways and shipping_carriers deleted, only data_sync live
- Open questions Q1–Q3 raised
