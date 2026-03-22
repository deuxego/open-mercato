import { z } from 'zod'
import { getAuthFromCookies } from '@open-mercato/shared/lib/auth/server'
import type { OpenApiMethodDoc, OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { notificationChannelHub } from '../../lib/adapter-registry'

export const metadata = {
  path: '/notification-channels/channels',
  GET: { requireAuth: true },
}

const channelSchema = z.object({
  providerKey: z.string(),
  channelType: z.enum(['email', 'sms', 'push', 'webhook']),
})

const responseSchema = z.object({
  channels: z.array(channelSchema),
})

async function GET() {
  try {
    const auth = await getAuthFromCookies()
    if (!auth?.orgId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      })
    }

    const channels = notificationChannelHub.list().map((adapter) => ({
      providerKey: adapter.providerKey,
      channelType: adapter.channelType,
    }))

    return new Response(JSON.stringify({ channels }), {
      headers: { 'content-type': 'application/json' },
    })
  } catch {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  }
}

const getDoc: OpenApiMethodDoc = {
  summary: 'List available notification channels',
  description: 'Returns all registered notification channel adapters with their provider key and channel type.',
  tags: ['Notification Channels'],
  responses: [
    { status: 200, description: 'Available notification channels', schema: responseSchema },
  ],
  errors: [
    { status: 401, description: 'Authentication required', schema: z.object({ error: z.string() }) },
    { status: 500, description: 'Unexpected server error', schema: z.object({ error: z.string() }) },
  ],
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Notification Channels',
  summary: 'Notification channel registry',
  methods: {
    GET: getDoc,
  },
}

export default GET
