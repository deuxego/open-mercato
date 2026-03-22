import { defineHub } from '@open-mercato/shared/lib/hub'
import type { DataSyncAdapter } from './adapter'

export const dataSyncHub = defineHub<DataSyncAdapter>({
  id: 'data_sync',
  adapterKeyField: 'providerKey',
})

/** @deprecated Use dataSyncHub.register() */
export function registerDataSyncAdapter(adapter: DataSyncAdapter): () => void {
  return dataSyncHub.register(adapter)
}

/** @deprecated Use dataSyncHub.get() */
export function getDataSyncAdapter(providerKey: string): DataSyncAdapter | undefined {
  return dataSyncHub.get(providerKey)
}

/** @deprecated Use dataSyncHub.list() */
export function getAllDataSyncAdapters(): DataSyncAdapter[] {
  return dataSyncHub.list()
}
