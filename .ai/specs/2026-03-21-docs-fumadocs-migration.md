# SPEC-070: Docs Migration: Docusaurus → Fumadocs

Replace `apps/docs` (Docusaurus 3.9.1) with Fumadocs UI — a Next.js App Router documentation framework. Unifies the docs toolchain with the existing Next.js/Tailwind monorepo stack.

---

## Current State

| Metric | Value |
|--------|-------|
| Framework | Docusaurus 3.9.1 (webpack, React 18) |
| Content files | 201 (147 MDX + 54 MD) |
| Screenshots | 175 PNG files (~60 MB) |
| Custom components | 2 (homepage, OpenAPI banner) |
| Sidebar categories | 12 top-level |
| Admonition blocks | 41 across 22 files |
| Mermaid diagrams | 7 across 5 files |
| Search | `@easyops-cn/docusaurus-search-local` |
| Deployment | Docker + Vercel |

---

## Why Migrate

1. **Toolchain fragmentation** — Docusaurus is the only non-Next.js app in the monorepo. Separate build system (webpack), routing model, and styling (Infima CSS vs Tailwind).
2. **Dependency island** — 5 Docusaurus-specific packages that exist only for the docs app.
3. **No component sharing** — CSS custom properties vs Tailwind means zero style reuse.
4. **Limited extensibility** — Adding interactive components requires fighting Docusaurus plugin architecture.

---

## Target Stack

| Concern | Choice |
|---------|--------|
| Framework | Fumadocs UI v16+ (Next.js App Router) |
| Styling | Tailwind CSS v4 + Fumadocs emerald preset |
| Search | Orama (built-in, self-hosted) |
| Syntax highlighting | Shiki (dual theme, built-in) |
| Mermaid | `remarkMdxMermaid` + client component |
| Admonitions | `remark-directive` + `remarkDirectiveAdmonition` (zero content changes) |
| App structure | Standalone `apps/docs/` |
| Deployment | Docker + Vercel (both preserved) |

> **Why Fumadocs over Nextra**: Nextra uses Pages Router, has slower development, and lacks built-in structured search. Fumadocs uses App Router, is actively maintained (v16+), and has richer built-in features.

---

## Content Migration Map

Zero-rewrite migration — all content changes are automated or handled by plugins.

| Docusaurus Feature | Fumadocs Equivalent | Migration Effort |
|---|---|---|
| `docs/*.mdx` files | `content/docs/*.mdx` | Move (path change only) |
| Frontmatter `title` + `description` | Same fields, same format | None |
| `:::tip` / `:::info` / `:::warning` / `:::danger` / `:::note` | `remark-directive` + `remarkDirectiveAdmonition` | None (plugin) |
| ` ```mermaid ` fenced blocks | `remarkMdxMermaid` + `<Mermaid>` component | None (plugin) |
| `import X from '@site/src/...'` | `import X from '@/components/...'` | Find-and-replace |
| `![img](/screenshots/...)` | Same syntax, files in `public/screenshots/` | None (after asset move) |
| Relative links `[text](../path)` | Same syntax | Verify after move |
| Prism syntax highlighting | Shiki (automatic) | None |

---

## Sidebar Migration

Centralized `sidebars.ts` → distributed `meta.json` files per folder (~25 total).

```json
// content/docs/meta.json (root)
{
  "pages": [
    "introduction", "installation", "user-guide", "architecture",
    "enterprise", "api", "cli", "customization", "framework",
    "tutorials", "appendix"
  ]
}
```

```json
// content/docs/introduction/meta.json (example category)
{
  "title": "Introduction",
  "pages": ["overview", "use-cases"]
}
```

---

## Component Migration

### Homepage (`src/pages/index.tsx` → `app/page.tsx`)

- Port 7 sections (Header, Screenshots, UserGuide, GettingStarted, Customization, Framework)
- `Layout` from `@theme/Layout` → standard Next.js layout
- `useColorMode` → `next-themes` `useTheme`
- CSS classes → Tailwind utilities

### OpenApiExplorerBanner (`src/components/` → `components/`)

- `Admonition` from `@theme/Admonition` → `Callout` from `fumadocs-ui/components/callout`
- `Link` from `@docusaurus/Link` → Next.js `Link`

---

## Styling Migration

| Docusaurus | Fumadocs |
|---|---|
| CSS custom properties (`--ifm-*`) | Fumadocs variables (`--color-fd-*`) + Tailwind |
| `src/css/custom.css` (175 lines) | `app/global.css` + Tailwind utilities |
| Primary `#71af43` | `--color-fd-primary: #71af43` |
| Inter font | Same, via Tailwind config |
| Dark mode via `data-theme` | Dark mode via `next-themes` `.dark` class |

