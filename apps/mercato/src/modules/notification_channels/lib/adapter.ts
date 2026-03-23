import type { AdapterContext } from '@open-mercato/shared/lib/hub'

export interface NotificationChannelAdapter {
  readonly providerKey: string
  readonly channelType: 'email' | 'sms' | 'push' | 'webhook'
  send(input: SendNotificationInput, ctx?: AdapterContext): Promise<SendNotificationResult>
}

export interface SendNotificationInput {
  to: string
  subject?: string
  body: string
  credentials: Record<string, unknown>
}

export interface SendNotificationResult {
  ok: boolean
  externalId?: string
  error?: string
}
