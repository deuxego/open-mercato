# Pre-Implementation Analysis: SPEC-070 — Docs Migration: Docusaurus → Fumadocs

## Executive Summary

SPEC-070 is **ready to implement with minor spec updates**. The migration scope is well-contained — `apps/docs` is an isolated documentation app with no platform contract surfaces (no entities, events, API routes, ACL, or DI). The codebase scan revealed 3 undocumented Docusaurus-specific patterns (sidebar frontmatter, heading anchors, JSX comments) that need handling. Tailwind v4 and Next.js 16 are already used in `apps/mercato`, eliminating dependency conflict risk.

---

## Backward Compatibility

### Violations Found

| # | Surface | Issue | Severity | Proposed Fix |
|---|---------|-------|----------|-------------|
| — | — | — | — | — |

**No BC violations.** `apps/docs` is a standalone documentation site. It does not participate in any of the 13 contract surface categories (no auto-discovery files, no module events, no widget spots, no API routes, no DB schema, no DI, no ACL, no CLI commands, no generated files). The migration is entirely self-contained.

### Missing BC Section

N/A — no backward compatibility impact. The spec correctly omits a Migration & Backward Compatibility section since no contract surfaces are affected.

---

## Spec Completeness

### Missing Sections

| Section | Impact | Recommendation |
|---------|--------|---------------|
| Data Models | N/A | Correctly omitted — no entities |
| API Contracts | N/A | Correctly omitted — no platform APIs |
| Commands & Events | N/A | Correctly omitted — no mutations |
| i18n | N/A | Correctly omitted — static docs, no locale keys |
| Final Compliance Report | N/A | Correctly omitted — no AGENTS.md rules apply to a docs app |
| Integration Test Coverage | Low | Could add a smoke test checklist (homepage loads, search works, 3 representative pages render) but not blocking |

### Incomplete Sections

| Section | Gap | Recommendation |
|---------|-----|---------------|
| Content Migration Map | Missing `sidebar_label:` frontmatter handling | 31 files use `sidebar_label:` — these map to `title` in `meta.json` entries. Add a row: "sidebar_label → meta.json title override" |
| Content Migration Map | Missing heading anchor `{#id}` syntax | 26 heading anchors in `framework/operations/system-status.mdx` use `{#custom-id}` — Fumadocs may not support this. Add a row for conversion or removal |
| Content Migration Map | Missing JSX comment `{/* */}` handling | 5 JSX comments appear in code examples in 2 files. These are inside fenced code blocks so likely safe, but should be verified |
| Content Migration Map | Admonition count underreported | Spec says 41 admonitions across 22 files; scan found 82 occurrences. Update the count |
| Risks | Missing `sidebar_label` data loss risk | If `sidebar_label` values differ from `title`, the display names in the sidebar will change after migration |
| Implementation Plan Phase 2 | No step for `sidebar_label` extraction | Add: "Extract `sidebar_label` values from frontmatter into corresponding `meta.json` title overrides" |

---

## AGENTS.md Compliance

### Violations

| Rule | Location | Fix |
|------|----------|-----|
| — | — | — |

**No violations.** The root AGENTS.md rules (module structure, data security, events, UI conventions, commands) apply to platform modules, not to a standalone docs app. The spec correctly places all changes within `apps/docs/`.

Relevant rules that DO apply:
- "Confirm project still builds after changes" → Each phase includes build verification. **Compliant.**
- "No `any` types" → Spec shows typed config code. **Compliant.**
- Keep standalone template in sync → N/A, docs app is not part of `create-app` template.

---

## Risk Assessment

### High Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| URL structure changes break SEO/bookmarks | External links and search rankings lost | Spec addresses: `baseUrl: '/'`. Additionally, verify that Fumadocs generates identical URL slugs for all 201 pages (Docusaurus slug rules may differ subtly from file-path-based routing) |

