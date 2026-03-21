import { defineDocs, defineConfig } from 'fumadocs-mdx/config';
import remarkDirective from 'remark-directive';
import { remarkDirectiveAdmonition } from 'fumadocs-core/mdx-plugins/remark-directive-admonition';
import { remarkMdxMermaid } from 'fumadocs-core/mdx-plugins/remark-mdx-mermaid';

export const docs = defineDocs({ dir: 'content/docs' });

export default defineConfig({
  mdxOptions: {
    remarkPlugins: [
      remarkDirective,
      remarkDirectiveAdmonition,
      remarkMdxMermaid,
    ],
    rehypeCodeOptions: {
      themes: { light: 'github-light', dark: 'github-dark' },
    },
  },
});
