# SPEC-069: Inngest Integration for Open Mercato

**Date:** 2026-03-21
**Status:** Draft
**Scope:** OSS

---

## TLDR

Integrate Inngest as an **optional** workflow orchestration layer for durable multi-step workflows (sleep, wait, fan-out, step-level retry). Inngest supplements — does not replace — the existing queue/events infrastructure. Native Next.js integration following Inngest's standard patterns. Lives in a standalone `packages/inngest/` package with zero residue when removed. Module-scoped workflows follow existing conventions (`workflows/*.ts` + `inngest.workflows.ts`). Self-hosted Inngest in Docker, env-driven switch to Cloud. Profile-gated — doesn't run unless explicitly enabled.

**Key concerns:** Tenant-scoped DI in long-running workflows, backward compatibility of new convention files, optional Docker infrastructure.

---

## 1. Overview

Open Mercato's current infrastructure handles two patterns well:

| Pattern | Mechanism |
|---------|-----------|
| Fire-and-forget background jobs | Workers (`workers/*.ts`) |
| Reactive side effects | Event subscribers (`subscribers/*.ts`) |

A third pattern — **durable, multi-step orchestrated workflows** — has no first-class support. Examples: invoice follow-up after N days, multi-step order fulfillment with conditional branching, data sync sagas with rollback.

Inngest provides step-level retry, sleep/wait primitives, fan-out, cancellation, and rate limiting — all with durable execution guarantees.

**Market references:** Temporal, Inngest, Restate. Inngest chosen for: no separate SDK worker process, Next.js-native serve endpoint, simpler mental model than Temporal, self-hosted option.

---

## 2. Problem Statement

1. **No durable sleep:** Workers and subscribers execute immediately. There is no way to "wait 3 days then check payment status" without external cron or polling.
2. **No step-level retry:** If step 3 of 5 fails, the entire job retries from scratch. Inngest memoizes completed steps.
3. **No event-driven cancellation:** Cannot cancel an in-flight workflow when a compensating event arrives (e.g., cancel reminder workflow when invoice is paid).
4. **No fan-out/fan-in:** Parallel sub-workflows with aggregation require manual orchestration.
5. **No rate limiting per tenant:** Noisy tenants can monopolize worker capacity. Inngest provides per-key concurrency and rate limiting out of the box.

---

## 3. Proposed Solution

### 3.1 Architecture

Native Inngest integration — no intermediate bridge layer. Workflows are triggered directly via `inngest.send()` (resolved from DI), and Inngest calls back to the `/api/inngest` serve route to execute workflow steps.

```
Trigger site → inngest.send({ name, data }) → Inngest server → POST /api/inngest → workflow executes
                                                                                      ├── ctx.step() — memoized, retried
                                                                                      ├── ctx.sleep() — durable pause
                                                                                      └── ctx.waitForEvent() — event correlation
```

The event bus and Inngest are **independent systems** with clear responsibilities:

| Need | Use | Trigger |
|------|-----|---------|
| Fire-and-forget job | Worker | Queue dispatch |
| React to event, single side effect | Subscriber | `eventBus.emit()` |
| Multi-step durable workflow | Inngest function | `inngest.send()` with workflow event name |
| Emit to bus from within a workflow | `ctx.emitToEventBus()` | Workflow step |

### 3.2 Design Decisions

**Triggering via `inngest.send()` with namespaced event names:**

Workflows are triggered using the native Inngest SDK method `inngest.send()`. To avoid confusion between Mercato domain events (`orders.invoice.created`) and Inngest workflow triggers, workflow events use a distinct `app/` prefix namespace: `app/workflow.orders.invoice-followup`. The `wrapWorkflow` adapter auto-generates this event name from the workflow ID when no explicit `event` is provided in metadata.

**Why direct `inngest.send()` instead of an event bus bridge:**

The previous spec version routed events through BullMQ → persistent wildcard subscriber → Inngest. This added ~50-100ms latency per hop and required changes to the events worker. The native approach:
- **Zero changes to existing packages** — no events worker modifications
- **Native latency** — only DI resolution overhead (~10-20ms for container creation)
- **Clear namespace** — `app/workflow.*` events are visually distinct from `module.entity.action` domain events
- **Native SDK** — uses `inngest.send()` exactly as documented in Inngest's Next.js quickstart

