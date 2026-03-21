import { HomeLayout } from 'fumadocs-ui/layouts/home';
import type { ReactNode } from 'react';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <HomeLayout
      nav={{
        title: (
          <span className="flex items-center gap-2 font-semibold">
            <img src="/img/open-mercato.svg" alt="" className="size-5" />
            Open Mercato
          </span>
        ),
        url: '/',
        transparentMode: 'top',
      }}
      links={[
        { text: 'Docs', url: '/docs' },
        { text: 'User Guide', url: '/docs/user-guide/overview' },
        { text: 'Framework', url: '/docs/framework/modules/overview' },
        { text: 'REST API', url: '/docs/api/overview' },
      ]}
      githubUrl="https://github.com/open-mercato/open-mercato"
    >
      {children}
    </HomeLayout>
  );
}