---

## Target Directory Structure

```
apps/docs/
├── app/
│   ├── layout.tsx                    # RootProvider + global styles
│   ├── global.css                    # Tailwind v4 + Fumadocs emerald preset
│   ├── page.tsx                      # Custom homepage (ported)
│   ├── docs/
│   │   ├── layout.tsx                # DocsLayout with sidebar tree
│   │   └── [[...slug]]/
│   │       └── page.tsx              # Dynamic MDX page renderer
│   └── api/
│       └── search/
│           └── route.ts              # Orama search endpoint
├── content/
│   └── docs/                         # All MDX content (from docs/)
│       ├── meta.json                 # Root sidebar ordering
│       ├── introduction/
│       ├── installation/
│       ├── user-guide/
│       ├── architecture/
│       ├── enterprise/
│       ├── api/
│       ├── cli/
│       ├── customization/
│       ├── framework/
│       ├── tutorials/
│       └── appendix/
├── components/
│   ├── mdx.tsx                       # MDX component registry
│   ├── mermaid.tsx                   # Client-side Mermaid renderer
│   └── open-api-explorer-banner.tsx
├── lib/
│   ├── source.ts                     # Fumadocs content loader
│   └── layout.shared.ts             # Shared layout options
├── public/
│   ├── img/                          # From static/img/
│   └── screenshots/                  # From static/screenshots/
├── source.config.ts                  # MDX + remark plugin config
├── next.config.mjs                   # Next.js + Fumadocs MDX wrapper
├── package.json
├── tsconfig.json
├── Dockerfile
└── vercel.json
```

---

## Dependencies

**Add:**

| Package | Version | Purpose |
|---------|---------|---------|
| `fumadocs-ui` | ^16.7 | Pre-built docs UI components |
| `fumadocs-core` | ^16.6 | Core utilities, MDX plugins, search |
| `fumadocs-mdx` | ^14.2 | MDX compiler integration |
| `@types/mdx` | latest | TypeScript types |
| `remark-directive` | latest | Enables `:::` admonition syntax |
| `mermaid` | latest | Diagram rendering |
| `next` | ^16 | App framework |
| `next-themes` | latest | Dark mode |
| `tailwindcss` | ^4 | Styling |

**Remove:**

| Package | Reason |
|---------|--------|
| `@docusaurus/core` | Replaced by Next.js + Fumadocs |
| `@docusaurus/preset-classic` | Replaced by Fumadocs UI |
| `@docusaurus/theme-classic` | Replaced by Fumadocs UI |
| `@docusaurus/theme-mermaid` | Replaced by remark plugin |
| `@easyops-cn/docusaurus-search-local` | Replaced by Orama |
| `@mdx-js/react` | Fumadocs handles MDX |
| `@mermaid-js/layout-elk` | Not needed |
| `prism-react-renderer` | Replaced by Shiki |
| `@tsconfig/docusaurus` | Not needed |

---

## Key Config Files

### `source.config.ts`

```ts
import { defineDocs, defineConfig } from 'fumadocs-mdx/config';
import remarkDirective from 'remark-directive';
import { remarkDirectiveAdmonition } from 'fumadocs-core/mdx-plugins';

export const docs = defineDocs({ dir: 'content/docs' });

export default defineConfig({
  mdxOptions: {
    remarkPlugins: [remarkDirective, remarkDirectiveAdmonition],
    rehypeCodeOptions: {
      themes: { light: 'github-light', dark: 'github-dark' },
    },
  },
});
```