**Coupling concern mitigated by DI:** Modules resolve `inngestClient` from the DI container. If the Inngest package is removed, the DI registration disappears and `resolve('inngestClient')` fails at the call site — no hidden residue.

---

## 4. Package Structure

```
packages/inngest/
├── src/
│   ├── modules/
│   │   └── inngest/
│   │       ├── index.ts              # metadata: { id: 'inngest', version: '0.1.0' }
│   │       ├── generators.ts         # GeneratorPlugin: inngest.workflows convention
│   │       ├── di.ts                 # registers inngestClient
│   │       └── widgets/
│   │           └── injection/
│   │               └── settings-dashboard-link.tsx  # sidebar link to Inngest UI
│   ├── client.ts                     # new Inngest({ id: 'open-mercato' })
│   ├── adapter.ts                    # wrapWorkflow — thin wrapper adding tenant DI + defaults
│   ├── context.ts                    # WorkflowContext — DI-aware step wrapper
│   ├── guards.ts                     # assertJsonSerializable (dev-only)
│   ├── container.ts                  # createScopedWorkflowContainer()
│   ├── types.ts                      # thin re-exports from inngest SDK + our additions
│   └── index.ts                      # public exports
├── package.json                      # deps: inngest@^3.0.0; peerDeps: next, awilix
├── tsconfig.json
└── AGENTS.md
```

**Design principle:** Thin wrappers over the Inngest SDK — re-export real types, don't redefine them. Our additions are limited to: tenant-scoped DI container, `WorkflowContext` with DI-aware steps, and default concurrency/retry policies. When Inngest adds new SDK features, they're available immediately.

---

## 5. Client

```typescript
// packages/inngest/src/client.ts
import { Inngest } from 'inngest'
export const inngest = new Inngest({ id: 'open-mercato' })
// SDK reads INNGEST_BASE_URL, INNGEST_EVENT_KEY, INNGEST_SIGNING_KEY from env
```

---

## 6. Scoped Container

`createRequestContainer()` provides no tenant scoping. Workflows need a wrapper:

```typescript
// packages/inngest/src/container.ts
export async function createScopedWorkflowContainer(
  organizationId: string,
  tenantId: string
): Promise<AwilixContainer> {
  const container = await createRequestContainer()
  container.register({
    organizationId: asValue(organizationId),
    tenantId: asValue(tenantId),
  })
  const em = container.resolve<EntityManager>('em')
  em.setFilterParams('tenant', { tenantId })
  em.setFilterParams('organization', { organizationId })
  return container
}
```

**Key properties:**
- Container factory provided via DI (in `di.ts`), not imported directly — preserves dependency inversion
- One container per Inngest invocation, not per step. Within a single invocation, only one step actually executes; others return memoized values. No staleness concern
- ~10-20ms per container creation

---

## 7. WorkflowContext

The only custom abstraction in the package. Wraps Inngest's `step` object to add DI-aware execution via AsyncLocalStorage. All Inngest step methods are proxied directly — no re-typed wrappers.

```typescript
// packages/inngest/src/context.ts
import { AsyncLocalStorage } from 'node:async_hooks'
import type { GetStepTools } from 'inngest'

const stepScopeStorage = new AsyncLocalStorage<AwilixContainer>()

export class WorkflowContext {
  /** Direct access to Inngest step tools — all SDK methods available */
  readonly step: GetStepTools

  constructor(
    inngestStep: GetStepTools,
    private container: AwilixContainer
  ) {
    this.step = inngestStep
  }

  /** Resolve a service from the tenant-scoped DI container. Only callable inside run(). */
  resolve<T>(name: string): T {
    const scope = stepScopeStorage.getStore()
    if (!scope) {
      throw new Error('ctx.resolve() called outside a run() step.')
    }
    return scope.resolve<T>(name)
  }

  /**
   * Execute a step with DI context available.
   * Wraps inngestStep.run() + AsyncLocalStorage so ctx.resolve() works inside.
   * Returns must be JSON-serializable (Inngest memoizes step results).
   */
  async run<T>(id: string, fn: () => Promise<T>): Promise<T> {
    return this.step.run(id, async () => {
      return stepScopeStorage.run(this.container, async () => {
        const result = await fn()
        if (process.env.NODE_ENV === 'development') {
          assertJsonSerializable(result, id)
        }
        return result
      })
    })
  }

  /** Emit an event to the Mercato event bus (subscribers, SSE, persistent handlers). */
  async emitToEventBus(name: string, data: Record<string, unknown>): Promise<void> {
    await this.run(`emit:${name}`, async () => {
      const eventBus = this.resolve<EventBus>('eventBus')
      await eventBus.emit(name, data)
      return { _emitted: true }
    })
  }
}
```

