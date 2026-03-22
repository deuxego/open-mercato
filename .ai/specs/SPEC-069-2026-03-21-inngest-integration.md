# SPEC-069: Inngest Integration for Open Mercato

**Date:** 2026-03-21
**Status:** Draft
**Scope:** OSS

---

## TLDR

Integrate Inngest as an **optional** workflow orchestration layer for durable multi-step workflows (sleep, wait, fan-out, step-level retry). Inngest supplements — does not replace — the existing queue/events infrastructure. Native Next.js integration following Inngest's standard patterns. Lives in a standalone `packages/inngest/` package with zero residue when removed. Module-scoped workflows follow existing conventions (`workflows/*.ts` + `inngest.workflows.ts`). Self-hosted Inngest in Docker, env-driven switch to Cloud. Module always-on; Docker server profile-gated (opt-in). Targets Inngest SDK **v4**.

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
                                                                                      ├── run()  — DI-aware step
                                                                                      ├── step.sleep() — durable pause
                                                                                      └── step.waitForEvent() — event correlation
```

The event bus and Inngest are **independent systems** with clear responsibilities:

| Need | Use | Trigger |
|------|-----|---------|
| Fire-and-forget job | Worker | Queue dispatch |
| React to event, single side effect | Subscriber | `eventBus.emit()` |
| Multi-step durable workflow | Inngest function | `inngest.send()` with workflow ID as event name |
| Emit to bus from within a workflow | `ctx.emitToEventBus()` | Workflow step |

### 3.2 Design Decisions

**Triggering via `inngest.send()` with the workflow ID as event name:**

Workflows are triggered using the native Inngest SDK method `inngest.send()`. The event name is the workflow ID (e.g., `orders.invoice-followup`). This is naturally distinct from Mercato domain events which use dots only (`orders.invoice.created`) — workflow IDs contain hyphens. The `wrapWorkflow` adapter uses `config.id` as the default trigger event name.

**Why direct `inngest.send()` instead of an event bus bridge:**

The previous spec version routed events through BullMQ → persistent wildcard subscriber → Inngest. This added ~50-100ms latency per hop and required changes to the events worker. The native approach:
- **Zero changes to existing packages** — no events worker modifications
- **Native latency** — only DI resolution overhead (~10-20ms for container creation)
- **Native SDK** — uses `inngest.send()` exactly as documented in Inngest's Next.js quickstart
- **Explicit triggering** — developers clearly see when a workflow is triggered vs when an event is emitted

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
│   │       ├── widgets/
│   │       │   ├── injection/
│   │       │   │   └── inngest-dashboard/
│   │       │   │       ├── widget.ts         # InjectionWidgetModule metadata
│   │       │   │       └── widget.client.tsx  # React component
│   │       │   └── injection-table.ts         # spot → widget mapping
│   ├── client.ts                     # new Inngest({ id: 'open-mercato' })
│   ├── adapter.ts                    # wrapWorkflow — thin wrapper adding tenant DI + defaults
│   ├── context.ts                    # WorkflowContext — DI-aware step wrapper
│   ├── guards.ts                     # assertJsonSerializable (dev-only)
│   ├── container.ts                  # createScopedWorkflowContainer()
│   ├── types.ts                      # inferred types from inngest SDK
│   └── index.ts                      # public exports
├── package.json                      # deps: inngest@^4.0.0; peerDeps: next, awilix
├── tsconfig.json
└── AGENTS.md
```

**Design principle:** Types are inferred from the Inngest SDK using TypeScript utilities (`Parameters<>`, `ReturnType<>`), not copy-pasted. When Inngest updates their SDK, our types update automatically.

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
  return container
}
```

**Key properties:**
- Registers `organizationId` and `tenantId` as DI values — available to all services that depend on them (queryEngine, encryption, etc.)
- Tenant isolation relies on services using `queryEngine.query()` or `findWithDecryption()` which explicitly scope by tenant — same pattern as request containers
- One container per Inngest invocation, not per step. Each Inngest callback is a separate HTTP request; `wrapWorkflow` runs from scratch each time, but memoized steps return instantly. No staleness concern.
- ~10-20ms per container creation

---

## 7. Workflow Tools (DI Extensions)

No class, no wrapper. The workflow handler receives the **full Inngest handler args** (`step`, `event`, `runId`, `logger`, `attempt`) plus three DI additions (`run`, `resolve`, `emitToEventBus`) — all in a flat object.

```typescript
// packages/inngest/src/context.ts
import { AsyncLocalStorage } from 'node:async_hooks'

