import type { WorkflowMeta, WorkflowHandler, BaseWorkflowPayload } from '@open-mercato/inngest'
import type { EntityManager } from '@mikro-orm/postgresql'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { Todo } from '../data/entities'

/**
 * Example workflow: Todo Follow-up
 *
 * When triggered, waits 1 minute then checks if the todo is still incomplete.
 * If so, logs a reminder. Demonstrates: durable sleep, DI-aware steps, typed payloads,
 * findOneWithDecryption with tenant scoping, Inngest's built-in logger.
 */

type TodoFollowupPayload = BaseWorkflowPayload & {
  id: string
}

export const metadata: WorkflowMeta = {
  id: 'example.todo-followup',
  concurrency: [{ limit: 5, key: 'event.data.organizationId' }],
}

const handler: WorkflowHandler<TodoFollowupPayload> = async (
  payload,
  { step, run, resolve, logger }
) => {
  // DI-aware step — resolve<T>() provides typed tenant-scoped services
  const todo = await run('check-todo-status', async () => {
    const em = resolve<EntityManager>('em')
    const result = await findOneWithDecryption(em, Todo, {
      id: payload.id,
      organizationId: payload.organizationId,
    })
    if (!result) return { found: false, isDone: false }
    return { found: true, isDone: result.isDone }
  })

  if (!todo.found || todo.isDone) return

  // Inngest's built-in logger — Pino-style, object-first
  await run('log-reminder', async () => {
    logger.info({ todoId: payload.id, organizationId: payload.organizationId }, 'Todo follow-up reminder')
    return { reminded: true }
  })
}

export default handler