**What WorkflowContext provides (our additions):**
- `ctx.resolve()` — tenant-scoped DI resolution, only inside `ctx.run()`
- `ctx.run()` — wraps `step.run()` with DI context + dev-mode serialization guard
- `ctx.emitToEventBus()` — fires to Mercato event bus from within a workflow step

**What's proxied directly from Inngest SDK (via `ctx.step`):**
- `ctx.step.sleep()` — durable pause
- `ctx.step.waitForEvent()` — event correlation with timeout
- `ctx.step.invoke()` — invoke another workflow by function ID
- `ctx.step.sendEvent()` — send an Inngest event
- `ctx.step.run()` — raw step execution (without DI context)
- Any future `step.*` methods — available immediately, no wrapper updates needed

**Constraints:**
- `ctx.resolve()` only inside `ctx.run()` — runtime error otherwise
- `ctx.run()` return values must be JSON-serializable — `assertJsonSerializable()` in dev mode
- Never return MikroORM entities from steps — use `wrap(entity).toObject()` or explicit plain objects
- Use `findOneWithDecryption` / `findWithDecryption`, never raw `em.find()`

---

## 8. Adapter

Thin wrapper around `inngest.createFunction()`. Spreads the full Inngest config (any SDK option works), then adds our defaults and tenant-scoped DI:

```typescript
// packages/inngest/src/adapter.ts
import { NonRetriableError } from 'inngest'

export function wrapWorkflow(metadata: WorkflowMeta, handler: WorkflowHandler) {
  const { event, trigger, ...config } = metadata

  return inngest.createFunction(
    {
      ...config,
      retries: config.retries ?? 3,
      concurrency: config.concurrency ?? [{
        limit: 1,
        key: 'event.data.organizationId',
      }],
    },
    // trigger: use event if provided (for cancelOn/waitForEvent), otherwise invocation-only
    event ? { event } : trigger ?? { event: `app/workflow.${config.id}` },
    async ({ event, step }) => {
      if (!event.data.organizationId || !event.data.tenantId) {
        throw new NonRetriableError(
          `Workflow "${config.id}" requires organizationId and tenantId in event payload`
        )
      }
      const container = await createScopedWorkflowContainer(
        event.data.organizationId,
        event.data.tenantId
      )
      try {
        const ctx = new WorkflowContext(step, container)
        return await handler(event.data, ctx)
      } finally {
        await container.dispose()
      }
    }
  )
}
```

**What wrapWorkflow adds over raw `createFunction`:**
- **Tenant-scoped DI container** — `createScopedWorkflowContainer()` with full app context (em, queryEngine, services, encryption — same as a request container)
- **Default retries:** `3` if not specified
- **Default concurrency:** `{ limit: 1, key: 'event.data.organizationId' }` — prevents noisy-tenant monopolization
- **Tenant validation:** `NonRetriableError` if `organizationId`/`tenantId` missing (stops infinite retry)
- **Container lifecycle:** created before handler, disposed in `finally`

**Everything else is pass-through** — any `createFunction` config option works because metadata is spread directly.

---

## 9. Triggering Workflows

Workflows are triggered using the native `inngest.send()` method with a namespaced event name. The `wrapWorkflow` adapter auto-generates event names as `app/workflow.${id}` — visually distinct from Mercato domain events (`module.entity.action`).

