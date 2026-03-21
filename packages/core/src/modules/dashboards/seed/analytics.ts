import type { EntityManager } from '@mikro-orm/postgresql'

export type AnalyticsSeedScope = {
  tenantId: string
  organizationId: string
}

export type AnalyticsSeedOptions = {
  months?: number
  ordersPerMonth?: number
  customersCount?: number
  productsCount?: number
  dealsCount?: number
}

export async function seedAnalyticsData(
  _em: EntityManager,
  _scope: AnalyticsSeedScope,
  _options: AnalyticsSeedOptions = {}
): Promise<{ orders: number; customers: number; products: number; deals: number }> {
  // Commerce modules removed — analytics seed data is not available
  return { orders: 0, customers: 0, products: 0, deals: 0 }
}
