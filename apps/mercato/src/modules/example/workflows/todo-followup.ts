import type { WorkflowMeta, WorkflowTools } from '@open-mercato/inngest'
import { QueryEngine } from '@open-mercato/shared/lib/query/types.ts'

/**
 * Example workflow: Todo Follow-up
 *
 * When triggered, waits 1 minute then checks if the todo is still incomplete.
 * If so, logs a reminder. Demonstrates: sleep, DI-aware steps, tenant scoping.
 */
export const metadata: WorkflowMeta = {
  id: 'example.todo-followup',
  concurrency: [{ limit: 5, key: 'event.data.organizationId' }],
}

export default async function handler(
  payload: Record<string, unknown>,
  { step, run, resolve }: WorkflowTools
) {
  const todoId = payload.todoId as string
  const organizationId = payload.organizationId as string

  // Durable sleep — Inngest suspends execution, resumes after duration
  await step.sleep('wait-before-check', '1m')

  // DI-aware step — resolve() provides tenant-scoped services
  // Use findWithDecryption (not raw em.find) per project conventions
  const todo = await run('check-todo-status', async () => {
    const queryEngine = resolve('queryEngine') as QueryEngine
    const { items } = await queryEngine.query('example_todos', {
      filters: { id: todoId, },
      organizationId,
    })
    const found = items.length > 0
    const completed = found && Boolean(items[0].is_completed)
    return { found, completed }
  })

  if (!todo.found || todo.completed) return

  // Another DI step — log reminder
  await run('log-reminder', async () => {
    const logger = resolve('logger') as { info: (msg: string, meta?: Record<string, unknown>) => void }
    logger.info('Todo follow-up reminder', { todoId, organizationId })
    return { reminded: true }
  })
}