const stepScopeStorage = new AsyncLocalStorage<AwilixContainer>()

/** Build the DI-aware `run()` function — wraps step.run() with AsyncLocalStorage */
export function buildDIRun(step: StepTools, container: AwilixContainer) {
  let emitCounter = 0

  const resolve = <T>(name: string): T => {
    const scope = stepScopeStorage.getStore()
    if (!scope) {
      throw new Error('resolve() called outside a run() step.')
    }
    return scope.resolve<T>(name)
  }

  const run = async <T>(id: string, fn: () => Promise<T>): Promise<T> => {
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
      const eventBus = resolve<EventBus>('eventBus')
      await eventBus.emit(name, data)
      return { _emitted: true }
    })
  }

  return { run, resolve, emitToEventBus }
}
```

**What the handler receives — full Inngest + DI in one flat object:**

| Source | Members | Notes |
|--------|---------|-------|
| Inngest SDK | `step`, `event`, `runId`, `logger`, `attempt` | Full SDK — every `step.*` method available |
| Our DI additions | `run`, `resolve`, `emitToEventBus` | Tenant-scoped DI context |

**Our three additions:**
- `resolve<T>(name)` — tenant-scoped DI resolution, only inside `run()`
- `run(id, fn)` — `step.run()` + AsyncLocalStorage so `resolve()` works inside. Dev-mode serialization guard. For steps without DI, use `step.run()` directly.
- `emitToEventBus(name, data)` — fires to Mercato event bus from within a workflow step. Auto-incrementing step ID prevents memoization collision.

**Constraints:**
- `resolve()` only inside `run()` — runtime error otherwise
- `run()` return values must be JSON-serializable — `assertJsonSerializable()` in dev mode
- Never return MikroORM entities from steps — use `wrap(entity).toObject()` or explicit plain objects
- Use `findOneWithDecryption` / `findWithDecryption`, never raw `em.find()`
- `step.invoke()` in v4 requires `referenceFunction({ functionId })` or a direct function import — string IDs are not accepted

---

## 8. Adapter

Thin wrapper around `inngest.createFunction()`. Uses the **v4 two-argument signature** (triggers inside options). Adds tenant-scoped DI and defaults:

```typescript
// packages/inngest/src/adapter.ts
import { NonRetriableError } from 'inngest'
import { inngest } from './client'

// Infer the config type from the SDK
type CreateFnConfig = Parameters<typeof inngest.createFunction>[0]

