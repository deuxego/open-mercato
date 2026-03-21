import type { MDXComponents } from 'mdx/types';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import { Mermaid } from '@/components/mermaid';

export function getMDXComponents(): MDXComponents {
  return {
    ...defaultMdxComponents,
    Mermaid,
  };
}
