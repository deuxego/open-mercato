import { NonRetriableError } from 'inngest'
import { inngest } from './client.js'
import { createScopedWorkflowContainer } from './container.js'
import { buildDITools } from './context.js'
import type { WorkflowMeta, WorkflowHandler, CreateFnConfig } from './types.js'

/**
 * Wraps a workflow handler with tenant-scoped DI and Inngest defaults.
 * Uses the v4 two-argument createFunction signature (triggers inside options).
 */
export function wrapWorkflow(metadata: WorkflowMeta, handler: WorkflowHandler) {
  const { event: triggerEvent, ...config } = metadata

  return inngest.createFunction(
    {
      ...config,
      retries: config.retries ?? 3,
      concurrency: config.concurrency ?? [{
        limit: 1,
        key: 'event.data.organizationId',
      }],
      triggers: [{ event: triggerEvent ?? config.id }],
    } satisfies CreateFnConfig,
    async (inngestArgs) => {
      const { event, step } = inngestArgs
      const eventData = event.data as Record<string, unknown>
      const rawOrgId = eventData.organizationId
      const rawTenantId = eventData.tenantId
      const organizationId = typeof rawOrgId === 'string' ? rawOrgId : undefined
      const tenantId = typeof rawTenantId === 'string' ? rawTenantId : undefined

      if (!organizationId || !tenantId) {
        throw new NonRetriableError(
          `Workflow "${config.id}" requires organizationId and tenantId in event payload`
        )
      }

      const container = await createScopedWorkflowContainer(organizationId, tenantId)
      try {
        const { run, resolve, emitToEventBus } = buildDITools(step, container)
        return await handler(event.data as Record<string, unknown>, { ...inngestArgs, run, resolve, emitToEventBus })
      } finally {
        await container.dispose()
      }
    }
  )
}
