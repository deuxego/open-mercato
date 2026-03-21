import type { EntityManager } from '@mikro-orm/postgresql'

export type AnalyticsSeedScope = {
  tenantId: string
  organizationId: string
}

export type AnalyticsSeedOptions = {
  months?: number
}

export async function seedAnalyticsData(
  _em: EntityManager,
  _scope: AnalyticsSeedScope,
  _options: AnalyticsSeedOptions = {}
): Promise<void> {
  // No-op — analytics seed data is provided by individual modules via their own setup.ts
}
