export interface HubOptions {
  id: string
  adapterKeyField?: string
  versioned?: boolean
}

export interface Hub<T> {
  readonly id: string
  register(adapter: T, options?: { version?: string }): () => void
  get(key: string, version?: string): T | undefined
  list(): T[]
  clear(): void
}

function getBackingMap<T>(id: string): Map<string, T> {
  const symbol = Symbol.for(`@open-mercato/hub/${id}`)
  const global = globalThis as Record<symbol, Map<string, T>>
  if (!global[symbol]) {
    global[symbol] = new Map<string, T>()
  }
  return global[symbol]
}

function extractKey(adapter: object, field: string): string {
  const value = (adapter as Record<string, unknown>)[field]
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(
      `Hub adapter is missing a valid "${field}" string property. ` +
        `Received ${typeof value === 'string' ? 'empty string' : typeof value}.`
    )
  }
  return value
}

function compoundKey(key: string, version: string): string {
  return `${key}:${version}`
}

export function defineHub<T extends object>(options: HubOptions): Hub<T> {
  const { id, adapterKeyField = 'providerKey', versioned = false } = options
  const map = getBackingMap<T>(id)
  function warnDuplicate(mapKey: string): void {
    if (process.env.NODE_ENV !== 'production' && map.has(mapKey)) {
      console.warn(`[Hub:${id}] Duplicate registration for key "${mapKey}" — overwriting.`)
    }
  }

  function registerVersioned(adapter: T, key: string, version: string | undefined): () => void {
    if (key.includes(':')) {
      throw new Error(
        `Hub "${id}": adapter key "${key}" contains ":" which conflicts with versioned key format. ` +
          `Versioned hubs use "key:version" internally.`
      )
    }
    if (!version) {
      warnDuplicate(key)
      map.set(key, adapter)
      return () => {
        map.delete(key)
      }
    }

    const compound = compoundKey(key, version)
    warnDuplicate(compound)
    map.set(compound, adapter)

    const isFirstUnversioned = !map.has(key)
    if (isFirstUnversioned) {
      map.set(key, adapter)
    }

    return () => {
      map.delete(compound)
      if (isFirstUnversioned) {
        map.delete(key)
      }
    }
  }

  function registerSimple(adapter: T, key: string): () => void {
    warnDuplicate(key)
    map.set(key, adapter)
    return () => {
      map.delete(key)
    }
  }

  function listVersioned(): T[] {
    const results: T[] = []
    for (const [mapKey, adapter] of map) {
      if (!mapKey.includes(':')) {
        results.push(adapter)
      }
    }
    return results
  }

  function listSimple(): T[] {
    return Array.from(map.values())
  }

  return Object.freeze({
    id,

    register(adapter: T, registerOptions?: { version?: string }): () => void {
      const key = extractKey(adapter, adapterKeyField)
      if (versioned) {
        return registerVersioned(adapter, key, registerOptions?.version)
      }
      return registerSimple(adapter, key)
    },

    get(key: string, version?: string): T | undefined {
      if (versioned && version) {
        return map.get(compoundKey(key, version)) ?? map.get(key)
      }
      return map.get(key)
    },

    list(): T[] {
      return versioned ? listVersioned() : listSimple()
    },

    clear(): void {
      map.clear()
    },
  })
}