### 9.1 From API Routes / Subscribers / Workers

```typescript
// Any module code that has access to DI container
const inngestClient = ctx.resolve<Inngest>('inngestClient')
await inngestClient.send({
  name: 'app/workflow.orders.invoice-followup',
  data: { invoiceId, organizationId, tenantId },
})
```

### 9.2 From Event Subscribers (Pattern: Subscriber Triggers Workflow)

A common pattern: a subscriber reacts to a domain event and triggers a workflow. The subscriber handles the immediate side effect; the workflow handles the long-running orchestration.

```typescript
// packages/core/src/modules/orders/subscribers/on-invoice-created.ts
export const metadata = {
  event: 'orders.invoice.created',
  persistent: true,
  id: 'orders.invoice.trigger-followup',
}

export default async function handler(
  payload: InvoiceCreatedPayload,
  ctx: SubscriberContext
) {
  // Trigger durable workflow
  const inngestClient = ctx.resolve<Inngest>('inngestClient')
  await inngestClient.send({
    name: 'app/workflow.orders.invoice-followup',
    data: payload,
  })
}
```

### 9.3 From Within Workflows

```typescript
// Emit to Mercato event bus (subscribers, SSE, persistent handlers)
await ctx.emitToEventBus('orders.order.fulfilled', { orderId, organizationId, tenantId })

// Trigger another workflow (saga coordination) — via Inngest SDK step
await ctx.step.sendEvent('trigger-shipping', {
  name: 'app/workflow.orders.shipping-request',
  data: { orderId, organizationId, tenantId },
})
```

### 9.4 Event Name Convention

| Context | Pattern | Example |
|---------|---------|---------|
| Mercato domain event | `module.entity.action` | `orders.invoice.created` |
| Inngest workflow trigger | `app/workflow.{workflowId}` | `app/workflow.orders.invoice-followup` |

The `app/` prefix is an Inngest convention for application events. The `workflow.` segment makes it immediately clear this triggers an Inngest function, not a domain side effect.

### 9.5 Decision Tree: When to Use What

```
Need to react to an event with a quick side effect?
  → Subscriber (subscribers/*.ts)

Need to run a background job (email, index, export)?
  → Worker (workers/*.ts)

Need durable execution (sleep, retry steps, cancel on event, fan-out)?
  → Inngest workflow (workflows/*.ts)

Need to trigger a workflow from module code?
  → inngest.send({ name: 'app/workflow.{id}', data }) via DI

Need DI services inside a workflow step?
  → ctx.run() (not ctx.step.run())

Need to emit to the Mercato event bus from a workflow?
  → ctx.emitToEventBus()

Need Inngest SDK features (sleep, waitForEvent, sendEvent)?
  → ctx.step.* — direct SDK access, no wrapper
```

---

## 10. Discovery & Registration

### 10.1 Workflow Files

```typescript
// packages/core/src/modules/orders/workflows/invoice-followup.ts
export const metadata: WorkflowMeta = {
  id: 'orders.invoice-followup',
  event: 'orders.invoice.created',    // for cancelOn correlation
  concurrency: [{ limit: 5, key: 'event.data.organizationId' }],
  cancelOn: [{ event: 'orders.invoice.paid', match: 'data.invoiceId' }],
}

export default async function handler(
  payload: InvoiceCreatedPayload,
  ctx: WorkflowContext
) {
  // Inngest SDK methods — used directly via ctx.step
  await ctx.step.sleep('wait-3-days', '3d')

  // DI-aware step — ctx.resolve() works inside ctx.run()
  const invoice = await ctx.run('check-payment', async () => {
    const em = ctx.resolve<EntityManager>('em')
    const entity = await findOneWithDecryption(em, Invoice, { id: payload.invoiceId })
    return { paid: entity.status === 'paid' }
  })

  if (invoice.paid) return

  await ctx.run('send-reminder', async () => {
    const mailer = ctx.resolve<MailService>('mailService')
    await mailer.sendReminder(payload.invoiceId)
  })
}
```

### 10.2 Convention File

