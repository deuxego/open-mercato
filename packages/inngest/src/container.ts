import { asValue } from 'awilix'
import type { AwilixContainer } from 'awilix'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'

/**
 * Creates a tenant-scoped DI container for workflow execution.
 * Registers organizationId and tenantId as DI values so all services
 * (queryEngine, encryption, etc.) can scope by tenant.
 *
 * One container per Inngest invocation. Each callback is a separate HTTP request;
 * memoized steps return instantly without executing.
 */
export async function createScopedWorkflowContainer(
  organizationId: string,
  tenantId: string
): Promise<AwilixContainer> {
  const container = await createRequestContainer()
  container.register({
    organizationId: asValue(organizationId),
    tenantId: asValue(tenantId),
  })
  return container
}
