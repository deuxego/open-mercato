# SPEC-069: Inngest Integration for Open Mercato

**Date:** 2026-03-21
**Status:** Draft
**Scope:** OSS

---

## TLDR

Integrate Inngest as an **optional** workflow orchestration layer for durable multi-step workflows (sleep, wait, fan-out, step-level retry). Inngest supplements — does not replace — the existing queue/events infrastructure. Lives in a standalone `packages/inngest/` package with zero residue when removed. Module-scoped workflows follow existing conventions (`workflows/*.ts` + `inngest.workflows.ts`). Self-hosted Inngest in Docker, env-driven switch to Cloud. Profile-gated — doesn't run unless explicitly enabled.

**Key concerns:** Event bridge loop prevention, tenant-scoped DI in long-running workflows, backward compatibility of new convention files, optional Docker infrastructure.

---

## 1. Overview

Open Mercato's current infrastructure handles two patterns well:

| Pattern | Mechanism |
|---------|-----------|
| Fire-and-forget background jobs | Workers (`workers/*.ts`) |
| Reactive side effects | Event subscribers (`subscribers/*.ts`) |

A third pattern — **durable, multi-step orchestrated workflows** — has no first-class support. Examples: invoice follow-up after N days, multi-step order fulfillment with conditional branching, data sync sagas with rollback.

Inngest provides step-level retry, sleep/wait primitives, fan-out, cancellation, and rate limiting — all with durable execution guarantees. By bridging the existing event bus to Inngest, workflows trigger from the same events that drive subscribers, maintaining a single source of truth for event emission.

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

```
Module code → eventBus.emit('A', payload)
    ├── Ephemeral subscribers (immediate)
    ├── SSE bridge (if clientBroadcast)
    └── Persistent subscribers (BullMQ events queue)
          ├── Existing subscribers (notifications, search, etc.)
          └── Inngest bridge subscriber (wildcard, persistent)
                ├── Skip if _inngestOrigin in payload
                ├── Skip if event not in registeredEvents
                └── inngest.send() → Inngest server → workflow executes
                      └── ctx.emit('B', data)
                            → bus.emit('B', {...data, _inngestOrigin: true})
                            → bridge sees _inngestOrigin → SKIPS
```

### 3.2 Separation of Concerns

| Need | Use | Location |
|------|-----|----------|
| Fire-and-forget job | Worker | `workers/*.ts` |
| React to event, single side effect | Subscriber | `subscribers/*.ts` |
| Multi-step durable workflow | Inngest function | `workflows/*.ts` + `inngest.workflows.ts` |

### 3.3 Design Decision: Bridge vs Direct Send

**Chosen:** Event bus bridge (wildcard persistent subscriber forwards matching events to Inngest).

**Alternative considered:** Direct `inngest.send()` at emit sites. Rejected because:
- Couples every emit call to Inngest awareness
- Breaks when Inngest package is removed (residue in core)
- Duplicates event routing logic

The bridge pattern keeps Inngest completely decoupled — it's just another persistent subscriber.

---

## 4. Package Structure

```
packages/inngest/
├── src/
│   ├── modules/
│   │   └── inngest/
│   │       ├── index.ts              # metadata: { id: 'inngest', version: '0.1.0' }
│   │       ├── generators.ts         # GeneratorPlugin: inngest.workflows convention
│   │       ├── di.ts                 # registers inngestClient, inngestRegisteredEvents, containerFactory
│   │       └── subscribers/
│   │           └── forward-to-inngest.ts   # persistent bridge subscriber
│   ├── client.ts                     # new Inngest({ id: 'open-mercato' })
│   ├── adapter.ts                    # wrapWorkflow(metadata, handler)
│   ├── context.ts                    # WorkflowContext class
│   ├── guards.ts                     # assertJsonSerializable (dev-only)
│   ├── container.ts                  # createScopedWorkflowContainer()
│   ├── types.ts                      # WorkflowMeta, WorkflowContext type
│   └── index.ts                      # public exports
├── package.json                      # deps: inngest; peerDeps: next, awilix
├── tsconfig.json
└── AGENTS.md
```

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

