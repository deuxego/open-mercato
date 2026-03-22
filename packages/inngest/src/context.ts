import { AsyncLocalStorage } from 'node:async_hooks'
import type { AwilixContainer } from 'awilix'
import { assertJsonSerializable } from './guards.js'
import type { StepTools } from './types.js'

const stepScopeStorage = new AsyncLocalStorage<AwilixContainer>()

/**
 * Builds the DI-aware tools that are merged into the Inngest handler args.
 * Returns { run, resolve, emitToEventBus } — three functions, no class.
 */
export function buildDITools(step: StepTools, container: AwilixContainer) {
  let emitCounter = 0

  const resolve = (name: string): unknown => {
    const scope = stepScopeStorage.getStore()
    if (!scope) {
      throw new Error('resolve() called outside a run() step.')
    }
    return scope.resolve(name)
  }

  const run = async <T>(id: string, fn: () => Promise<T>) => {
    return step.run(id, async () => {
      return stepScopeStorage.run(container, async () => {
        const result = await fn()
        if (process.env.NODE_ENV === 'development') {
          assertJsonSerializable(result, id)
        }
        return result
      })
    })
  }

  const emitToEventBus = async (name: string, data: Record<string, unknown>): Promise<void> => {
    const stepId = `emit-${name}-${emitCounter++}`
    await run(stepId, async () => {
      const eventBus = resolve('eventBus') as { emit: (name: string, data: Record<string, unknown>) => Promise<void> }
      await eventBus.emit(name, data)
      return { _emitted: true }
    })
  }

  return { run, resolve, emitToEventBus }
}
