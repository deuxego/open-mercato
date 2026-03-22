import type { IntegrationDefinition } from '@open-mercato/shared/modules/integrations/types'
import { ConsoleChannelAdapter } from './lib/adapter'

export const integration: IntegrationDefinition = {
  id: 'channel_console',
  title: 'Console Logger',
  description: 'Logs notifications to console (development/testing)',
  category: 'communication',
  hub: 'notification_channels',
  providerKey: 'console',
  tags: ['dev', 'testing'],
}

export const adapter = new ConsoleChannelAdapter()