```typescript
// packages/core/src/modules/orders/inngest.workflows.ts
import * as invoiceFollowup from './workflows/invoice-followup'
import * as orderConfirmation from './workflows/order-confirmation'

export const workflows = [invoiceFollowup, orderConfirmation]
```

Convention file name `inngest.workflows.ts` is **FROZEN** once shipped. Follows `<module>.<concept>.ts` pattern (precedent: `security.mfa-providers.ts`).

### 10.3 GeneratorPlugin

```typescript
// packages/inngest/src/modules/inngest/generators.ts
export const generatorPlugins: GeneratorPlugin[] = [{
  id: 'inngest.workflows',
  conventionFile: 'inngest.workflows.ts',
  importPrefix: 'INNGEST_WORKFLOWS',
  outputFileName: 'inngest-workflows.generated.ts',

  configExpr: (importName, moduleId) =>
    `...((${importName}.default ?? ${importName}.workflows ?? [])` +
    `.map((w: unknown) => ({ moduleId: '${moduleId}', metadata: (w as any).metadata, handler: (w as any).default })))`,

  buildOutput: ({ importSection, entriesLiteral }) => `
// AUTO-GENERATED — do not edit
import { wrapWorkflow } from '@open-mercato/inngest'
${importSection}

type WorkflowEntry = { moduleId: string; metadata: unknown; handler: unknown }

const entries: WorkflowEntry[] = [
  ${entriesLiteral}
]

export const functions = entries.map(e => wrapWorkflow(e.metadata as any, e.handler as any))
`,
}]
```

### 10.4 DI Registration

```typescript
// packages/inngest/src/modules/inngest/di.ts
import { asValue } from 'awilix'
import { inngest } from '../../client'

export function register(container: AwilixContainer): void {
  container.register({
    inngestClient: asValue(inngest),
  })
}
```

### 10.5 Admin Sidebar Link

Injects an "Inngest Dashboard" link into the settings sidebar. Opens `INNGEST_BASE_URL` (defaults to `http://localhost:8288`) in a new tab. Only visible in development mode.

```typescript
// packages/inngest/src/modules/inngest/widgets/injection/settings-dashboard-link.tsx
import { useInjectedMenuItems } from '@open-mercato/ui/backend/injection/useInjectedMenuItems'

export const spot = 'menu:sidebar:settings'
export const position = { after: 'events' }

export default function InngestDashboardLink() {
  const baseUrl = process.env.NEXT_PUBLIC_INNGEST_BASE_URL ?? 'http://localhost:8288'

  if (process.env.NODE_ENV !== 'development') return null

  return {
    id: 'inngest-dashboard',
    label: 'Inngest Dashboard',
    href: baseUrl,
    external: true,
    icon: 'Workflow',
  }
}
```

**Properties:**
- Dev-only — hidden in production (Inngest dashboard accessed via SSH tunnel)
- Auto-removed — lives in `packages/inngest/`, disappears when package is removed
- Uses `NEXT_PUBLIC_INNGEST_BASE_URL` for container-aware URL (falls back to localhost)

### 10.6 Serve Route

```typescript
// apps/mercato/src/app/api/inngest/route.ts
import { serve } from 'inngest/next'
import { inngest } from '@open-mercato/inngest'
import { functions } from '@/.mercato/generated/inngest-workflows.generated'

if (process.env.INNGEST_DEV === '1' && process.env.NODE_ENV !== 'development') {
  throw new Error('INNGEST_DEV=1 is not allowed outside development')
}

export const { GET, POST, PUT } = serve({ client: inngest, functions })
```

---

## 11. Docker Infrastructure

### 11.1 Dev Container (`.devcontainer/docker-compose.yml`)

```yaml
inngest:
  image: inngest/inngest:latest  # pin after verification
  profiles: ["inngest"]
  ports:
    - '8288:8288'
  networks:
    - devcontainer
  healthcheck:
    test: ["CMD-SHELL", "exec 3<>/dev/tcp/127.0.0.1/8288 || exit 1"]
    interval: 10s
    timeout: 5s
    retries: 5
    start_period: 15s
```

Workspace service additions (environment only — no `depends_on` since Inngest is profile-gated and optional):
```yaml
environment:
  INNGEST_DEV: '1'
  INNGEST_BASE_URL: 'http://inngest:8288'
```

