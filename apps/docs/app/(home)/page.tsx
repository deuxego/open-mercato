import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  description:
    'Documentation for the Open Mercato framework covering modules, APIs, data extensibility, and admin customization.',
};

const features = [
  {
    title: 'Modular Architecture',
    description:
      'Self-contained modules with auto-discovery. Add features without touching core code.',
    icon: '{}',
  },
  {
    title: 'Extension System',
    description:
      'Widget injection, event subscribers, API interceptors — extend anything from outside.',
    icon: '<>',
  },
  {
    title: 'Built-in Security',
    description:
      'RBAC, field-level encryption, tenant isolation, and MFA out of the box.',
    icon: '[]',
  },
  {
    title: 'AI-Supportive',
    description:
      'MCP tool definitions, schema discovery, and agentic development kit included.',
    icon: '//',
  },
];

const quickLinks = [
  {
    title: 'Quick Start',
    description: 'Scaffold a new app with create-mercato-app.',
    href: '/docs/customization/standalone-app',
  },
  {
    title: 'Installation',
    description: 'Set up the platform locally in minutes.',
    href: '/docs/installation/setup',
  },
  {
    title: 'Architecture',
    description: 'Understand the system topology.',
    href: '/docs/architecture/system-overview',
  },
  {
    title: 'REST API',
    description: 'Authenticate and interact with endpoints.',
    href: '/docs/api/overview',
  },
  {
    title: 'Create a Module',
    description: 'Build your first custom module step by step.',
    href: '/docs/customization/create-first-module',
  },
  {
    title: 'Framework Reference',
    description: 'Deep dive into DI, events, commands, and routing.',
    href: '/docs/framework/modules/overview',
  },
];

const screenshots = [
  {
    src: '/screenshots/open-mercato-homepage.png',
    alt: 'Dashboard overview',
  },
  {
    src: '/screenshots/open-mercato-users-management.png',
    alt: 'Users management',
  },
  {
    src: '/screenshots/open-mercato-define-custom-fields.png',
    alt: 'Custom fields',
  },
  {
    src: '/screenshots/open-mercato-custom-entity-records.png',
    alt: 'Entity records',
  },
];

export default function HomePage() {
  return (
    <main>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-fd-border">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,var(--color-fd-primary)/0.08,transparent_70%)]" />
        <div className="relative mx-auto max-w-5xl px-6 pb-20 pt-28 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-fd-border bg-fd-card px-3 py-1 text-xs text-fd-muted-foreground">
            <span className="size-1.5 rounded-full bg-fd-primary" />
            Open Source ERP Framework
          </div>
          <h1 className="mb-4 text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            Build business apps
            <br />
            <span className="text-fd-primary">without starting from scratch</span>
          </h1>
          <p className="mx-auto mb-8 max-w-2xl text-lg text-fd-muted-foreground">
            Open Mercato is a modular, extensible ERP foundation framework.
            Strong defaults, room to customize everything.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link
              href="/docs"
              className="rounded-md bg-fd-primary px-5 py-2.5 text-sm font-medium text-fd-primary-foreground transition-colors hover:bg-fd-primary/90"
            >
              Read the Docs
            </Link>
            <Link
              href="/docs/customization/standalone-app"
              className="rounded-md border border-fd-border bg-fd-card px-5 py-2.5 text-sm font-medium text-fd-foreground transition-colors hover:bg-fd-accent"
            >
              Get Started
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-b border-fd-border py-16">
        <div className="mx-auto max-w-5xl px-6">
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-fd-border bg-fd-border sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="flex flex-col gap-2 bg-fd-card p-5"
              >
                <span className="font-mono text-xs text-fd-primary">
                  {feature.icon}
                </span>
                <h3 className="text-sm font-semibold">{feature.title}</h3>
                <p className="text-xs leading-relaxed text-fd-muted-foreground">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Screenshots */}
      <section className="border-b border-fd-border py-16">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="mb-2 text-sm font-medium uppercase tracking-wider text-fd-muted-foreground">
            Preview
          </h2>
          <p className="mb-8 text-2xl font-bold">See it in action</p>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {screenshots.map((shot) => (
              <a
                key={shot.src}
                href={shot.src}
                target="_blank"
                rel="noopener noreferrer"
                className="group overflow-hidden rounded-lg border border-fd-border transition-all hover:border-fd-primary/40 hover:shadow-md"
              >
                <img
                  src={shot.src}
                  alt={shot.alt}
                  loading="lazy"
                  className="aspect-[4/3] w-full object-cover"
                />
                <span className="block border-t border-fd-border bg-fd-card px-3 py-2 text-xs text-fd-muted-foreground">
                  {shot.alt}
                </span>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Quick Links */}
      <section className="py-16">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="mb-2 text-sm font-medium uppercase tracking-wider text-fd-muted-foreground">
            Explore
          </h2>
          <p className="mb-8 text-2xl font-bold">Jump right in</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {quickLinks.map((link) => (
              <Link
                key={link.title}
                href={link.href}
                className="group rounded-lg border border-fd-border bg-fd-card p-5 transition-all hover:border-fd-primary/40 hover:shadow-md"
              >
                <h3 className="mb-1 text-sm font-semibold group-hover:text-fd-primary">
                  {link.title}
                </h3>
                <p className="text-xs text-fd-muted-foreground">
                  {link.description}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-fd-border py-8">
        <div className="mx-auto max-w-5xl px-6 text-center text-xs text-fd-muted-foreground">
          Built with{' '}
          <a
            href="https://fumadocs.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-fd-foreground"
          >
            Fumadocs
          </a>
          . Open source under MIT license.
        </div>
      </footer>
    </main>
  );
}