export function wrapWorkflow(metadata: WorkflowMeta, handler: WorkflowHandler) {
  const { event, ...config } = metadata

  return inngest.createFunction(
    {
      ...config,
      retries: config.retries ?? 3,
      concurrency: config.concurrency ?? [{
        limit: 1,
        key: 'event.data.organizationId',
      }],
      // Trigger: workflow ID as event name by default
      triggers: [{ event: event ?? config.id }],
    } satisfies CreateFnConfig,
    async (inngestArgs) => {
      const { event, step } = inngestArgs
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
        const { run, resolve, emitToEventBus } = buildDIRun(step, container)
        // Merge full Inngest args + our DI tools into one flat object
        return await handler(event.data, { ...inngestArgs, run, resolve, emitToEventBus })
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
- **Default concurrency:** `[{ limit: 1, key: 'event.data.organizationId' }]` — prevents noisy-tenant monopolization. Inngest allows max 2 concurrency entries.
- **Default trigger:** `[{ event: config.id }]` — workflow ID as event name. Override with `event` field in metadata.
- **Tenant validation:** `NonRetriableError` if `organizationId`/`tenantId` missing (stops infinite retry)
- **Container lifecycle:** created before handler, disposed in `finally`

**Everything else is pass-through** — metadata spreads into `createFunction` options. The `satisfies CreateFnConfig` ensures type compatibility at compile time.

---

## 9. Triggering Workflows

Workflows are triggered using the native `inngest.send()` method. The event name matches the workflow ID by default (e.g., `orders.invoice-followup`). The client is available via DI.

### 9.1 From API Routes / Subscribers / Workers

```typescript
// Any module code that has access to DI container
const inngestClient = ctx.resolve('inngestClient') as Inngest
await inngestClient.send({
  name: 'orders.invoice-followup',
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
  // Trigger durable workflow — event name = workflow ID
  const inngestClient = ctx.resolve('inngestClient') as Inngest
  await inngestClient.send({
    name: 'orders.invoice-followup',
    data: payload,
  })
}
```

### 9.3 From Within Workflows

```typescript
export default async function handler(
  payload: OrderPayload,
  { step, emitToEventBus }: WorkflowTools
) {
  // Emit to Mercato event bus (subscribers, SSE, persistent handlers)
  await emitToEventBus('orders.order.fulfilled', { orderId, organizationId, tenantId })

  // Trigger another workflow (saga coordination)
  // Option A: via step.sendEvent (event-based, loosely coupled)
  await step.sendEvent('trigger-shipping', {
    name: 'orders.shipping-request',
    data: { orderId, organizationId, tenantId },
  })

  // Option B: via step.invoke (direct invocation, type-safe with referenceFunction)
  // import { referenceFunction } from 'inngest' — at top of file
  const shippingRef = referenceFunction({ functionId: 'orders.shipping-request' })
  await step.invoke('invoke-shipping', { function: shippingRef, data: { orderId, organizationId, tenantId } })
}
```

**`step.sendEvent` vs `step.invoke`:** Use `sendEvent` for loose coupling (fire-and-forget to another workflow). Use `invoke` when you need the return value or type safety via `referenceFunction`.

### 9.4 Naming Convention

| Context | Pattern | Example |
|---------|---------|---------|
| Mercato domain event | `module.entity.action` (dots only) | `orders.invoice.created` |
| Inngest workflow trigger | `module.entity-action` (hyphens) | `orders.invoice-followup` |

Domain events use dots as separators. Workflow IDs use hyphens. The difference is natural — no artificial prefix needed.

### 9.5 Decision Tree: When to Use What

```
Need to react to an event with a quick side effect?
  → Subscriber (subscribers/*.ts)

Need to run a background job (email, index, export)?
  → Worker (workers/*.ts)

Need durable execution (sleep, retry steps, cancel on event, fan-out)?
  → Inngest workflow (workflows/*.ts)

Need to trigger a workflow from module code?
  → inngest.send({ name: workflowId, data }) via DI

Need DI services inside a workflow step?
  → run() (not step.run())

Need to emit to the Mercato event bus from a workflow?
  → emitToEventBus()

Need to trigger another workflow from within a workflow?
  → step.sendEvent() (loose) or step.invoke() (typed, with referenceFunction)

Need other Inngest SDK features (sleep, waitForEvent, fetch)?
  → step.* — full SDK, no wrapper
```

---

## 10. Discovery & Registration

### 10.1 Workflow Files

```typescript
// packages/core/src/modules/orders/workflows/invoice-followup.ts
export const metadata: WorkflowMeta = {
  id: 'orders.invoice-followup',
  concurrency: [{ limit: 5, key: 'event.data.organizationId' }],
  cancelOn: [{ event: 'orders.invoice.paid', match: 'data.invoiceId' }],
}

export default async function handler(
  payload: InvoiceCreatedPayload,
  { step, run, resolve }: WorkflowTools
) {
  // Full Inngest SDK — used directly, no wrapper
  await step.sleep('wait-3-days', '3d')

  // DI-aware step — resolve() works inside run()
  const invoice = await run('check-payment', async () => {
    const em = resolve<EntityManager>('em')
    const entity = await findOneWithDecryption(em, Invoice, { id: payload.invoiceId })
    return { paid: entity.status === 'paid' }
  })

  if (invoice.paid) return

  await run('send-reminder', async () => {
    const mailer = resolve<MailService>('mailService')
    await mailer.sendReminder(payload.invoiceId)
  })
}
```

**Note:** No `event` field in metadata — the adapter defaults to `triggers: [{ event: 'orders.invoice-followup' }]` (the workflow ID). The `cancelOn` event (`orders.invoice.paid`) is a separate Inngest concept — it doesn't need the function's trigger event to match.

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
    `.map((w: unknown) => ({ moduleId: '${moduleId}', metadata: (w as Record<string, unknown>).metadata, handler: (w as Record<string, unknown>).default })))`,

  buildOutput: ({ importSection, entriesLiteral }) => `
// AUTO-GENERATED — do not edit
import { wrapWorkflow } from '@open-mercato/inngest'
import type { WorkflowMeta, WorkflowHandler } from '@open-mercato/inngest'
${importSection}

type WorkflowEntry = { moduleId: string; metadata: WorkflowMeta; handler: WorkflowHandler }

const entries: WorkflowEntry[] = [
  ${entriesLiteral}
]

export const functions = entries.map(e => wrapWorkflow(e.metadata, e.handler))
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

Injects an "Inngest Dashboard" link into the settings sidebar using the standard widget injection pattern. Only visible in development mode.

```typescript
// packages/inngest/src/modules/inngest/widgets/injection/inngest-dashboard/widget.ts
import type { InjectionWidgetModule } from '@open-mercato/shared/modules/widgets'

const widget: InjectionWidgetModule = {
  metadata: {
    id: 'inngest.dashboard-link',
    spot: 'menu:sidebar:settings',
    position: { after: 'events' },
  },
  Widget: () => import('./widget.client'),
}

export default widget
```

```typescript
// packages/inngest/src/modules/inngest/widgets/injection/inngest-dashboard/widget.client.tsx
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

```typescript
// packages/inngest/src/modules/inngest/widgets/injection-table.ts
export { default as inngestDashboard } from './injection/inngest-dashboard/widget'
```

**Properties:**
- Dev-only — hidden in production (Inngest dashboard accessed via SSH tunnel)
- Auto-removed — lives in `packages/inngest/`, disappears when package is removed
- Follows standard widget injection convention (`widget.ts` + `widget.client.tsx` + `injection-table.ts`)

### 10.6 Serve Route

```typescript
// apps/mercato/src/app/api/inngest/route.ts
// NOTE: This route lives in apps/mercato/src/ because Inngest's serve() requires
// exporting named HTTP method handlers (GET/POST/PUT) in Next.js App Router format,
// which is incompatible with the module API auto-discovery dispatch layer.
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
  restart: unless-stopped
  profiles: ["inngest"]
  ports:
    - '8288:8288'
  networks:
    - devcontainer
  healthcheck:
    test: ["CMD-SHELL", "curl -sf http://127.0.0.1:8288/ || exit 1"]
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

**Activating the profile:** This is the first profile-gated service in the project. Existing services (postgres, redis) always run. To enable Inngest:
- **DevContainer:** Add `COMPOSE_PROFILES=inngest` to `remoteEnv` in `devcontainer.json`, or create `.devcontainer/.env` with `COMPOSE_PROFILES=inngest`
- **CLI:** `COMPOSE_PROFILES=inngest docker compose up`

### 11.2 Dev Container Supporting Files

`devcontainer.json` — add Inngest port (note: VS Code handles missing profile-gated containers gracefully — port simply won't forward):
```json
"forwardPorts": [3000, "postgres:5432", "redis:6379", "inngest:8288"],
"portsAttributes": {
  "8288": { "label": "Inngest", "onAutoForward": "notify" }
}
```

`setup-env.sh` — add after Redis block (no-op if INNGEST_BASE_URL not in .env):
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
  restart: unless-stopped
  profiles: ["inngest"]
  ports:
    - '${INNGEST_PORT:-8288}:8288'
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
    test: ["CMD-SHELL", "curl -sf http://127.0.0.1:8288/ || exit 1"]
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

**Note:** The fullapp postgres service must mount `docker/postgres-init.sh` for the Inngest database to be created. If not already mounted, add to postgres volumes: `- ./docker/postgres-init.sh:/docker-entrypoint-initdb.d/postgres-init.sh:ro`

### 11.4 Production (`docker-compose.fullapp.yml`)

Same as fullapp.dev but:
- No port exposure (port 8288 internal-only)
- `INNGEST_DEV` not set (production mode with signing verification)
- Fail-fast on missing keys:
  ```yaml
  INNGEST_EVENT_KEY: '${INNGEST_EVENT_KEY:?INNGEST_EVENT_KEY must be set}'
  INNGEST_SIGNING_KEY: '${INNGEST_SIGNING_KEY:?INNGEST_SIGNING_KEY must be set}'
  ```
- Inngest DB credentials via env vars (`INNGEST_PG_USER`, `INNGEST_PG_PASSWORD`) — not hardcoded
- Dashboard access via SSH tunnel only

### 11.5 PostgreSQL Init

```sql
-- docker/postgres-init.sh — add after pgvector setup:
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
    DO \$\$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'inngest') THEN
        CREATE ROLE inngest WITH LOGIN PASSWORD 'inngest';
      END IF;
    END
    \$\$;
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

All types inferred from the Inngest SDK using TypeScript utilities — zero copy-paste:

```typescript
// packages/inngest/src/types.ts
import { inngest } from './client'

/** Infer createFunction config from the SDK */
type CreateFnConfig = Parameters<typeof inngest.createFunction>[0]

/** Infer full handler args from the SDK */
type InngestHandler = Parameters<typeof inngest.createFunction>[1]
type InngestHandlerArgs = Parameters<InngestHandler>[0]

/** Step tools — inferred, not imported */
export type StepTools = InngestHandlerArgs['step']

/**
 * Workflow metadata — inferred from inngest.createFunction's first parameter.
 * Any SDK option (retries, concurrency, cancelOn, debounce, rateLimit, singleton, etc.) is valid.
 * We enforce `id` as required and add `event` as a shorthand for the trigger event name.
 */
export type WorkflowMeta = CreateFnConfig & {
  id: string
  event?: string  // shorthand: overrides default trigger event (which is config.id)
}

/** Full Inngest handler args + our DI additions — what the workflow handler receives */
export type WorkflowTools = InngestHandlerArgs & {
  run: <T>(id: string, fn: () => Promise<T>) => Promise<T>
  resolve: <T>(name: string) => T
  emitToEventBus: (name: string, data: Record<string, unknown>) => Promise<void>
}

/** Workflow handler signature */
export type WorkflowHandler = (
  payload: Record<string, unknown>,
  tools: WorkflowTools
) => Promise<unknown>
```

When Inngest updates their SDK (new `createFunction` options, new `step.*` methods), our types update automatically — no wrapper maintenance.

---

## 13. Module Registration

Always-on in `modules.ts` (registered alongside other core modules):

```typescript
// apps/mercato/src/modules.ts
{ id: 'inngest', from: '@open-mercato/inngest' }
```

The module registers a DI service and generator plugin. The Inngest Docker server is profile-gated and optional — when not running, the module is inert (no workflows execute, no errors).

---

## 14. Documented Constraints

| Constraint | Enforced By |
|-----------|-------------|
| `resolve()` only inside `run()` | Runtime error |
| `run()` return values JSON-serializable | `assertJsonSerializable()` in dev |
| Never return MikroORM entities from steps | Runtime guard + docs |
| Mandatory `organizationId` + `tenantId` in event payload | `NonRetriableError` in `wrapWorkflow` |
| Per-tenant concurrency key | Auto-injected default in `wrapWorkflow` |
| Concurrency array max 2 entries | Inngest SDK runtime validation |
| Use `findOneWithDecryption` not `em.find()` | Docs + code review |
| `INNGEST_DEV=1` blocked outside development | Serve route startup guard |
| Steps must be idempotent | Docs (same as workers) |
| Event payloads: IDs not PII | Docs |
| `step.invoke()` requires `referenceFunction()` in v4 | Inngest SDK compile-time |
| Convention file `inngest.workflows.ts` is FROZEN once shipped | BC contract |
| Workflow IDs MUST contain hyphens | Convention — distinguishes from dot-separated domain events |

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
1. Install `inngest@^4.0.0`, verify SDK type exports (`CreateFnConfig`, `GetStepTools` inference)
2. Create `packages/inngest/` with `client.ts`, `adapter.ts`, `context.ts`, `container.ts`, `types.ts`, `guards.ts`
3. Add module with `index.ts`, `di.ts`, `generators.ts`
4. Add widget injection (`widgets/injection/inngest-dashboard/` + `injection-table.ts`)
5. Add serve route in `apps/mercato/src/app/api/inngest/route.ts`
6. Add to `modules.ts` (always-on)
7. Run `yarn generate`, verify build
8. After Phase 1, the app builds and runs normally. Inngest features are inert unless the Inngest server is running.

### Phase 2 — Docker
1. Verify Inngest Docker image (pull, inspect, run, confirm healthcheck endpoint)
2. Add service to all compose stacks (profile-gated, `restart: unless-stopped`)
3. Update `devcontainer.json`, `setup-env.sh`, `.env.example`
4. Add PostgreSQL init for inngest database
5. Verify postgres-init.sh is mounted in fullapp compose files

### Phase 3 — Example Workflow
1. Create example workflow in `packages/core/src/modules/example/`
2. Create `inngest.workflows.ts` convention file
3. Add subscriber that triggers workflow via `inngest.send()`
4. End-to-end test: subscriber → `inngest.send()` → Inngest → workflow executes → `ctx.emitToEventBus()` back

### Phase 4 — Documentation
1. AGENTS.md updates (decision tree, task router row)
2. `packages/inngest/AGENTS.md` (workflow authoring guide, common mistakes: `ctx.run()` vs `ctx.step.run()`, `referenceFunction` requirement)
3. Workflow constraints and patterns

---

## 17. Integration Test Coverage

| Path | Test |
|------|------|
| `POST /api/inngest` | Serve route responds to Inngest SDK introspection |
| `inngest.send()` → workflow | Send workflow event by ID, verify function executes |
| Workflow step execution | Trigger workflow, verify step runs with tenant-scoped DI |
| `ctx.emitToEventBus()` | Workflow emits to bus, verify subscriber fires |
| `ctx.step.sendEvent()` | Workflow triggers another workflow via sendEvent |
| `cancelOn` | Trigger workflow with sleep, send cancel event, verify workflow stops |
| Missing `organizationId` | Send event without org, verify `NonRetriableError` |

---

## 18. Risks & Impact Review

### Risk Register

| # | Scenario | Severity | Affected Area | Mitigation | Residual Risk |
|---|----------|----------|---------------|------------|---------------|
| R1 | Inngest server down — `inngest.send()` fails | **High** | Workflow triggering | Caller decides retry strategy (subscriber = BullMQ retry; route = return error to client) | Medium — no automatic queue buffer (tradeoff vs old bridge: simpler architecture, but callers must handle failure) |
| R2 | Tenant data leak via shared container | **High** | Tenant isolation | `createScopedWorkflowContainer` registers org/tenant in DI; services scope queries via `queryEngine`/`findWithDecryption` | Low — same isolation pattern as request containers |
| R3 | Non-serializable step return corrupts Inngest state | **Medium** | Workflow execution | `assertJsonSerializable()` guard in dev; runtime docs | Medium — only enforced in dev; prod relies on developer discipline |
| R4 | Serve route misconfiguration (`INNGEST_DEV=1` in non-dev) | **Low** | App stability | `throw new Error(...)` surfaces at build/startup; Next.js handles gracefully | Low |
| R5 | Convention file `inngest.workflows.ts` becomes BC burden | **Low** | Maintainability | Follows existing `security.mfa-providers.ts` precedent; FROZEN classification explicit | Low |
| R6 | DI coupling — modules with `inngest.send()` depend on Inngest package | **Low** | Removability | DI resolution fails clearly at call site; step 3 in removability covers search/replace | Low — explicit, not hidden |

### Cascading Failure Analysis

- **Inngest server crash:** `inngest.send()` calls fail. If called from a persistent subscriber, BullMQ retries the subscriber. If called from an API route, the route returns an error. No silent data loss.
- **Workflow step failure:** Inngest retries only the failed step (memoized prior steps). After exhausting retries, workflow marked as failed in Inngest dashboard. Optional `onFailure` handler for alerts.
- **Container creation failure:** `wrapWorkflow` catches and disposes in `finally` block. Inngest sees an error and retries per retry policy.

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 0.1 | 2026-03-21 | Initial draft with BullMQ persistent bridge approach |
| 0.2 | 2026-03-21 | Pre-implementation fixes: export `matchEventPattern`, fix worker `eventName` propagation, replace `process.exit` with `throw` |
| 0.3 | 2026-03-21 | **Major rewrite:** replaced BullMQ bridge with native Inngest integration. Direct `inngest.send()` via DI. Zero changes to existing packages. |
| 0.4 | 2026-03-21 | Switched to `inngest.invoke()` (function ID-based) to eliminate naming confusion. |
| 0.5 | 2026-03-21 | Thin wrapper philosophy: `WorkflowContext` exposes `ctx.step` for direct SDK access, `ctx.run()` for DI-aware execution. |
| 0.6 | 2026-03-21 | Added Inngest Dashboard sidebar link in settings (dev-only, widget injection). |
| 0.7 | 2026-03-21 | Reverted to `inngest.send()` (native SDK method). `invoke()` is step-level only. Workflow ID as event name — hyphens distinguish from domain events. |
| 0.8 | 2026-03-21 | **Full review pass:** Target SDK v4 (`^4.0.0`). v4 two-arg `createFunction` signature (triggers inside options). Types inferred via `Parameters<typeof inngest.createFunction>` — no copy-paste. Fixed: container scoping (removed non-functional `setFilterParams`), widget injection pattern, `emitToEventBus` step ID collision, `as any` → typed casts in generator, `referenceFunction` requirement documented, concurrency max 2 constraint, Docker `restart` policy + HTTP healthcheck + postgres-init mount note. Removed stale `event` from §10.1 example. |
| 0.9 | 2026-03-21 | **No class, no wrapper.** Replaced `WorkflowContext` class with flat `WorkflowTools` object. Handler receives full Inngest args + DI additions merged in one flat object. |
| 1.0 | 2026-03-21 | **Implementation complete.** All 4 phases implemented and build passing. |

---

## Implementation Status

| Phase | Status | Date | Notes |
|-------|--------|------|-------|
| Phase 1 — Foundation | Done | 2026-03-21 | Package created, types inferred from SDK, generator produces output, build passes |
| Phase 2 — Docker | Done | 2026-03-21 | DevContainer, fullapp compose, postgres-init, setup-env.sh, .env.example |
| Phase 3 — Example Workflow | Done | 2026-03-21 | `example.todo-followup` workflow + subscriber trigger + convention file |
| Phase 4 — Documentation | Partial | 2026-03-21 | Spec complete; `packages/inngest/AGENTS.md` and root task router update pending |

### Implementation Notes
- Generator `configExpr` uses `Record<string, unknown>` casts; `buildOutput` uses `WorkflowEntryRaw` with `unknown` fields, cast at `wrapWorkflow` call site
- Convention files should export `default` (Turbopack static analysis requires it for `import *` pattern)
- `resolve()` generic type args don't survive the `WorkflowTools` inference chain — use `as` cast at call site instead