Activate the profile: `COMPOSE_PROFILES=inngest` in `.devcontainer/.env` or via `docker compose --profile inngest up`.

### 11.2 Dev Container Supporting Files

`devcontainer.json`:
```json
"forwardPorts": [3000, "postgres:5432", "redis:6379", "inngest:8288"],
"portsAttributes": {
  "8288": { "label": "Inngest", "onAutoForward": "notify" }
}
```

`setup-env.sh` — add after Redis block:
```bash
sed -i 's|INNGEST_BASE_URL=http://localhost:8288|INNGEST_BASE_URL=http://inngest:8288|' "$ENV_FILE"
```

`.env.example` — add after Events transport section:
```env
# Inngest (workflow orchestration — optional, docker compose --profile inngest)
INNGEST_BASE_URL=http://localhost:8288
NEXT_PUBLIC_INNGEST_BASE_URL=http://localhost:8288
# INNGEST_EVENT_KEY=
# INNGEST_SIGNING_KEY=
```

### 11.3 Full App Dev (`docker-compose.fullapp.dev.yml`)

```yaml
inngest:
  image: inngest/inngest:latest
  container_name: mercato-inngest-${DEPLOY_ENV:-local}
  profiles: ["inngest"]
  environment:
    INNGEST_DEV: '1'
    INNGEST_EVENT_KEY: '${INNGEST_EVENT_KEY:-test-event-key}'
    INNGEST_SIGNING_KEY: '${INNGEST_SIGNING_KEY:-signkey-test-signing-key-00000000}'
    INNGEST_PG_DSN: 'postgresql://inngest:inngest@mercato-postgres-${DEPLOY_ENV:-local}:5432/inngest'
  depends_on:
    postgres:
      condition: service_healthy
  networks:
    - mercato-network-fullapp
  healthcheck:
    test: ["CMD-SHELL", "exec 3<>/dev/tcp/127.0.0.1/8288 || exit 1"]
    interval: 10s
    timeout: 5s
    retries: 5
    start_period: 15s
```

App service additions:
```yaml
INNGEST_BASE_URL: 'http://mercato-inngest-${DEPLOY_ENV:-local}:8288'
INNGEST_EVENT_KEY: '${INNGEST_EVENT_KEY:-test-event-key}'
INNGEST_SIGNING_KEY: '${INNGEST_SIGNING_KEY:-signkey-test-signing-key-00000000}'
INNGEST_SERVE_ORIGIN: 'http://mercato-app-${DEPLOY_ENV:-local}:3000'
```

### 11.4 Production (`docker-compose.fullapp.yml`)

Same as fullapp.dev but:
- No port exposure (port 8288 internal-only)
- `INNGEST_DEV` not set (production mode with signing verification)
- Fail-fast on missing keys:
  ```yaml
  INNGEST_EVENT_KEY: '${INNGEST_EVENT_KEY:?INNGEST_EVENT_KEY must be set}'
  INNGEST_SIGNING_KEY: '${INNGEST_SIGNING_KEY:?INNGEST_SIGNING_KEY must be set}'
  ```
- Dedicated PostgreSQL user (created in init script)
- Dashboard access via SSH tunnel only

### 11.5 PostgreSQL Init

```sql
-- docker/postgres-init.sh — add after pgvector setup:
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
    SELECT 'CREATE USER inngest WITH PASSWORD ''inngest''' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'inngest')\gexec
    SELECT 'CREATE DATABASE inngest OWNER inngest' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'inngest')\gexec
EOSQL
```

### 11.6 Pre-Implementation Verification

Before writing any Docker config:
```bash
docker pull inngest/inngest:latest
docker inspect inngest/inngest:latest --format='{{.Config.Entrypoint}}'
docker inspect inngest/inngest:latest --format='{{.Config.Cmd}}'
docker run --rm -p 8288:8288 inngest/inngest:latest
curl -sf http://localhost:8288/ && echo "OK"
```

Pin to verified tag after confirming.

---

## 12. Types

Thin re-exports from the Inngest SDK — no custom type duplication:

