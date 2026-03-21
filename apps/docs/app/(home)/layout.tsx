import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { NavTitle, navLinks } from '@/lib/nav';
import type { ReactNode } from 'react';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <HomeLayout
      nav={{
        title: <NavTitle />,
        url: '/',
        transparentMode: 'top',
      }}
      links={[{ text: 'Docs', url: '/docs' }, ...navLinks]}
      githubUrl="https://github.com/open-mercato/open-mercato"
    >
      {children}
    </HomeLayout>
  );
}
