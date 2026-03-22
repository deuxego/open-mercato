---
name: inngest
description: Create and configure Inngest durable functions for Open Mercato. Covers WorkflowHandler<T>, typed payloads, DI-aware steps (run/resolve), triggers, cancellation, error handling, retries, logging, and observability. Uses the @open-mercato/inngest package wrapper.
---

# Inngest Durable Workflows — Open Mercato

Inngest is a **durable execution engine** — it persists the state of multi-step background jobs so they survive server restarts, network failures, and deploys. Unlike simple BullMQ workers (fire-and-forget), Inngest workflows can sleep for days, retry individual steps, fan out in parallel, and cancel on external events.

> **This skill is specific to Open Mercato.** It uses `@open-mercato/inngest` which wraps the Inngest SDK with typed payloads, DI-aware steps, and tenant scoping. For raw SDK docs, see [Inngest documentation](https://www.inngest.com/docs).
>
> **MUST rules and constraints** live in `packages/inngest/AGENTS.md` — read it first.

## When to Use Inngest vs Workers vs Subscribers

| Need | Use | Why |
|------|-----|-----|
| Fire-and-forget job (email, index) | Worker (`workers/*.ts`) | Simple, no state needed |
| React to event with quick side effect | Subscriber (`subscribers/*.ts`) | Immediate, in-process |
| Multi-step workflow with sleep/retry/cancel | **Inngest workflow** (`workflows/*.ts`) | Durable execution, step memoization |

## Setup & Prerequisites

Before creating workflows, ensure these are running:

1. **Docker services**: `docker compose up` — starts postgres, redis, AND Inngest server
2. **Dev server**: `yarn dev` — starts the Next.js app with `/api/inngest` serve route
3. **Dashboard**: Open **http://localhost:8288** to view workflow runs, step states, and logs

The Inngest module is enabled by default in `modules.ts`. The `/api/inngest` serve route is auto-configured via `apps/mercato/src/app/api/inngest/route.ts`.

**Environment variables** (set automatically by `.env.example` and docker-compose):
- `INNGEST_BASE_URL` — server-side SDK connection (internal Docker hostname)
- `NEXT_PUBLIC_INNGEST_BASE_URL` — browser-facing dashboard link (localhost)
- `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` — authentication (dev defaults provided)

## Creating a Workflow — Step by Step

### 1. Create the workflow file

```
apps/mercato/src/modules/<module>/workflows/<name>.ts
```

```typescript
import type { WorkflowMeta, WorkflowHandler, BaseWorkflowPayload } from '@open-mercato/inngest'
import type { EntityManager } from '@mikro-orm/postgresql'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { MyEntity } from '../data/entities'

// Typed payload — extends BaseWorkflowPayload (enforces organizationId + tenantId)
type MyPayload = BaseWorkflowPayload & {
  recordId: string
}

// Metadata — any Inngest createFunction option works (retries, concurrency, cancelOn, etc.)
export const metadata: WorkflowMeta = {
  id: 'module.entity-action',  // dots between segments, hyphens within action
  concurrency: [{ limit: 5, key: 'event.data.organizationId' }],
}

// Typed handler — payload fields are typed, resolve<T>() gives typed DI services
const handler: WorkflowHandler<MyPayload> = async (payload, { step, run, resolve, logger }) => {
  // Inngest SDK — durable sleep
  await step.sleep('wait-period', '3d')

  // DI-aware step — resolve<T>() works inside run()
  const record = await run('check-status', async () => {
    const em = resolve<EntityManager>('em')
    const result = await findOneWithDecryption(em, MyEntity, {
      id: payload.recordId,
      organizationId: payload.organizationId,
    })
    // MUST return JSON-serializable plain object, not MikroORM entity
    return { found: Boolean(result), status: result?.status ?? 'unknown' }
  })

  if (!record.found) return

  // Inngest's built-in logger — Pino-style, object-first. Log inside steps to avoid duplicates on replay.
  await run('notify', async () => {
    logger.info({ recordId: payload.recordId }, 'Workflow completed')
    return { notified: true }
  })
}

export default handler
```

### 2. Register in the convention file

```typescript
// apps/mercato/src/modules/<module>/inngest.workflows.ts
import * as myWorkflow from './workflows/my-workflow'

export const workflows = [myWorkflow]
export default workflows  // REQUIRED — Turbopack needs default for import *
```

### 3. Run the generator

```bash
yarn generate
```

### 4. Trigger the workflow

From a subscriber (most common pattern):

```typescript
// apps/mercato/src/modules/<module>/subscribers/on-entity-created-trigger-workflow.ts
import type { Inngest } from '@open-mercato/inngest'

export const metadata = {
  event: 'module.entity.created',
  persistent: true,
  id: 'module.entity.trigger-workflow',
}

// Dedup guard — persistent subscribers fire both in-memory and via BullMQ worker.
const recentlySent = new Set<string>()

export default async function handler(
  payload: Record<string, unknown>,
  ctx: { resolve: (name: string) => unknown; eventName?: string }
) {
  const recordId = payload.id as string | undefined
  if (!recordId) return

  // Prevent double-fire from persistent subscriber dual dispatch
  if (recentlySent.has(recordId)) {
    recentlySent.delete(recordId)
    return
  }
  recentlySent.add(recordId)
  setTimeout(() => recentlySent.delete(recordId), 10_000)

  let inngest: Inngest
  try { inngest = ctx.resolve('inngestClient') as Inngest } catch { return }

  try {
    await inngest.send({
      name: 'module.entity-action',  // = workflow ID
      data: payload,                 // forward full event payload (includes org/tenant)
      id: `workflow-${recordId}`,    // idempotency key — 24h dedup window
    })
  } catch (e) {
    console.error('[inngest] Failed to trigger workflow:', e)
  }
}
```

Or from any code with DI access:

```typescript
const inngest = ctx.resolve('inngestClient') as Inngest
await inngest.send({
  name: 'module.entity-action',
  data: { id: recordId, organizationId, tenantId },
  id: `workflow-${recordId}`,
})
```

### 5. Verify in the dashboard

Open **http://localhost:8288/functions** — your workflow should appear. Trigger it and watch the run in **http://localhost:8288/runs**.

## Naming Convention

| Context | Pattern | Example |
|---------|---------|---------|
| Mercato domain event | `module.entity.action` (dots only) | `orders.invoice.created` |
| Inngest workflow ID | `module.entity-action` (hyphens in action) | `orders.invoice-followup` |

Dots separate segments. Hyphens within the action segment distinguish workflow IDs from domain events.

## `run()` vs `step.run()` vs `step.*`

| Need | Use | Why |
|------|-----|-----|
| DI services (em, queryEngine) | `run()` | Sets up AsyncLocalStorage so `resolve<T>()` works |
| Pure Inngest (sleep, waitForEvent) | `step.*` | No DI needed, direct SDK access |
| Network call without DI | `step.run()` | Lighter, no DI overhead |
| Emit to Mercato event bus | `emitToEventBus()` | Wraps `run()` internally |
| Trigger another workflow | `step.sendEvent()` (loose) or `step.invoke()` (typed) | Saga coordination |

## Key Differences from Raw Inngest SDK

| Raw Inngest SDK | Open Mercato (`@open-mercato/inngest`) |
|-----------------|---------------------------------------|
| `inngest.createFunction(config, handler)` | Export `metadata` + `default handler` — `wrapWorkflow` is called by the framework |
| `async ({ event, step }) => {}` | `async (payload, { step, run, resolve, logger, ... }) => {}` |
| `step.run('id', fn)` | `run('id', fn)` — wraps with DI context |
| Untyped `event.data` | `WorkflowHandler<MyPayload>` — fully typed payload |
| Manual DI setup | `resolve<T>('serviceName')` — tenant-scoped |
| No tenant enforcement | `BaseWorkflowPayload` enforces `organizationId` + `tenantId` |

## Error Handling

```typescript
import { NonRetriableError, RetryAfterError } from '@open-mercato/inngest'

const handler: WorkflowHandler<MyPayload> = async (payload, { run, resolve }) => {
  await run('validate', async () => {
    const em = resolve<EntityManager>('em')
    const record = await findOneWithDecryption(em, MyEntity, { id: payload.id })
    if (!record) {
      // Permanent failure — stops retrying immediately
      throw new NonRetriableError('Record not found')
    }
    return { valid: true }
  })

  await run('call-api', async () => {
    const response = await fetch('https://api.example.com/process')
    if (response.status === 429) {
      // Rate limited — retry after specific delay
      throw new RetryAfterError('Rate limited', '30s')
    }
    return { processed: true }
  })
}
```

## Cancellation

```typescript
export const metadata: WorkflowMeta = {
  id: 'orders.invoice-followup',
  cancelOn: [{
    event: 'orders.invoice.paid',
    match: 'data.invoiceId',
  }],
}
```

## Idempotency

**Event-level (producer):** Add `id` to `inngest.send()` — 24h dedup window:
```typescript
await inngest.send({ name: 'orders.invoice-followup', data, id: `followup-${invoiceId}` })
```

**Function-level (consumer):** Add `idempotency` to metadata:
```typescript
export const metadata: WorkflowMeta = {
  id: 'orders.checkout-process',
  idempotency: 'event.data.cartId',  // One run per cartId per 24h
}
```

## Function Limits (as of Inngest v4)

- **Max 1,000 steps** per function run
- **Max 4MB** per step return value
- **Max 32MB** combined run state
- **Max 2 entries** in concurrency array
- Each step = separate HTTP request (~50-100ms overhead)
- Checkpointing enabled globally with `maxRuntime: '50s'` (configurable in `packages/inngest/src/client.ts`)

## What's Available in WorkflowTools

| Source | Members |
|--------|---------|
| Inngest SDK (inferred, evolves with SDK) | `step`, `event`, `runId`, `logger`, `attempt` + future additions |
| DI additions | `run`, `resolve`, `emitToEventBus` |

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Using `step.run()` then calling `resolve()` | Use `run()` — only `run()` sets up DI context |
| Returning MikroORM entity from `run()` | Return plain object `{ id, status }` or use `wrap(entity).toObject()` |
| Non-deterministic code outside steps | Put `Date.now()`, `Math.random()` inside steps |
| Missing `organizationId`/`tenantId` in payload | Extend `BaseWorkflowPayload` — enforces both |
| Changing workflow `id` after deploy | IDs are permanent — renaming creates a new function, orphans old runs |
| `step.invoke()` with string ID | Use `referenceFunction({ functionId })` in v4 |
| Missing `default` export in convention file | Add `export default workflows` |
| Logging outside steps | Log inside `run()` or `step.run()` — avoids duplicates on replay |
| Renaming step IDs after deployment | Keep step IDs permanent — renaming forces re-execution of memoized steps |
| Persistent subscriber triggers workflow twice | Add dedup guard with `Set` — persistent subscribers fire both in-memory and via BullMQ |
| `inngest.send()` without org/tenant in data | Always include `organizationId` + `tenantId` — `NonRetriableError` if missing |

## Reference Materials

- [Step Execution Patterns](references/step-execution.md) *(raw SDK patterns — for background context)*
- [Error Handling Strategies](references/error-handling.md) *(raw SDK patterns)*
- [Observability & Monitoring](references/observability.md) *(raw SDK patterns)*
- [Checkpointing & Performance](references/checkpointing.md) *(raw SDK patterns)*
- Package guide: `packages/inngest/AGENTS.md`
- Spec: `.ai/specs/SPEC-069-2026-03-21-inngest-integration.md`
- Working example: `apps/mercato/src/modules/example/workflows/todo-followup.ts`