```typescript
// packages/inngest/src/types.ts
import type { FunctionConfiguration, TriggerOption } from 'inngest'

/**
 * Workflow metadata — extends Inngest's FunctionConfiguration directly.
 * Any Inngest createFunction option is valid. We add:
 * - `id` as required (Inngest makes it optional)
 * - `event` as optional (only needed for waitForEvent/cancelOn)
 * - `trigger` as optional (custom trigger config)
 */
export type WorkflowMeta = FunctionConfiguration & {
  id: string
  event?: string
  trigger?: TriggerOption
}

/** Workflow handler receives the event payload and a DI-aware WorkflowContext. */
export type WorkflowHandler = (
  payload: Record<string, unknown>,
  ctx: WorkflowContext
) => Promise<unknown>
```

When Inngest adds new options to `FunctionConfiguration` (e.g., new retry strategies, priority levels), they're available in `WorkflowMeta` immediately — no wrapper updates needed.

---

## 13. Module Registration

```typescript
// apps/mercato/src/modules.ts
{ id: 'inngest', from: '@open-mercato/inngest' }
```

Conditional enablement (recommended):
```typescript
if (parseBooleanWithDefault(process.env.OM_ENABLE_INNGEST, false)) {
  enabledModules.push({ id: 'inngest', from: '@open-mercato/inngest' })
}
```

---

## 14. Documented Constraints

| Constraint | Enforced By |
|-----------|-------------|
| `ctx.resolve()` only inside `ctx.run()` | Runtime error |
| `ctx.run()` return values JSON-serializable | `assertJsonSerializable()` in dev |
| Never return MikroORM entities from steps | Runtime guard + docs |
| Mandatory `organizationId` + `tenantId` in event payload | `NonRetriableError` in `wrapWorkflow` |
| Per-tenant concurrency key | Auto-injected default in `wrapWorkflow` |
| Use `findOneWithDecryption` not `em.find()` | Docs + code review |
| `INNGEST_DEV=1` blocked outside development | Serve route startup guard |
| Steps must be idempotent | Docs (same as workers) |
| Event payloads: IDs not PII | Docs |
| Convention file `inngest.workflows.ts` is FROZEN once shipped | BC contract |

---

## 15. Removability

1. **Remove module registration** — Delete `{ id: 'inngest' }` from `apps/mercato/src/modules.ts`
2. **Remove workflow files** — Delete all `inngest.workflows.ts` and `workflows/` directories
3. **Remove `inngest.send()` calls** — Search for `inngestClient` DI resolution in subscribers/routes
4. **Remove serve endpoint** — Delete `apps/mercato/src/app/api/inngest/`
5. **Regenerate** — `yarn generate` + remove `inngest-workflows.generated.ts`
6. **Remove package** — `rm -rf packages/inngest/` + `yarn install`
7. **Verify** — `yarn build` (find any missed references)
8. **Infrastructure cleanup** — Remove Inngest from Docker, env files, postgres-init

**Zero residue in core packages.** No modifications to existing packages required.

---

## 16. Implementation Phases

### Phase 1 — Foundation
1. Create `packages/inngest/` with `client.ts`, `adapter.ts`, `context.ts`, `container.ts`, `types.ts`, `guards.ts`
2. Add module with `index.ts`, `di.ts`, `generators.ts`
3. Add settings sidebar link widget (`widgets/injection/settings-dashboard-link.tsx`)
4. Add serve route in `apps/mercato/src/app/api/inngest/route.ts`
5. Add to `modules.ts` (env-gated)
6. Run `yarn generate`, verify build

### Phase 2 — Docker
1. Verify Inngest Docker image (pull, inspect, run)
2. Add service to all compose stacks (profile-gated)
3. Update `devcontainer.json`, `setup-env.sh`, `.env.example`
4. Add PostgreSQL init for inngest database

### Phase 3 — Example Workflow
1. Create example workflow in `packages/core/src/modules/example/`
2. Create `inngest.workflows.ts` convention file
3. Add subscriber that triggers workflow via `inngest.send()`
4. End-to-end test: subscriber → `inngest.send()` → Inngest → workflow executes → `ctx.emitToEventBus()` back

