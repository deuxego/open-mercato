import { defineHub } from '@open-mercato/shared/lib/hub'
import type { DataSyncAdapter } from './adapter'

export const dataSyncHub = defineHub<DataSyncAdapter>({
  id: 'data_sync',
  adapterKeyField: 'providerKey',
})
