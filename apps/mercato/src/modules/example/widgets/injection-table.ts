import type { ModuleInjectionTable } from '@open-mercato/shared/modules/widgets/injection'
import { parseBooleanWithDefault } from '@open-mercato/shared/lib/boolean'

const exampleInjectionWidgetsEnabled = parseBooleanWithDefault(
  process.env.NEXT_PUBLIC_OM_EXAMPLE_INJECTION_WIDGETS_ENABLED,
  false,
)
const crudFormExtendedEventsEnabled = parseBooleanWithDefault(
  process.env.NEXT_PUBLIC_OM_CRUDFORM_EXTENDED_EVENTS_ENABLED,
  false,
)

const alwaysEnabledInjectionTable: ModuleInjectionTable = {
  // Portal dashboard widgets — showcase widget injection for customer portal
  'portal:dashboard:sections': [
    { widgetId: 'example.injection.portal-stats', priority: 5 },
    { widgetId: 'example.injection.portal-recent-activity', priority: 10 },
    { widgetId: 'example.injection.portal-quick-links', priority: 20 },
  ],

  // Keep example module demo surfaces always available
  'crud-form:example.todo': 'example.injection.crud-validation',
  'widget:example.injection.crud-validation:addon': {
    widgetId: 'example.injection.crud-validation-addon',
    priority: 50,
  },
  'example:phase-c-handlers': 'example.injection.crud-validation',
  'menu:sidebar:main': {
    widgetId: 'example.injection.example-menus',
    priority: 50,
  },
  'menu:topbar:profile-dropdown': {
    widgetId: 'example.injection.example-profile-menu',
    priority: 50,
  },
}

/**
 * Example module injection table
 * Maps injection spot IDs to widget IDs for automatic widget injection
 */
export const injectionTable: ModuleInjectionTable = alwaysEnabledInjectionTable

export default injectionTable
