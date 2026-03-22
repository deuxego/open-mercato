import { defineHub } from '../index'

/**
 * Integration test: proves the full hub adapter pipeline works end-to-end.
 *
 * Simulates what the bootstrap factory does when processing modules
 * with hubAdapters extracted from integration.ts by the generator.
 *
 * Pipeline: lib/adapter.ts → integration.ts export → generator → hubAdapters on Module → bootstrap → hub.get()
 */

interface TestSyncAdapter {
  readonly providerKey: string
  readonly direction: 'import' | 'export' | 'bidirectional'
  readonly supportedEntities: string[]
}

interface TestGatewayAdapter {
  readonly providerKey: string
  charge(amount: number): Promise<{ ok: boolean }>
}

interface ModuleHubAdapterEntry {
  hub: string
  providerKey: string
  adapter: unknown
  version?: string
}

let counter = 0
function uniqueHubId(prefix: string): string {
  counter += 1
  return `${prefix}-bootstrap-${Date.now()}-${counter}`
}

describe('hub bootstrap integration', () => {
  const dataSyncHubId = uniqueHubId('data_sync')
  const paymentHubId = uniqueHubId('payment_gateways')

  afterEach(() => {
    defineHub({ id: dataSyncHubId }).clear()
    defineHub({ id: paymentHubId }).clear()
  })

  it('auto-registers adapters from hubAdapters entries (simulates bootstrap)', () => {
    // Simulate adapter defined in lib/adapter.ts, exported from integration.ts
    const shopifyAdapter: TestSyncAdapter = {
      providerKey: 'shopify',
      direction: 'import',
      supportedEntities: ['products', 'orders'],
    }

    // Simulate what the generator extracts from integration.ts into Module.hubAdapters
    const modules = [
      {
        id: 'sync_shopify',
        hubAdapters: [
          { hub: dataSyncHubId, providerKey: 'shopify', adapter: shopifyAdapter },
        ] as ModuleHubAdapterEntry[],
      },
    ]

    // Simulate bootstrap: clear → register (mirrors factory.ts logic)
    const hubIdsToClear = new Set<string>()
    for (const module of modules) {
      for (const entry of module.hubAdapters ?? []) {
        hubIdsToClear.add(entry.hub)
      }
    }
    for (const id of hubIdsToClear) {
      defineHub({ id }).clear()
    }
    for (const module of modules) {
      if (module.hubAdapters?.length) {
        for (const entry of module.hubAdapters) {
          const hub = defineHub({ id: entry.hub })
          hub.register(entry.adapter as object, { version: entry.version })
        }
      }
    }

    // Consumer resolves adapter via hub — same way API routes do
    const hub = defineHub<TestSyncAdapter>({ id: dataSyncHubId })
    const resolved = hub.get('shopify')

    expect(resolved).toBe(shopifyAdapter)
    expect(resolved?.providerKey).toBe('shopify')
    expect(resolved?.supportedEntities).toEqual(['products', 'orders'])
  })

  it('registers adapters from multiple provider modules into the same hub', () => {
    const stripeAdapter: TestGatewayAdapter = {
      providerKey: 'stripe',
      charge: async () => ({ ok: true }),
    }
    const paypalAdapter: TestGatewayAdapter = {
      providerKey: 'paypal',
      charge: async () => ({ ok: true }),
    }

    const modules = [
      {
        id: 'gateway_stripe',
        hubAdapters: [{ hub: paymentHubId, providerKey: 'stripe', adapter: stripeAdapter }],
      },
      {
        id: 'gateway_paypal',
        hubAdapters: [{ hub: paymentHubId, providerKey: 'paypal', adapter: paypalAdapter }],
      },
    ]

    // Bootstrap
    const hubIdsToClear = new Set<string>()
    for (const module of modules) {
      for (const entry of module.hubAdapters ?? []) {
        hubIdsToClear.add(entry.hub)
      }
    }
    for (const id of hubIdsToClear) {
      defineHub({ id }).clear()
    }
    for (const module of modules) {
      for (const entry of module.hubAdapters ?? []) {
        defineHub({ id: entry.hub }).register(entry.adapter as object, { version: entry.version })
      }
    }

    // Both adapters resolvable from the same hub
    const hub = defineHub<TestGatewayAdapter>({ id: paymentHubId })
    expect(hub.get('stripe')).toBe(stripeAdapter)
    expect(hub.get('paypal')).toBe(paypalAdapter)
    expect(hub.list()).toHaveLength(2)
  })

  it('registers versioned adapters from hubAdapters entries', () => {
    const versionedHubId = uniqueHubId('versioned_gw')
    const adapterV1: TestGatewayAdapter = {
      providerKey: 'stripe',
      charge: async () => ({ ok: true }),
    }
    const adapterV2: TestGatewayAdapter = {
      providerKey: 'stripe',
      charge: async () => ({ ok: true }),
    }

    const modules = [
      {
        id: 'gateway_stripe',
        hubAdapters: [
          { hub: versionedHubId, providerKey: 'stripe', adapter: adapterV1, version: '2024-12-18' },
          { hub: versionedHubId, providerKey: 'stripe', adapter: adapterV2, version: '2025-02-24' },
        ],
      },
    ]

    // Bootstrap with versioned hub
    for (const module of modules) {
      for (const entry of module.hubAdapters ?? []) {
        const hub = defineHub({ id: entry.hub, versioned: true })
        hub.register(entry.adapter as object, { version: entry.version })
      }
    }

    const hub = defineHub<TestGatewayAdapter>({ id: versionedHubId, versioned: true })
    expect(hub.get('stripe', '2024-12-18')).toBe(adapterV1)
    expect(hub.get('stripe', '2025-02-24')).toBe(adapterV2)
    expect(hub.get('stripe')).toBe(adapterV1) // first registered = default fallback
    expect(hub.list()).toHaveLength(1) // deduped

    defineHub({ id: versionedHubId }).clear()
  })

  it('hub declared in one package resolves adapters registered by bootstrap in another', () => {
    // Simulates: hub declared in @open-mercato/core, adapter registered by bootstrap in @open-mercato/shared
    // Both use defineHub({ id: same }) — Symbol.for ensures same backing Map

    const crossPackageHubId = uniqueHubId('cross_pkg')
    const adapter: TestSyncAdapter = {
      providerKey: 'akeneo',
      direction: 'bidirectional',
      supportedEntities: ['products', 'categories'],
    }

    // "Core package" declares the hub
    const coreHub = defineHub<TestSyncAdapter>({ id: crossPackageHubId })

    // "Shared/bootstrap" registers via a separate defineHub call (same id)
    const bootstrapHub = defineHub({ id: crossPackageHubId })
    bootstrapHub.register(adapter as object)

    // Core hub resolves the adapter registered by bootstrap
    expect(coreHub.get('akeneo')).toBe(adapter)
    expect(coreHub.list()).toHaveLength(1)

    coreHub.clear()
  })

  it('modules without hubAdapters are skipped gracefully', () => {
    const hubId = uniqueHubId('skip_test')

    const modules = [
      { id: 'auth', hubAdapters: undefined },
      { id: 'directory' },
      { id: 'sync_shopify', hubAdapters: [{ hub: hubId, providerKey: 'shopify', adapter: { providerKey: 'shopify' } }] },
    ]

    // Bootstrap — should not throw on modules without hubAdapters
    for (const module of modules) {
      const adapters = (module as { hubAdapters?: ModuleHubAdapterEntry[] }).hubAdapters
      if (adapters?.length) {
        for (const entry of adapters) {
          defineHub({ id: entry.hub }).register(entry.adapter as object)
        }
      }
    }

    const hub = defineHub({ id: hubId })
    expect(hub.list()).toHaveLength(1)
    hub.clear()
  })
})