### Medium Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| `sidebar_label` values lost during migration | Sidebar displays `title` instead of custom short labels, degrading navigation UX for 31 pages | Extract `sidebar_label` values and use them as display titles in `meta.json` |
| Heading anchors `{#id}` break | 26 anchors in one file may render as literal text instead of setting heading IDs | Test Fumadocs heading anchor support; if unsupported, use `rehype-slug` with custom ID mapping or remove custom anchors |
| `output: 'standalone'` + Turbo build | Turbo expects `.next/**` output; standalone mode changes output structure | Verify turbo.json `outputs` pattern still captures standalone output correctly |
| Fumadocs `baseUrl: '/'` routing | Docs served at root means homepage (`app/page.tsx`) and docs (`app/docs/`) must coexist. Fumadocs may expect docs at a subpath | Test that the custom homepage at `/` doesn't conflict with docs layout. May need `baseUrl: '/docs'` with a redirect from `/` to `/docs` or keep homepage outside DocsLayout |

### Low Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Orama search quality differs | User search experience changes | Tunable post-migration |
| Shiki vs Prism rendering differences | Minor visual differences in code blocks | Cosmetic; unlikely to affect usability |
| `.md` files (54 of 201) treated differently | Fumadocs MDX compiler may handle `.md` differently than `.mdx` | Verify `.md` files render correctly; may need to configure `fumadocs-mdx` to include `.md` extension |

---

## Gap Analysis

### Critical Gaps (Block Implementation)

None.

### Important Gaps (Should Address Before Implementation)

- **`sidebar_label` extraction plan**: 31 files use `sidebar_label:` in frontmatter. The spec's Phase 2 needs a step to extract these values and encode them in `meta.json`. Without this, sidebar navigation labels will change.
- **Heading anchor `{#id}` handling**: 26 custom heading anchors in `framework/operations/system-status.mdx`. Need to determine if Fumadocs supports this syntax or if conversion is needed.
- **`.md` vs `.mdx` file handling**: 54 of 201 content files are `.md` (not `.mdx`). Verify Fumadocs processes both. The `defineDocs` config may need explicit file extension patterns.
- **Homepage + docs routing coexistence**: The spec sets `baseUrl: '/'` but also has a custom homepage at `app/page.tsx`. Need to verify these don't conflict — Docusaurus used `routeBasePath: '/'` which made docs the root, with a separate homepage mechanism. Fumadocs may work differently.

### Nice-to-Have Gaps

- **Link validation tooling**: The spec mentions "full link check" in Phase 5 but doesn't specify which tool. Consider `next-lint` or a dedicated MDX link checker plugin.
- **OpenGraph / meta tags**: The current Docusaurus config sets OG metadata. Fumadocs handles this differently (via page frontmatter + layout). Should verify meta tags are preserved for SEO.
- **Edit URL**: Docusaurus config has `editUrl` pointing to GitHub. Fumadocs supports this via `DocsLayout` props — should be configured.
- **Last updated author/time**: Docusaurus shows `showLastUpdateAuthor` and `showLastUpdateTime`. Fumadocs can do this via git integration but needs explicit setup.

---

## Remediation Plan

### Before Implementation (Must Do)

1. **Update spec Content Migration Map**: Add rows for `sidebar_label` frontmatter (31 files), heading anchors `{#id}` (1 file, 26 occurrences), and `.md` file handling (54 files)
2. **Update spec Phase 2**: Add step to extract `sidebar_label` values from frontmatter into `meta.json` title entries
3. **Update admonition count**: Change from "41 across 22 files" to "82 occurrences" in Current State table
4. **Clarify homepage/docs routing**: Verify `baseUrl: '/'` coexists with custom homepage, or adjust to `baseUrl: '/docs'` with root redirect

### During Implementation (Add to Spec)

1. **Verify `.md` file rendering**: In Phase 2, check that all 54 `.md` files compile correctly alongside `.mdx` files
2. **Configure `editUrl`**: In Phase 4, add GitHub edit link to `DocsLayout` props
3. **Test heading anchors**: In Phase 3, verify `{#id}` syntax support or convert

### Post-Implementation (Follow Up)

1. **SEO audit**: Compare OG tags and meta descriptions between old and new site
2. **Search quality spot-check**: Compare search results for 5 common queries
3. **Performance baseline**: Compare build time and page load speed

---

## Recommendation

**Ready to implement with minor spec updates.** The 4 items in "Before Implementation" are quick spec text additions (10 minutes). No architectural issues, no BC violations, no blocked dependencies. The migration scope is clean and well-contained.
