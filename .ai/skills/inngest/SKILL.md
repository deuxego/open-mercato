---
name: inngest
description: Create and configure Inngest durable functions for Open Mercato. Covers WorkflowHandler<T>, typed payloads, DI-aware steps (run/resolve), triggers, cancellation, error handling, retries, logging, and observability. Uses the @open-mercato/inngest package wrapper.
---

# Inngest Durable Workflows — Open Mercato

Create fault-tolerant, long-running workflows using Inngest v4 with Open Mercato's tenant-scoped DI integration.

> **This skill is specific to Open Mercato.** It uses `@open-mercato/inngest` which wraps the Inngest SDK with typed payloads, DI-aware steps, and tenant scoping. For raw SDK docs, see [Inngest documentation](https://www.inngest.com/docs).

## Open Mercato Workflow Structure

### File Layout

```
modules/<module>/
├── workflows/
│   └── my-workflow.ts          # metadata + typed handler
└── inngest.workflows.ts        # convention file (FROZEN name)
```

### Convention File (MUST rules)

```typescript
// modules/<module>/inngest.workflows.ts
import * as myWorkflow from './workflows/my-workflow'

export const workflows = [myWorkflow]
export default workflows  // REQUIRED — Turbopack needs default for import *
```

- File name `inngest.workflows.ts` is **FROZEN** — never rename
- MUST export both `workflows` (named) and `default`
- Run `yarn generate` after creating a new convention file

### Workflow File Pattern

```typescript
import type { WorkflowMeta, WorkflowHandler, BaseWorkflowPayload } from '@open-mercato/inngest'
import type { EntityManager } from '@mikro-orm/postgresql'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { MyEntity } from '../data/entities'

// 1. Typed payload — extends BaseWorkflowPayload (enforces organizationId + tenantId)
type MyPayload = BaseWorkflowPayload & {
  recordId: string
}

// 2. Metadata — any Inngest createFunction option works
export const metadata: WorkflowMeta = {
  id: 'module.entity-action',     // MUST contain hyphens
  concurrency: [{ limit: 5, key: 'event.data.organizationId' }],
  cancelOn: [{ event: 'module.entity.cancelled', match: 'data.recordId' }],
}

// 3. Typed handler — payload fully typed, no `as` casts needed
const handler: WorkflowHandler<MyPayload> = async (payload, { step, run, resolve, logger }) => {
  // Inngest SDK methods — via step.*
  await step.sleep('wait-period', '3d')

  // DI-aware step — resolve<T>() gives typed tenant-scoped services
  const record = await run('check-status', async () => {
    const em = resolve<EntityManager>('em')
    const result = await findOneWithDecryption(em, MyEntity, {
      id: payload.recordId,
      organizationId: payload.organizationId,
    })
    return { found: Boolean(result), status: result?.status ?? 'unknown' }
  })

  if (!record.found) return

  // Inngest's built-in logger — Pino-style, object-first
  await run('log-action', async () => {
    logger.info({ recordId: payload.recordId }, 'Workflow action completed')
    return { logged: true }
  })
}

export default handler
```

## Key Differences from Raw Inngest SDK

| Raw Inngest SDK | Open Mercato (`@open-mercato/inngest`) |
|-----------------|---------------------------------------|
| `inngest.createFunction(config, handler)` | `wrapWorkflow(metadata, handler)` — auto-adds tenant DI + defaults |
| `async ({ event, step }) => {}` | `async (payload, { step, run, resolve, logger, ... }) => {}` — flat tools object |
| `step.run('id', fn)` | `run('id', fn)` — wraps `step.run()` with DI context (resolve works inside) |
| Untyped `event.data` | `WorkflowHandler<MyPayload>` — fully typed payload |
| Manual DI setup | `resolve<T>('serviceName')` — tenant-scoped DI from container |
| No tenant enforcement | `BaseWorkflowPayload` enforces `organizationId` + `tenantId` |
| `{ event: 'name' }` trigger in config | `event` field on `WorkflowMeta` OR defaults to `metadata.id` |

## When to Use `run()` vs `step.run()`

| Need | Use | Why |
|------|-----|-----|
| DI services (em, queryEngine, etc.) | `run()` | Sets up AsyncLocalStorage so `resolve()` works |
| Pure Inngest (sleep, waitForEvent) | `step.*` | No DI needed, direct SDK access |
| Network call without DI | `step.run()` | Lighter, no DI overhead |
| Emit to Mercato event bus | `emitToEventBus()` | Wraps `run()` internally |

## Triggering Workflows

```typescript
// From subscribers, API routes, workers — resolve client from DI
const inngest = resolve<Inngest>('inngestClient')
await inngest.send({
  name: 'module.entity-action',     // = workflow ID
  data: { id: recordId, organizationId, tenantId },
  id: `unique-dedup-key-${recordId}`, // Idempotency — 24h dedup window
})
```

### Subscriber Pattern (common)

```typescript
import type { Inngest } from '@open-mercato/inngest'

export const metadata = {
  event: 'module.entity.created',
  persistent: true,
  id: 'module.entity.trigger-workflow',
}

export default async function handler(
  payload: Record<string, unknown>,
  ctx: { resolve: (name: string) => unknown }
) {
  let inngest: Inngest
  try { inngest = ctx.resolve('inngestClient') as Inngest } catch { return }

  try {
    await inngest.send({
      name: 'module.entity-action',
      data: payload,
      id: `workflow-${payload.id}`,  // Dedup key
    })
  } catch (e) {
    console.error('[inngest] Failed to trigger workflow:', e)
  }
}
```

## Core Concepts

### Durable Execution Model

- Each `run()` / `step.run()` encapsulates side-effects
- Memoization prevents re-execution of completed steps
- State persists across infrastructure failures
- Automatic retries with configurable count

### Step Execution Rules

```typescript
// ❌ BAD: Non-deterministic logic outside steps
const handler: WorkflowHandler<MyPayload> = async (payload, { step, run }) => {
  const timestamp = Date.now() // Runs multiple times on replay!
  await run('process', async () => processData(payload, timestamp))
}

// ✅ GOOD: All non-deterministic logic inside steps
const handler: WorkflowHandler<MyPayload> = async (payload, { step, run }) => {
  await run('process', async () => {
    const timestamp = Date.now() // Only runs once, memoized
    return processData(payload, timestamp)
  })
}
```

### Step Return Values MUST Be JSON-Serializable

```typescript
// ❌ BAD: Returning MikroORM entity (has methods, circular refs)
await run('fetch', async () => {
  const em = resolve<EntityManager>('em')
  return await findOneWithDecryption(em, MyEntity, { id: payload.id })
})

// ✅ GOOD: Return plain object
await run('fetch', async () => {
  const em = resolve<EntityManager>('em')
  const entity = await findOneWithDecryption(em, MyEntity, { id: payload.id })
  return { id: entity?.id, status: entity?.status }
})
```

## Function Limits

- **Max 1,000 steps** per function run
- **Max 4MB** per step return value
- **Max 32MB** combined run state
- Each step = separate HTTP request (~50-100ms overhead)
- **Concurrency array max 2 entries** (Inngest SDK limit)

## Cancellation

```typescript
export const metadata: WorkflowMeta = {
  id: 'orders.invoice-followup',
  cancelOn: [{
    event: 'orders.invoice.paid',
    match: 'data.invoiceId',  // Cancel when paid event has same invoiceId
  }],
}
```

## Error Handling

```typescript
import { NonRetriableError, RetryAfterError } from '@open-mercato/inngest'

const handler: WorkflowHandler<MyPayload> = async (payload, { run, resolve }) => {
  await run('validate', async () => {
    const em = resolve<EntityManager>('em')
    const record = await findOneWithDecryption(em, MyEntity, { id: payload.id })
    if (!record) {
      throw new NonRetriableError('Record not found — stopping workflow')
    }
    return { valid: true }
  })
}
```

## Idempotency

### Event-Level (Producer)

```typescript
await inngest.send({
  id: `checkout-${cartId}`,  // 24-hour dedup window
  name: 'orders.checkout-process',
  data: { cartId, organizationId, tenantId },
})
```

### Function-Level (Consumer)

```typescript
export const metadata: WorkflowMeta = {
  id: 'orders.checkout-process',
  idempotency: 'event.data.cartId',  // One run per cartId per 24h
}
```

## Logging

Use Inngest's built-in logger (Pino-style, object-first):

```typescript
const handler: WorkflowHandler<MyPayload> = async (payload, { run, logger }) => {
  // ✅ Log inside steps to avoid duplicates on replay
  await run('process', async () => {
    logger.info({ recordId: payload.id }, 'Processing started')
    return { processed: true }
  })
}
```

## What's Available in WorkflowTools

| Source | Members |
|--------|---------|
| Inngest SDK (inferred) | `step`, `event`, `runId`, `logger`, `attempt` + future SDK additions |
| DI additions | `run`, `resolve`, `emitToEventBus` |

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Using `step.run()` then calling `resolve()` | Use `run()` — only `run()` sets up DI context |
| Returning MikroORM entity from `run()` | Return plain object — `{ id, status }` not the entity |
| Non-deterministic code outside steps | Put `Date.now()`, `Math.random()` inside steps |
| Missing `organizationId`/`tenantId` | Extend `BaseWorkflowPayload` — enforces both |
| Changing workflow `id` after deploy | IDs are permanent — creates a new function, orphans old runs |
| `step.invoke()` with string ID | Use `referenceFunction({ functionId })` in v4 |
| Missing `default` export in convention file | Add `export default workflows` |
| Logging outside steps | Log inside `run()` or `step.run()` to avoid duplicates on replay |

## Reference Materials

- [Step Execution Patterns](references/step-execution.md)
- [Error Handling Strategies](references/error-handling.md)
- [Observability & Monitoring](references/observability.md)
- [Checkpointing & Performance](references/checkpointing.md)
- Package guide: `packages/inngest/AGENTS.md`
- Spec: `.ai/specs/SPEC-069-2026-03-21-inngest-integration.md`
