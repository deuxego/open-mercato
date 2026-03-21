import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { source } from '@/lib/source';
import { NavTitle, navLinks } from '@/lib/nav';
import type { ReactNode } from 'react';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      tree={source.pageTree}
      nav={{
        title: <NavTitle />,
        url: '/',
        transparentMode: 'top',
      }}
      sidebar={{
        defaultOpenLevel: 1,
        collapsible: true,
      }}
      links={navLinks}
      githubUrl="https://github.com/open-mercato/open-mercato"
    >
      {children}
    </DocsLayout>
  );
}
