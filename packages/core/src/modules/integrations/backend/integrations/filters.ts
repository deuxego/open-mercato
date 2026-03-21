import type { FilterDef, FilterValues } from '@open-mercato/ui/backend/FilterBar'
import type { TranslateFn } from '@open-mercato/shared/lib/i18n/context'

export function buildIntegrationMarketplaceFilterDefs(t: TranslateFn, categories: string[]): FilterDef[] {
  return [
    {
      id: 'category',
      label: t('integrations.marketplace.filters.category', 'Category'),
      type: 'select',
      options: categories.map((category) => ({
        value: category,
        label: t(`integrations.marketplace.categories.${category}`, category),
      })),
      formatValue: (value) => t(`integrations.marketplace.categories.${value}`, value),
    },
  ]
}

export function normalizeIntegrationMarketplaceFilterValues(values: FilterValues): FilterValues {
  const category = typeof values.category === 'string' ? values.category : ''
  if (!category || category === 'all') return {}
  return { category }
}

export function getIntegrationMarketplaceCategory(values: FilterValues): string {
  const category = typeof values.category === 'string' ? values.category : ''
  return category || 'all'
}
