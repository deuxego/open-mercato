# Portal UI Refresh — shadcn Primitives & Block-Based Redesign

## TLDR

Replace hand-rolled portal UI with shadcn primitives and block-based layouts. Add 5 new primitives (Sheet, Avatar, Select, Skeleton, Sidebar), migrate inline SVGs to lucide-react, refactor PortalShell to use shadcn Sidebar system (sidebar-08 block), redesign login/signup pages using shadcn blocks (login-03, signup-05), and polish all portal pages. No hook/logic changes, no backend admin changes, all FROZEN contracts preserved.

## Open Questions

**Q1**: Are the shadcn block names (sidebar-08, login-03, signup-05) exact block references to follow structurally, or visual inspiration where we adapt freely to fit portal conventions?

**Q2**: PortalErrorBoundary (Phase 7) — in scope or deferred to a separate spec?

**Q3**: Dark mode — existing primitives use CSS variables for theming. Should new primitives (Sheet, Avatar, Select, Skeleton, Sidebar) support dark mode from day one, or is the portal currently light-only?

**Q4**: The brief lists `LanguageSwitcher.tsx` at `packages/ui/src/frontend/LanguageSwitcher.tsx` — is this the correct path? (Portal pages seem to live under `packages/core/src/modules/portal/frontend/`.)

**Q5**: The Sidebar primitive is the largest new addition (~300+ lines for the full shadcn system). Should we vendor the full shadcn Sidebar system (Provider, Content, Group, Menu, MenuItem, MenuButton, Footer, Header, Trigger, Rail, Inset — 15+ sub-components) or a minimal subset tailored to the portal's needs?

---

*Skeleton sections below — will be fleshed out after open questions are resolved.*

## Overview

<!-- Context, market reference, what exists today -->

## Problem Statement

<!-- 4 problems: visual inconsistency, missing primitives, DX, polish -->

## Proposed Solution

<!-- Approach, what changes vs. what doesn't, architecture -->

## Implementation Phases

<!-- Phase 0-7 breakdown -->

## Migration & Backward Compatibility

<!-- FROZEN surfaces, STABLE surfaces, DOM structure changes -->

## Risks & Impact Review

<!-- SSR hydration, component replacement, props contract, selectors, bundle size -->

## Testing

<!-- Manual verification, integration tests -->

## Final Compliance Report

<!-- AGENTS.md rules, BACKWARD_COMPATIBILITY.md surfaces -->

## Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-03-21 | — | Initial skeleton with open questions |
