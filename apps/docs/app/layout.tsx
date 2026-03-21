import { RootProvider } from 'fumadocs-ui/provider/next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import type { ReactNode } from 'react';
import './global.css';

export const metadata = {
  title: {
    default: 'Open Mercato Docs',
    template: '%s | Open Mercato',
  },
  description:
    'Extensible ERP foundation framework with modular architecture',
  icons: { icon: '/img/open-mercato.svg' },
  openGraph: {
    type: 'website' as const,
    siteName: 'Open Mercato Docs',
  },
  twitter: {
    card: 'summary' as const,
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <body className="antialiased">
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
