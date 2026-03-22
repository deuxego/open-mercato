import { defineHub } from '@open-mercato/shared/lib/hub'
import type { NotificationChannelAdapter } from './adapter'

export const notificationChannelHub = defineHub<NotificationChannelAdapter>({
  id: 'notification_channels',
  adapterKeyField: 'providerKey',
})
