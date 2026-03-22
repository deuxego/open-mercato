import type { InjectionMenuItemWidget } from '@open-mercato/shared/modules/widgets/injection'

const widget: InjectionMenuItemWidget = {
  metadata: {
    id: 'inngest.injection.dashboard-link',
    title: 'Inngest Dashboard',
    description: 'Link to Inngest Dev Server dashboard',
    enabled: true,
    priority: 100,
  },
  menuItems: process.env.NODE_ENV === 'development' ? [
    {
      id: 'inngest-dashboard',
      label: 'Inngest Dashboard',
      href: process.env.NEXT_PUBLIC_INNGEST_BASE_URL ?? 'http://localhost:8288',
      icon: 'Workflow',
    },
  ] : [],
}

export default widget