```typescript
// packages/inngest/src/context.ts
import { AsyncLocalStorage } from 'node:async_hooks'

const stepScopeStorage = new AsyncLocalStorage<AwilixContainer>()

export class WorkflowContext {
  private emitCounter = 0

  constructor(
    private inngestStep: InngestStep,
    private container: AwilixContainer
  ) {}

  resolve<T>(name: string): T {
    const scope = stepScopeStorage.getStore()
    if (!scope) {
      throw new Error('ctx.resolve() called outside a step.')
    }
    return scope.resolve<T>(name)
  }

  async step<T>(id: string, fn: () => Promise<T>): Promise<T> {
    return this.inngestStep.run(id, async () => {
      return stepScopeStorage.run(this.container, async () => {
        const result = await fn()
        if (process.env.NODE_ENV === 'development') {
          assertJsonSerializable(result, id)
        }
        return result
      })
    })
  }

  async sleep(id: string, duration: string): Promise<void> {
    return this.inngestStep.sleep(id, duration)
  }

  async waitForEvent(
    id: string,
    opts: WaitForEventOpts
  ): Promise<Record<string, unknown> | null> {
    return this.inngestStep.waitForEvent(id, opts)
  }

  async emit(name: string, data: Record<string, unknown>): Promise<void> {
    const stepId = `emit:${name}:${this.emitCounter++}`
    await this.step(stepId, async () => {
      const eventBus = this.resolve<EventBus>('eventBus')
      await eventBus.emit(name, { ...data, _inngestOrigin: true })
      return { _emitted: true }
    })
  }
}
```

**Constraints:**
- `resolve()` only inside `step()` — runtime error otherwise
- Step return values must be JSON-serializable — `assertJsonSerializable()` in dev mode
- Never return MikroORM entities from steps — use `wrap(entity).toObject()` or explicit plain objects
- Use `findOneWithDecryption` / `findWithDecryption`, never raw `em.find()`
- `emit()` step ID auto-increments — safe for repeated calls with same event name
- `waitForEvent` returns `null` on timeout — type makes this explicit

---

## 8. Adapter

```typescript
// packages/inngest/src/adapter.ts
import { NonRetriableError } from 'inngest'

export function wrapWorkflow(metadata: WorkflowMeta, handler: WorkflowHandler) {
  return inngest.createFunction(
    {
      id: metadata.id,
      retries: metadata.retries ?? 3,
      concurrency: metadata.concurrency ?? {
        limit: 1,
        key: 'event.data.organizationId',
      },
      cancelOn: metadata.cancelOn,
      ...(metadata.debounce && { debounce: metadata.debounce }),
      ...(metadata.rateLimit && { rateLimit: metadata.rateLimit }),
    },
    { event: metadata.event },
    async ({ event, step }) => {
      if (!event.data.organizationId || !event.data.tenantId) {
        throw new NonRetriableError(
          `Workflow "${metadata.id}" requires organizationId and tenantId in event payload`
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

**Auto-injected defaults:**
- `retries: 3` if not specified
- `concurrency: { limit: 1, key: 'event.data.organizationId' }` if not specified — prevents noisy-tenant monopolization
- `organizationId` + `tenantId` validation — `NonRetriableError` if missing (stops infinite retry)

---

## 9. Event Bridge

### 9.1 Events Worker Fix (Prerequisite)

The persistent events worker uses exact-match lookup (`Map.get(event)`). Wildcard patterns don't fire. Fix:

```typescript
// packages/events/src/modules/events/workers/events.worker.ts
// Replace: const subscribers = listeners.get(event)
// With:
const subscribers: SubscriberEntry[] = []
for (const [pattern, subs] of listeners) {
  if (matchEventPattern(event, pattern)) {
    subscribers.push(...subs)
  }
}
```

~5-line change. Aligns persistent dispatch with ephemeral dispatch (which already supports wildcards via `matchEventPattern` in `packages/events/src/bus.ts`).

### 9.2 Bridge Subscriber

```typescript
// packages/inngest/src/modules/inngest/subscribers/forward-to-inngest.ts
export const metadata = {
  event: '*',
  persistent: true,
  id: 'inngest.bridge.forward',
}

export default async function handler(
  payload: EventPayload,
  ctx: SubscriberContext
) {
  const registeredEvents = ctx.resolve<Set<string>>('inngestRegisteredEvents')
  if (!ctx.eventName || !registeredEvents.has(ctx.eventName)) return

  const { _inngestOrigin, ...cleanPayload } = payload as Record<string, unknown>
  if (_inngestOrigin) return

  const inngestClient = ctx.resolve<Inngest>('inngestClient')
  await inngestClient.send({ name: ctx.eventName, data: cleanPayload })
}
```

**Properties:**
- At-least-once delivery — BullMQ retries on failure
- Selective — only forwards events with matching workflows
- Loop-safe — checks and strips `_inngestOrigin` (never leaks to storage/SSE)
- Auto-removed — lives in `packages/inngest/`, disappears when package deleted

### 9.3 Inside Workflows

```typescript
// Emit to the Mercato bus (subscribers, SSE, persistent handlers)
await ctx.emit('orders.order.fulfilled', { orderId, organizationId, tenantId })

