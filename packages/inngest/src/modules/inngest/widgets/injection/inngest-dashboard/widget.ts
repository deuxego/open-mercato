import type { InjectionMenuItemWidget } from '@open-mercato/shared/modules/widgets/injection'

const baseUrl = process.env.NEXT_PUBLIC_INNGEST_BASE_URL ?? 'http://localhost:8288'

const widget: InjectionMenuItemWidget = {
  metadata: {
    id: 'inngest.injection.dashboard-link',
    title: 'Inngest Dashboard',
    description: 'Link to Inngest workflow dashboard',
    enabled: true,
    priority: 100,
  },
  menuItems: baseUrl ? [
    {
      id: 'inngest-dashboard',
      label: 'Inngest Dashboard',
      href: baseUrl,
      icon: 'Workflow',
    },
  ] : [],
}

export default widget