### Phase 4 — Documentation
1. AGENTS.md updates (decision tree, task router row)
2. `packages/inngest/AGENTS.md` (workflow authoring guide)
3. Workflow constraints and patterns

---

## 17. Integration Test Coverage

| Path | Test |
|------|------|
| `POST /api/inngest` | Serve route responds to Inngest SDK introspection |
| `inngest.send()` → workflow | Invoke workflow by function ID, verify it executes |
| Workflow step execution | Trigger workflow, verify step runs with tenant-scoped DI |
| `ctx.emitToEventBus()` | Workflow emits to bus, verify subscriber fires |
| `ctx.invokeWorkflow()` | Workflow invokes another workflow by ID |
| `cancelOn` | Trigger workflow with sleep, send cancel event, verify workflow stops |
| Missing `organizationId` | Invoke without org, verify `NonRetriableError` |

---

## 18. Risks & Impact Review

### Risk Register

| # | Scenario | Severity | Affected Area | Mitigation | Residual Risk |
|---|----------|----------|---------------|------------|---------------|
| R1 | Inngest server down — `inngest.send()` fails | **High** | Workflow triggering | Caller decides retry strategy (subscriber = BullMQ retry; route = return error to client) | Medium — no automatic queue buffer; callers must handle failure |
| R2 | Tenant data leak via shared container | **High** | Tenant isolation | `createScopedWorkflowContainer` sets MikroORM filter params; `organizationId`/`tenantId` required or `NonRetriableError` | Low — same isolation pattern as request containers |
| R3 | Non-serializable step return corrupts Inngest state | **Medium** | Workflow execution | `assertJsonSerializable()` guard in dev; runtime docs | Medium — only enforced in dev; prod relies on developer discipline |
| R4 | Serve route misconfiguration (`INNGEST_DEV=1` in non-dev) | **Low** | App stability | `throw new Error(...)` surfaces at build/startup; Next.js handles gracefully | Low |
| R5 | Convention file `inngest.workflows.ts` becomes BC burden | **Low** | Maintainability | Follows existing `security.mfa-providers.ts` precedent; FROZEN classification explicit | Low |
| R6 | DI coupling — modules with `inngest.send()` depend on Inngest package | **Low** | Removability | DI resolution fails clearly at call site; step 3 in removability covers search/replace | Low — explicit, not hidden |

### Cascading Failure Analysis

- **Inngest server crash:** `inngest.send()` calls fail. If called from a persistent subscriber, BullMQ retries the subscriber. If called from an API route, the route returns an error. No silent data loss.
- **Workflow step failure:** Inngest retries only the failed step (memoized prior steps). After exhausting retries, workflow marked as failed in Inngest dashboard.
- **Container creation failure:** `wrapWorkflow` catches and disposes in `finally` block. Inngest sees an error and retries per retry policy.

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 0.1 | 2026-03-21 | Initial draft with BullMQ persistent bridge approach |
| 0.2 | 2026-03-21 | Pre-implementation fixes: export `matchEventPattern`, fix worker `eventName` propagation, replace `process.exit` with `throw` |
| 0.3 | 2026-03-21 | **Major rewrite:** replaced BullMQ bridge with native Inngest integration. Eliminated events worker modifications, wildcard fix, `_inngestOrigin` loop prevention, bridge subscriber, and registry. Direct `inngest.send()` via DI. Zero changes to existing packages. |
| 0.4 | 2026-03-21 | Switched from `inngest.send()` (event-based) to `inngest.send()` (function ID-based) to eliminate naming confusion between Mercato domain events and Inngest triggers. |
| 0.5 | 2026-03-21 | Thin wrapper philosophy: `WorkflowMeta` re-exports `FunctionConfiguration`, `WorkflowContext` exposes `ctx.step` for direct SDK access, `ctx.run()` replaces `ctx.step()` for DI-aware execution. No custom type duplication — SDK features available immediately. |
| 0.6 | 2026-03-21 | Added Inngest Dashboard sidebar link in settings (dev-only, widget injection). Port forwarding + admin UI link for discoverability. |
