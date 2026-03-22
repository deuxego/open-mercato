# Inngest Package — Agent Guidelines

Optional Inngest workflow orchestration layer for durable multi-step workflows.

## Quick Start

1. Inngest module is enabled by default in `modules.ts`
2. Start Inngest dev server: `docker compose up` (included by default) or `npx inngest-cli@latest dev`
3. Create workflow in `modules/<module>/workflows/<name>.ts`
4. Register in `modules/<module>/inngest.workflows.ts`
5. Run `yarn generate`

## Workflow Authoring

### File Structure

```
modules/<module>/
├── workflows/
│   └── my-workflow.ts          # handler + metadata
└── inngest.workflows.ts        # convention file (aggregates workflows)
```

### Convention File MUST Rules

- File name `inngest.workflows.ts` is **FROZEN** — do not rename
- MUST export `workflows` array AND a `default` export (Turbopack requires `default` for `import *` static analysis)
- MUST run `yarn generate` after creating a new convention file

```typescript
// modules/<module>/inngest.workflows.ts
import * as myWorkflow from './workflows/my-workflow'

export const workflows = [myWorkflow]
export default workflows  // REQUIRED for Turbopack
```

### Workflow File Pattern

```typescript
import type { WorkflowMeta, WorkflowTools } from '@open-mercato/inngest'

export const metadata: WorkflowMeta = {
  id: 'module.entity-action',     // MUST contain hyphens (distinguishes from domain events)
  // Any Inngest createFunction option works here:
  // concurrency, cancelOn, debounce, rateLimit, retries, singleton, etc.
}

export default async function handler(
  payload: Record<string, unknown>,
  { step, run, resolve }: WorkflowTools
) {
  // Full Inngest SDK via `step.*`
  await step.sleep('wait', '1h')

  // DI-aware step via `run()` — resolve() works inside
  const result = await run('my-step', async () => {
    const em = resolve('em') as EntityManager
    // ...
    return { serializable: true }
  })
}
```

### Triggering Workflows

```typescript
const inngest = ctx.resolve('inngestClient') as Inngest
await inngest.send({ name: 'module.entity-action', data: { organizationId, tenantId, ... } })
```

Event name = workflow ID. MUST include `organizationId` and `tenantId` in `data`.

## MUST Rules

- Workflow IDs MUST contain hyphens (`module.entity-action`, not `module.entity.action`)
- `organizationId` + `tenantId` MUST be in every event payload — `NonRetriableError` if missing
- `resolve()` MUST only be called inside `run()` — runtime error otherwise
- `run()` return values MUST be JSON-serializable — use `wrap(entity).toObject()`, never return MikroORM entities
- Use `findWithDecryption` / `findOneWithDecryption`, never raw `em.find()`
- Steps MUST be idempotent (Inngest may retry)
- `step.invoke()` requires `referenceFunction()` in v4 — string IDs are not accepted
- Concurrency array max 2 entries (Inngest SDK limit)
- Convention files MUST export `default` (Turbopack requirement)

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Using `step.run()` then calling `resolve()` | Use `run()` instead — only `run()` sets up DI context |
| Returning MikroORM entity from `run()` | Return `wrap(entity).toObject()` or destructure to plain object |
| Using `resolve<T>('name')` with type generic | Generic doesn't survive type inference — use `resolve('name') as T` |
| Missing `default` export in convention file | Add `export default workflows` |
| Calling `inngest.send()` without `organizationId` | Always include `organizationId` + `tenantId` in event data |

## Decision Tree

```
Need DI services? → run()
No DI needed?    → step.run() (or step.sleep, step.waitForEvent, etc.)
Emit to Mercato event bus? → emitToEventBus()
Trigger another workflow?  → step.sendEvent() (loose) or step.invoke() (typed)
```

## What's Available in WorkflowTools

| Source | Members |
|--------|---------|
| Inngest SDK (inferred, not hardcoded) | `step`, `event`, `runId`, `logger`, `attempt` + any future SDK additions |
| DI additions | `run`, `resolve`, `emitToEventBus` |

The `WorkflowTools` type extends the full Inngest handler args via `Parameters<>` inference — when the SDK adds new context members, they're available automatically. We never restrict or override SDK types.