### `next.config.mjs`

```js
import { createMDX } from 'fumadocs-mdx/next';

const config = {
  reactStrictMode: true,
  output: 'standalone',
};

export default createMDX()(config);
```

### `lib/source.ts`

```ts
import { docs } from 'collections/server';
import { loader } from 'fumadocs-core/source';

export const source = loader({
  baseUrl: '/',
  source: docs.toFumadocsSource(),
});
```

### `app/global.css`

```css
@import 'tailwindcss';
@import 'fumadocs-ui/css/emerald.css';
@import 'fumadocs-ui/css/preset.css';
```

---

## Implementation Plan

### Phase 1: Scaffold & Infrastructure

> Fumadocs project builds and serves an empty docs site.

1. Create branch `feat/docs-fumadocs-migration`
2. Remove Docusaurus files: `docusaurus.config.ts`, `sidebars.ts`, `src/`, `.docusaurus/`
3. Remove Docusaurus dependencies from `package.json`
4. Install Fumadocs + Next.js + Tailwind dependencies
5. Create config files: `source.config.ts`, `next.config.mjs`, `tsconfig.json`
6. Create app shell: `app/layout.tsx`, `app/global.css`, `lib/source.ts`
7. Create docs layout: `app/docs/layout.tsx`, `app/docs/[[...slug]]/page.tsx`
8. Create search endpoint: `app/api/search/route.ts`
9. Add a test MDX file in `content/docs/`
10. Verify: `yarn dev` serves the docs site

### Phase 2: Content Migration

> All 201 doc files render correctly with sidebar navigation.

1. Move `docs/` → `content/docs/`
2. Create ~25 `meta.json` files (derived from `sidebars.ts`)
3. Find-and-replace `@site/src` → `@` in MDX import paths
4. Move `static/img/` → `public/img/`, `static/screenshots/` → `public/screenshots/`
5. Verify: all pages render, sidebar matches original, admonitions work, code blocks highlight

### Phase 3: Components & Mermaid

> Custom components and Mermaid diagrams work.

1. Create `components/mermaid.tsx` (client-side renderer with theme support)
2. Register in `components/mdx.tsx`
3. Port `OpenApiExplorerBanner` → `components/open-api-explorer-banner.tsx`
4. Update MDX import paths for ported components
5. Verify: all 7 Mermaid diagrams render, banner component works

### Phase 4: Homepage & Styling

> Custom homepage and theme match the current site.

1. Port `src/pages/index.tsx` → `app/page.tsx` (Tailwind conversion)
2. Customize theme variables in `global.css` (primary `#71af43`, backgrounds, fonts)
3. Configure navbar (6 doc sections + GitHub link)
4. Verify: homepage, dark mode, visual comparison with current site

### Phase 5: Deployment & Cleanup

> Docker and Vercel deployments work.

1. Update `vercel.json` (outputDirectory → `.next`)
2. Update `Dockerfile` (Next.js standalone build + `next start`)
3. Update `.gitignore` (add `.next`, `.source`; remove `.docusaurus`)
4. Update `package.json` scripts (`next dev`, `next build`, `next start`)
5. Remove leftover Docusaurus files
6. Verify: `yarn build`, Docker build, search indexing, full link check

---

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| URL structure changes break SEO/bookmarks | High | Configure `baseUrl: '/'` to match current routing; add Next.js redirects if any paths shift |
| Tailwind v4 conflicts with monorepo | Medium | Scoped to `apps/docs/package.json`; workspace isolation prevents bleeding |
| MDX files use undiscovered Docusaurus-specific syntax | Medium | Phase 2 systematic page verification; only 2 custom components minimizes surface |
| Broken internal links after file move | Medium | Phase 5 full link check; folder structure preserved internally |
| Orama search quality differs from current | Low | Mature engine; can be tuned post-migration |
| Deploy failure on Vercel/Docker | High | Phase 5 tests both targets; Vercel supports instant rollback to previous deployment |

---

## Changelog

| Date | Summary |
|------|---------|
| 2026-03-21 | Initial specification |
