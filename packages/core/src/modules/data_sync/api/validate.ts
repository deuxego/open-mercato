import { NextResponse } from 'next/server'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { AdapterContext } from '@open-mercato/shared/lib/hub'
import { getIntegration } from '@open-mercato/shared/modules/integrations/types'
import type { CredentialsService } from '../../integrations/lib/credentials-service'
import { validateConnectionSchema } from '../data/validators'
import { dataSyncHub } from '../lib/adapter-registry'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['data_sync.configure'] },
}

export const openApi = {
  tags: ['DataSync'],
  summary: 'Validate sync connection',
}

export async function POST(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth?.tenantId || !auth.orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const parsed = validateConnectionSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 422 })
  }

  const integration = getIntegration(parsed.data.integrationId)
  if (!integration?.providerKey) {
    return NextResponse.json({ ok: false, message: 'Integration or providerKey not found' }, { status: 404 })
  }

  const adapter = dataSyncHub.get(integration.providerKey)
  if (!adapter) {
    return NextResponse.json({ ok: false, message: 'No registered sync adapter for provider' }, { status: 404 })
  }

  const container = await createRequestContainer()
  const credentialsService = container.resolve('integrationCredentialsService') as CredentialsService
  const credentials = await credentialsService.resolve(integration.id, {
    organizationId: auth.orgId as string,
    tenantId: auth.tenantId,
  })

  if (!credentials) {
    return NextResponse.json({ ok: false, message: 'Missing credentials' }, { status: 422 })
  }

  const ctx: AdapterContext = {
    resolve: <T = unknown>(name: string) => container.resolve(name) as T,
    logger: {
      info: (msg, data) => console.log(`[data-sync:validate] ${msg}`, data ? JSON.stringify(data) : ''),
      warn: (msg, data) => console.warn(`[data-sync:validate] ${msg}`, data ? JSON.stringify(data) : ''),
      error: (msg, data) => console.error(`[data-sync:validate] ${msg}`, data ? JSON.stringify(data) : ''),
      debug: (msg, data) => { if (process.env.NODE_ENV !== 'production') console.debug(`[data-sync:validate] ${msg}`, data ? JSON.stringify(data) : '') },
    },
    scope: { organizationId: auth.orgId as string, tenantId: auth.tenantId },
  }

  const mapping = await adapter.getMapping({
    entityType: parsed.data.entityType,
    scope: {
      organizationId: auth.orgId as string,
      tenantId: auth.tenantId,
    },
  }, ctx)

  if (!adapter.validateConnection) {
    return NextResponse.json({ ok: true, message: 'Adapter does not implement active connection validation' })
  }

  const result = await adapter.validateConnection({
    entityType: parsed.data.entityType,
    credentials,
    mapping,
    scope: {
      organizationId: auth.orgId as string,
      tenantId: auth.tenantId,
    },
  }, ctx)

  return NextResponse.json(result, { status: result.ok ? 200 : 422 })
}
