import { defineHub } from '../index'
import type { Hub } from '../index'

interface TestAdapter {
  providerKey: string
  name: string
}

interface CarrierAdapter {
  carrierId: string
  label: string
}

let hub: Hub<TestAdapter>
let testId: string
let counter = 0

function uniqueId(prefix: string): string {
  counter += 1
  return `${prefix}-${Date.now()}-${counter}`
}

describe('defineHub', () => {
  beforeEach(() => {
    testId = uniqueId('test-hub')
    hub = defineHub<TestAdapter>({ id: testId })
  })

  afterEach(() => {
    hub.clear()
  })

  describe('basic lifecycle — register/get/list/clear', () => {
    it('registers an adapter and retrieves it by key', () => {
      const adapter: TestAdapter = { providerKey: 'stripe', name: 'Stripe Payments' }
      hub.register(adapter)

      expect(hub.get('stripe')).toBe(adapter)
    })

    it('lists all registered adapters', () => {
      const stripe: TestAdapter = { providerKey: 'stripe', name: 'Stripe' }
      const paypal: TestAdapter = { providerKey: 'paypal', name: 'PayPal' }
      hub.register(stripe)
      hub.register(paypal)

      const listed = hub.list()
      expect(listed).toHaveLength(2)
      expect(listed).toContain(stripe)
      expect(listed).toContain(paypal)
    })

    it('clears all adapters', () => {
      hub.register({ providerKey: 'stripe', name: 'Stripe' })
      hub.register({ providerKey: 'paypal', name: 'PayPal' })

      hub.clear()

      expect(hub.list()).toEqual([])
      expect(hub.get('stripe')).toBeUndefined()
      expect(hub.get('paypal')).toBeUndefined()
    })

    it('returns undefined for an unknown key', () => {
      expect(hub.get('nonexistent')).toBeUndefined()
    })

    it('returns an empty array when no adapters are registered', () => {
      expect(hub.list()).toEqual([])
    })

    it('exposes the hub id as a readonly property', () => {
      expect(hub.id).toBe(testId)
    })
  })

  describe('versioned register with fallback', () => {
    let versionedHub: Hub<TestAdapter>

    beforeEach(() => {
      versionedHub = defineHub<TestAdapter>({ id: uniqueId('test-versioned'), versioned: true })
    })

    afterEach(() => {
      versionedHub.clear()
    })

    it('registers adapter with version and retrieves it without version (fallback)', () => {
      const adapter: TestAdapter = { providerKey: 'stripe', name: 'Stripe v1' }
      versionedHub.register(adapter, { version: '1.0' })

      expect(versionedHub.get('stripe')).toBe(adapter)
    })

    it('retrieves the correct version when two versions of the same provider exist', () => {
      const v1: TestAdapter = { providerKey: 'stripe', name: 'Stripe v1' }
      const v2: TestAdapter = { providerKey: 'stripe', name: 'Stripe v2' }
      versionedHub.register(v1, { version: '1.0' })
      versionedHub.register(v2, { version: '2.0' })

      expect(versionedHub.get('stripe', '1.0')).toBe(v1)
      expect(versionedHub.get('stripe', '2.0')).toBe(v2)
    })

    it('returns the first-registered adapter as fallback when no version specified', () => {
      const v1: TestAdapter = { providerKey: 'stripe', name: 'Stripe v1' }
      const v2: TestAdapter = { providerKey: 'stripe', name: 'Stripe v2' }
      versionedHub.register(v1, { version: '1.0' })
      versionedHub.register(v2, { version: '2.0' })

      expect(versionedHub.get('stripe')).toBe(v1)
    })

    it('does not overwrite fallback when a second version is registered (first wins)', () => {
      const v1: TestAdapter = { providerKey: 'stripe', name: 'Stripe v1' }
      const v2: TestAdapter = { providerKey: 'stripe', name: 'Stripe v2' }
      const v3: TestAdapter = { providerKey: 'stripe', name: 'Stripe v3' }
      versionedHub.register(v1, { version: '1.0' })
      versionedHub.register(v2, { version: '2.0' })
      versionedHub.register(v3, { version: '3.0' })

      expect(versionedHub.get('stripe')).toBe(v1)
    })

    it('falls back to unversioned entry when requested version does not exist', () => {
      const v1: TestAdapter = { providerKey: 'stripe', name: 'Stripe v1' }
      versionedHub.register(v1, { version: '1.0' })

      expect(versionedHub.get('stripe', '999.0')).toBe(v1)
    })
  })

  describe('dispose function', () => {
    it('returns a dispose function from register()', () => {
      const dispose = hub.register({ providerKey: 'stripe', name: 'Stripe' })

      expect(typeof dispose).toBe('function')
    })

    it('removes the adapter when dispose is called', () => {
      const dispose = hub.register({ providerKey: 'stripe', name: 'Stripe' })

      dispose()

      expect(hub.get('stripe')).toBeUndefined()
      expect(hub.list()).toEqual([])
    })

    it('does not affect other adapters when one is disposed', () => {
      const paypal: TestAdapter = { providerKey: 'paypal', name: 'PayPal' }
      const disposeStripe = hub.register({ providerKey: 'stripe', name: 'Stripe' })
      hub.register(paypal)

      disposeStripe()

      expect(hub.get('stripe')).toBeUndefined()
      expect(hub.get('paypal')).toBe(paypal)
    })

    describe('versioned dispose', () => {
      let versionedHub: Hub<TestAdapter>

      beforeEach(() => {
        versionedHub = defineHub<TestAdapter>({ id: uniqueId('test-versioned-dispose'), versioned: true })
      })

      afterEach(() => {
        versionedHub.clear()
      })

      it('removes the compound key on dispose', () => {
        const adapter: TestAdapter = { providerKey: 'stripe', name: 'Stripe v1' }
        const dispose = versionedHub.register(adapter, { version: '1.0' })

        dispose()

        expect(versionedHub.get('stripe', '1.0')).toBeUndefined()
      })

      it('removes the unversioned fallback when the first-registered version is disposed', () => {
        const v1: TestAdapter = { providerKey: 'stripe', name: 'Stripe v1' }
        const v2: TestAdapter = { providerKey: 'stripe', name: 'Stripe v2' }
        const disposeV1 = versionedHub.register(v1, { version: '1.0' })
        versionedHub.register(v2, { version: '2.0' })

        disposeV1()

        expect(versionedHub.get('stripe')).toBeUndefined()
        expect(versionedHub.get('stripe', '2.0')).toBe(v2)
      })

      it('does not remove the unversioned fallback when a non-first version is disposed', () => {
        const v1: TestAdapter = { providerKey: 'stripe', name: 'Stripe v1' }
        const v2: TestAdapter = { providerKey: 'stripe', name: 'Stripe v2' }
        versionedHub.register(v1, { version: '1.0' })
        const disposeV2 = versionedHub.register(v2, { version: '2.0' })

        disposeV2()

        expect(versionedHub.get('stripe')).toBe(v1)
        expect(versionedHub.get('stripe', '1.0')).toBe(v1)
      })
    })
  })

  describe('cross-call storage sharing (core invariant)', () => {
    it('two defineHub() calls with the same id share the same backing Map', () => {
      const sharedId = uniqueId('test-shared')
      const hub1 = defineHub<TestAdapter>({ id: sharedId })
      const hub2 = defineHub<TestAdapter>({ id: sharedId })

      const adapter: TestAdapter = { providerKey: 'stripe', name: 'Stripe' }
      hub1.register(adapter)

      expect(hub2.get('stripe')).toBe(adapter)
      expect(hub2.list()).toContain(adapter)

      hub1.clear()
    })

    it('register via hub1 and list via hub2 returns the same adapters', () => {
      const sharedId = uniqueId('test-shared-list')
      const hub1 = defineHub<TestAdapter>({ id: sharedId })
      const hub2 = defineHub<TestAdapter>({ id: sharedId })

      const stripe: TestAdapter = { providerKey: 'stripe', name: 'Stripe' }
      const paypal: TestAdapter = { providerKey: 'paypal', name: 'PayPal' }
      hub1.register(stripe)
      hub1.register(paypal)

      const listed = hub2.list()
      expect(listed).toHaveLength(2)
      expect(listed).toContain(stripe)
      expect(listed).toContain(paypal)

      hub1.clear()
    })

    it('clear via hub2 removes adapters visible from hub1', () => {
      const sharedId = uniqueId('test-shared-clear')
      const hub1 = defineHub<TestAdapter>({ id: sharedId })
      const hub2 = defineHub<TestAdapter>({ id: sharedId })

      hub1.register({ providerKey: 'stripe', name: 'Stripe' })
      hub2.clear()

      expect(hub1.list()).toEqual([])
      expect(hub1.get('stripe')).toBeUndefined()
    })
  })

  describe('list() deduplication on versioned hubs', () => {
    let versionedHub: Hub<TestAdapter>

    beforeEach(() => {
      versionedHub = defineHub<TestAdapter>({ id: uniqueId('test-dedup'), versioned: true })
    })

    afterEach(() => {
      versionedHub.clear()
    })

    it('returns only one entry when the same provider has two versions', () => {
      versionedHub.register({ providerKey: 'stripe', name: 'Stripe v1' }, { version: '1.0' })
      versionedHub.register({ providerKey: 'stripe', name: 'Stripe v2' }, { version: '2.0' })

      const listed = versionedHub.list()
      expect(listed).toHaveLength(1)
      expect(listed[0].providerKey).toBe('stripe')
    })

    it('returns both entries when two different providers are registered', () => {
      versionedHub.register({ providerKey: 'stripe', name: 'Stripe v1' }, { version: '1.0' })
      versionedHub.register({ providerKey: 'paypal', name: 'PayPal v1' }, { version: '1.0' })

      const listed = versionedHub.list()
      expect(listed).toHaveLength(2)
      expect(listed.map((adapter) => adapter.providerKey).sort()).toEqual(['paypal', 'stripe'])
    })

    it('returns the first-registered version as the list entry (fallback reference)', () => {
      const v1: TestAdapter = { providerKey: 'stripe', name: 'Stripe v1' }
      const v2: TestAdapter = { providerKey: 'stripe', name: 'Stripe v2' }
      versionedHub.register(v1, { version: '1.0' })
      versionedHub.register(v2, { version: '2.0' })

      const listed = versionedHub.list()
      expect(listed[0]).toBe(v1)
    })
  })

  describe('missing adapterKeyField throws', () => {
    it('throws when adapter is missing the key field entirely', () => {
      const badAdapter = { name: 'No Key' } as unknown as TestAdapter

      expect(() => hub.register(badAdapter)).toThrow(
        'Hub adapter is missing a valid "providerKey" string property'
      )
    })

    it('throws when adapter key field is a non-string type', () => {
      const badAdapter = { providerKey: 42, name: 'Numeric Key' } as unknown as TestAdapter

      expect(() => hub.register(badAdapter)).toThrow(
        'Hub adapter is missing a valid "providerKey" string property'
      )
    })

    it('throws when adapter key field is an empty string', () => {
      const badAdapter: TestAdapter = { providerKey: '', name: 'Empty Key' }

      expect(() => hub.register(badAdapter)).toThrow(
        'Hub adapter is missing a valid "providerKey" string property'
      )
    })

    it('includes the received type in the error message for non-string values', () => {
      const badAdapter = { providerKey: 123, name: 'Numeric' } as unknown as TestAdapter

      expect(() => hub.register(badAdapter)).toThrow('Received number')
    })

    it('includes "empty string" in the error message for empty values', () => {
      const badAdapter: TestAdapter = { providerKey: '', name: 'Empty' }

      expect(() => hub.register(badAdapter)).toThrow('Received empty string')
    })
  })

  describe('dev-mode duplicate warning', () => {
    const originalNodeEnv = process.env.NODE_ENV

    afterEach(() => {
      process.env.NODE_ENV = originalNodeEnv
    })

    it('logs debug message when registering a duplicate key in non-production mode', () => {
      process.env.NODE_ENV = 'development'
      const warnHub = defineHub<TestAdapter>({ id: uniqueId('test-warn') })
      const debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {})

      try {
        warnHub.register({ providerKey: 'stripe', name: 'Stripe 1' })
        warnHub.register({ providerKey: 'stripe', name: 'Stripe 2' })

        expect(debugSpy).toHaveBeenCalledTimes(1)
        expect(debugSpy).toHaveBeenCalledWith(
          expect.stringContaining('Duplicate registration for key "stripe"')
        )
      } finally {
        debugSpy.mockRestore()
        warnHub.clear()
      }
    })

    it('does not log debug message in production mode', () => {
      process.env.NODE_ENV = 'production'
      const prodHub = defineHub<TestAdapter>({ id: uniqueId('test-prod') })
      const debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {})

      try {
        prodHub.register({ providerKey: 'stripe', name: 'Stripe 1' })
        prodHub.register({ providerKey: 'stripe', name: 'Stripe 2' })

        expect(debugSpy).not.toHaveBeenCalled()
      } finally {
        debugSpy.mockRestore()
        prodHub.clear()
      }
    })

    it('includes the hub id in the debug message', () => {
      process.env.NODE_ENV = 'development'
      const hubId = uniqueId('test-warn-id')
      const warnHub = defineHub<TestAdapter>({ id: hubId })
      const debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {})

      try {
        warnHub.register({ providerKey: 'stripe', name: 'Stripe 1' })
        warnHub.register({ providerKey: 'stripe', name: 'Stripe 2' })

        expect(debugSpy).toHaveBeenCalledWith(expect.stringContaining(`Hub:${hubId}`))
      } finally {
        debugSpy.mockRestore()
        warnHub.clear()
      }
    })
  })

  describe('custom adapterKeyField', () => {
    let carrierHub: Hub<CarrierAdapter>

    beforeEach(() => {
      carrierHub = defineHub<CarrierAdapter>({
        id: uniqueId('test-carrier'),
        adapterKeyField: 'carrierId',
      })
    })

    afterEach(() => {
      carrierHub.clear()
    })

    it('uses the custom key field to register and retrieve adapters', () => {
      const dhl: CarrierAdapter = { carrierId: 'dhl', label: 'DHL Express' }
      carrierHub.register(dhl)

      expect(carrierHub.get('dhl')).toBe(dhl)
    })

    it('throws when adapter is missing the custom key field', () => {
      const badAdapter = { label: 'No Carrier ID' } as unknown as CarrierAdapter

      expect(() => carrierHub.register(badAdapter)).toThrow(
        'Hub adapter is missing a valid "carrierId" string property'
      )
    })

    it('lists adapters registered with custom key field', () => {
      const dhl: CarrierAdapter = { carrierId: 'dhl', label: 'DHL' }
      const fedex: CarrierAdapter = { carrierId: 'fedex', label: 'FedEx' }
      carrierHub.register(dhl)
      carrierHub.register(fedex)

      const listed = carrierHub.list()
      expect(listed).toHaveLength(2)
      expect(listed).toContain(dhl)
      expect(listed).toContain(fedex)
    })
  })
})