// Inngest-only coordination (rare — use raw Inngest step API)
await step.sendEvent('internal.saga-phase-2', { data: { ... } })
```

One primary method (`ctx.emit`). Raw `step.sendEvent()` for Inngest-internal coordination — intentionally ugly to discourage misuse.

---

## 10. Discovery & Registration

### 10.1 Workflow Files

```typescript
// packages/core/src/modules/orders/workflows/invoice-followup.ts
export const metadata: WorkflowMeta = {
  id: 'orders.invoice-followup',
  event: 'orders.invoice.created',
  retries: 3,
  concurrency: { limit: 5, key: 'event.data.organizationId' },
  cancelOn: [{ event: 'orders.invoice.paid', match: 'data.invoiceId' }],
}

export default async function handler(
  payload: InvoiceCreatedPayload,
  ctx: WorkflowContext
) {
  await ctx.sleep('wait-3-days', '3d')

  const invoice = await ctx.step('check-payment', async () => {
    const em = ctx.resolve<EntityManager>('em')
    const entity = await findOneWithDecryption(em, Invoice, { id: payload.invoiceId })
    return { paid: entity.status === 'paid' }
  })

  if (invoice.paid) return

  await ctx.step('send-reminder', async () => {
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
export const registeredEvents = new Set(entries.map(e => (e.metadata as any).event as string))
`,

  bootstrapRegistration: {
    entriesExportName: 'registeredEvents',
    registrationImports: [
      `import { registerInngestBridge } from '@open-mercato/inngest'`,
    ],
    buildCall: (name) => `registerInngestBridge(${name})`,
  },
}]
```

### 10.4 Serve Route

```typescript
// apps/mercato/src/app/api/inngest/route.ts
import { serve } from 'inngest/next'
import { inngest } from '@open-mercato/inngest'
import { functions } from '@/.mercato/generated/inngest-workflows.generated'

if (process.env.INNGEST_DEV === '1' && process.env.NODE_ENV !== 'development') {
  console.error('FATAL: INNGEST_DEV=1 is not allowed outside development')
  process.exit(1)
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

Workspace service additions:
```yaml
depends_on:
  inngest:
    condition: service_started
environment:
  INNGEST_DEV: '1'
  INNGEST_BASE_URL: 'http://inngest:8288'
```

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
docker run --rm inngest/inngest:latest which curl
```

Pin to verified tag after confirming.

---

## 12. Types

```typescript
type WorkflowMeta = {
  id: string
  event: string
  retries?: number
  concurrency?: { limit: number; key: string }
  cancelOn?: Array<{ event: string; match?: string }>
  debounce?: { period: string; key?: string }
  rateLimit?: { limit: number; period: string; key?: string }
}

type WorkflowHandler = (
  payload: unknown,
  ctx: WorkflowContext
) => Promise<void>
```

---

## 13. Module Registration

```typescript
// apps/mercato/src/modules.ts
{ id: 'inngest', from: '@open-mercato/inngest' }
```

Conditional enablement (optional):
```typescript
if (parseBooleanWithDefault(process.env.OM_ENABLE_INNGEST, false)) {
  enabledModules.push({ id: 'inngest', from: '@open-mercato/inngest' })
}
```

---

## 14. Documented Constraints

| Constraint | Enforced By |
|-----------|-------------|
| `ctx.resolve()` only inside `ctx.step()` | Runtime error |
| Step return values JSON-serializable | `assertJsonSerializable()` in dev |
| Never return MikroORM entities from steps | Runtime guard + docs |
| Mandatory `organizationId` + `tenantId` in event payload | `NonRetriableError` in `wrapWorkflow` |
| Per-tenant concurrency key | Auto-injected default in `wrapWorkflow` |
| Use `findOneWithDecryption` not `em.find()` | Docs + code review |
| `INNGEST_DEV=1` blocked outside development | Serve route startup guard |
| Steps must be idempotent | Docs (same as workers) |
| Event payloads: IDs not PII | Docs |
| `_inngestOrigin` stripped before forwarding | Bridge subscriber strips it |
| Convention file `inngest.workflows.ts` is FROZEN once shipped | BC contract |

---

## 15. Removability

1. **Remove module registration** — Delete `{ id: 'inngest' }` from `apps/mercato/src/modules.ts`
2. **Remove workflow files** — Delete all `inngest.workflows.ts` and `workflows/` directories
3. **Remove serve endpoint** — Delete `apps/mercato/src/app/api/inngest/`
4. **Regenerate** — `yarn generate` + remove `inngest-workflows.generated.ts`
5. **Remove package** — `rm -rf packages/inngest/` + `yarn install`
6. **Verify** — `yarn build` (find any missed references)
7. **Infrastructure cleanup** — Remove Inngest from Docker, env files, postgres-init

**Zero residue in core packages** (except the ~5-line wildcard fix in events worker, which is a general improvement).

---

## 16. Implementation Phases

### Phase 1 — Foundation
1. Create `packages/inngest/` with `client.ts`, `adapter.ts`, `context.ts`, `container.ts`, `types.ts`, `guards.ts`
2. Add module with `index.ts`, `di.ts`, `generators.ts`
3. Add serve route in `apps/mercato/src/app/api/inngest/route.ts`
4. Add to `modules.ts` (env-gated)
5. Run `yarn generate`, verify build

### Phase 2 — Event Bridge
1. Fix events worker wildcard support (~5 lines in `events.worker.ts`)
2. Add `forward-to-inngest.ts` persistent subscriber
3. Add `_inngestOrigin` loop prevention
4. Verify bridge forwards events to Inngest dev server

### Phase 3 — Docker
1. Verify Inngest Docker image (pull, inspect, run)
2. Add service to all compose stacks (profile-gated)
3. Update `devcontainer.json`, `setup-env.sh`, `.env.example`
4. Add PostgreSQL init for inngest database

### Phase 4 — Example Workflow
1. Create example workflow in `packages/core/src/modules/example/`
2. Create `inngest.workflows.ts` convention file
3. End-to-end test: emit event → bridge → Inngest → workflow executes → `ctx.emit` back

### Phase 5 — Documentation
1. AGENTS.md updates (decision tree, task router row)
2. `packages/inngest/AGENTS.md` (workflow authoring guide)
3. Workflow constraints and patterns

---

## 17. Integration Test Coverage

| Path | Test |
|------|------|
| `POST /api/inngest` | Serve route responds to Inngest SDK introspection |
| Event → bridge → Inngest | Emit event, verify Inngest receives it |
| Workflow step execution | Trigger workflow, verify step runs with tenant-scoped DI |
| `ctx.emit()` back to bus | Workflow emits, verify subscriber fires, bridge doesn't loop |
| `cancelOn` | Trigger workflow with sleep, emit cancel event, verify workflow stops |
| Inngest down | Emit event, verify bridge retries via BullMQ |
| Missing `organizationId` | Send event without org, verify `NonRetriableError` |

---

## 18. Risks & Impact Review

### Risk Register

| # | Scenario | Severity | Affected Area | Mitigation | Residual Risk |
|---|----------|----------|---------------|------------|---------------|
| R1 | Event bridge infinite loop — workflow emits event that re-triggers itself | **Critical** | Event bus, Inngest | `_inngestOrigin` flag checked and stripped by bridge subscriber | Low — flag is checked before any forwarding; stripped before persistence |
| R2 | Inngest server down — bridge subscriber fails to forward | **High** | Event delivery | BullMQ retry (persistent subscriber); at-least-once delivery | Medium — events queue during outage; burst on recovery |
| R3 | Tenant data leak via shared container | **High** | Tenant isolation | `createScopedWorkflowContainer` sets MikroORM filter params; `organizationId`/`tenantId` required or `NonRetriableError` | Low — same isolation pattern as request containers |
| R4 | Non-serializable step return corrupts Inngest state | **Medium** | Workflow execution | `assertJsonSerializable()` guard in dev; runtime docs | Medium — only enforced in dev; prod relies on developer discipline |
| R5 | Wildcard subscriber performance — iterating all patterns per event | **Medium** | Events worker | `registeredEvents` Set check filters before forwarding; pattern iteration is O(n) over subscriber count (typically <100) | Low |
| R6 | `process.exit(1)` in serve route crashes entire Next.js process | **Medium** | App stability | Only triggers on `INNGEST_DEV=1` + non-development `NODE_ENV` — a clear misconfiguration | Low — consider `throw` instead of `process.exit` |
| R7 | Convention file `inngest.workflows.ts` becomes BC burden | **Low** | Maintainability | Follows existing `security.mfa-providers.ts` precedent; FROZEN classification explicit | Low |

### Cascading Failure Analysis

- **Inngest server crash:** Bridge subscriber retries via BullMQ → events queue up → burst-process on recovery. No data loss. Existing subscribers unaffected (separate dispatch).
- **Bridge subscriber crash:** BullMQ retries the job. Other persistent subscribers for the same event are independent (separate job per subscriber).
- **Workflow step failure:** Inngest retries only the failed step (memoized prior steps). After exhausting retries, workflow marked as failed in Inngest dashboard.

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 0.1 | 2026-03-21 | Initial draft |
