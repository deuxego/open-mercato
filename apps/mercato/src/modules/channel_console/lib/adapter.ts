import type { AdapterContext } from '@open-mercato/shared/lib/hub'
import type { NotificationChannelAdapter, SendNotificationInput, SendNotificationResult } from '../../notification_channels/lib/adapter'

export class ConsoleChannelAdapter implements NotificationChannelAdapter {
  readonly providerKey = 'console'
  readonly channelType = 'webhook' as const

  async send(input: SendNotificationInput, ctx?: AdapterContext): Promise<SendNotificationResult> {
    const message = `[ConsoleChannel] Sending to ${input.to}: ${input.body}`
    if (ctx) {
      ctx.logger.info(message)
    } else {
      console.log(message)
    }
    return { ok: true, externalId: `console-${Date.now()}` }
  }
}
