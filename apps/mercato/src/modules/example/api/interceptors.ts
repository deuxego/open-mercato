import type { ApiInterceptor } from '@open-mercato/shared/lib/crud/api-interceptor'
import { ExampleCustomerPriority } from '../data/entities'

type UnknownRecord = Record<string, unknown>

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

export const interceptors: ApiInterceptor[] = [
  {
    id: 'example.block-test-todos',
    targetRoute: 'example/todos',
    methods: ['POST', 'PUT'],
    priority: 100,
    async before(request) {
      const title = request.body?.title
      if (typeof title === 'string' && title.includes('BLOCKED')) {
        return {
          ok: false,
          statusCode: 422,
          message: 'Todo titles containing "BLOCKED" are blocked by interceptor.',
        }
      }
      return { ok: true }
    },
  },
  {
    id: 'example.todos-probe-timeout',
    targetRoute: 'example/todos',
    methods: ['GET'],
    priority: 90,
    timeoutMs: 100,
    async before(request) {
      const probe = readString(request.query?.interceptorProbe)
      if (probe !== 'timeout') return { ok: true }
      await new Promise((resolve) => setTimeout(resolve, 200))
      return { ok: true }
    },
  },
  {
    id: 'example.todos-probe-crash',
    targetRoute: 'example/todos',
    methods: ['GET'],
    priority: 89,
    async before(request) {
      const probe = readString(request.query?.interceptorProbe)
      if (probe !== 'crash') return { ok: true }
      throw new Error('Interceptor crash probe')
    },
  },
  {
    id: 'example.todos-probe-bad-query',
    targetRoute: 'example/todos',
    methods: ['GET'],
    priority: 88,
    async before(request) {
      const probe = readString(request.query?.interceptorProbe)
      if (probe !== 'bad-query') return { ok: true }
      return {
        ok: true,
        query: {
          ...(request.query ?? {}),
          interceptorProbe: undefined,
          page: 'not-a-number',
        },
      }
    },
  },
  {
    id: 'example.wildcard-probe',
    targetRoute: 'example/*',
    methods: ['GET'],
    priority: 60,
    async before(request) {
      const probe = readString(request.query?.interceptorProbe)
      if (probe !== 'wildcard') return { ok: true }
      return {
        ok: true,
        metadata: { wildcardProbe: true },
      }
    },
    async after(_request, response, context) {
      if (!context.metadata?.wildcardProbe) return {}
      return {
        merge: {
          _example: {
            ...((response.body._example as Record<string, unknown> | undefined) ?? {}),
            wildcardProbe: true,
          },
        },
      }
    },
  },
  {
    id: 'example.todos-response-meta',
    targetRoute: 'example/todos',
    methods: ['GET'],
    priority: 10,
    async before() {
      return {
        ok: true,
        metadata: { startedAt: Date.now() },
      }
    },
    async after(_request, response, context) {
      return {
        merge: {
          _example: {
            ...((response.body._example as Record<string, unknown> | undefined) ?? {}),
            interceptor: {
              processedAt: new Date().toISOString(),
              processingTimeMs: Math.max(0, Date.now() - Number(context.metadata?.startedAt ?? Date.now())),
            },
          },
        },
      }
    },
  },
]
