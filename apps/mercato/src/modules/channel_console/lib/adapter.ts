import type { NotificationChannelAdapter, SendNotificationInput, SendNotificationResult } from '../../notification_channels/lib/adapter'

export class ConsoleChannelAdapter implements NotificationChannelAdapter {
  readonly providerKey = 'console'
  readonly channelType = 'webhook' as const

  async send(input: SendNotificationInput): Promise<SendNotificationResult> {
    console.log(`[ConsoleChannel] Sending to ${input.to}: ${input.body}`)
    return { ok: true, externalId: `console-${Date.now()}` }
  }
}
