/**
 * Example Response Enrichers
 *
 * Demonstrates how a module can enrich its own API responses.
 * This enricher adds summary stats to todo records.
 */

import type { ResponseEnricher } from '@open-mercato/shared/lib/crud/response-enricher'
import { ExampleCustomerPriority, Todo } from './entities'

type TodoRecord = Record<string, unknown> & { id: string }

type TodoEnrichment = {
  _example: {
    totalTodos: number
    openTodoCount: number
    priorityRecordCount: number
  }
}

const todoStatsEnricher: ResponseEnricher<TodoRecord, TodoEnrichment> = {
  id: 'example.todo-stats',
  targetEntity: 'example.todo',
  priority: 10,
  timeout: 2000,
  fallback: {
    _example: { totalTodos: 0, openTodoCount: 0, priorityRecordCount: 0 },
  },

  async enrichOne(record, context) {
    const em = (context.em as any).fork()
    const todos = await em.find(Todo, {
      organizationId: context.organizationId,
      tenantId: context.tenantId,
      deletedAt: null,
    })
    const openCount = todos.filter((t: Todo) => !t.isDone).length
    const priorityCount = await em.count(ExampleCustomerPriority, {
      organizationId: context.organizationId,
      tenantId: context.tenantId,
      deletedAt: null,
    })

    return {
      ...record,
      _example: {
        totalTodos: todos.length,
        openTodoCount: openCount,
        priorityRecordCount: priorityCount,
      },
    }
  },

  async enrichMany(records, context) {
    const em = (context.em as any).fork()
    const todos = await em.find(Todo, {
      organizationId: context.organizationId,
      tenantId: context.tenantId,
      deletedAt: null,
    })
    const openCount = todos.filter((t: Todo) => !t.isDone).length
    const priorityCount = await em.count(ExampleCustomerPriority, {
      organizationId: context.organizationId,
      tenantId: context.tenantId,
      deletedAt: null,
    })

    return records.map((record) => ({
      ...record,
      _example: {
        totalTodos: todos.length,
        openTodoCount: openCount,
        priorityRecordCount: priorityCount,
      },
    }))
  },
}

export const enrichers: ResponseEnricher[] = [todoStatsEnricher]
