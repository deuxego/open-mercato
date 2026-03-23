/**
 * Shared helpers for Inngest dev server integration tests.
 *
 * The dev server (port 8288) exposes:
 *   GET  /health                       — health check
 *   GET  /dev                          — registered functions + SDK info
 *   POST /e/{key}                      — send events
 *   GET  /v1/events                    — list events (?name=&limit=)
 *   GET  /v1/events/{eventID}/runs     — list runs triggered by an event
 *   GET  /v1/runs/{runID}             — get a single run
 *   POST /v0/gql                       — GraphQL API
 *
 * NOTE: There is NO /v1/runs list endpoint and NO /v1/functions endpoint.
 * NOTE: The event send response format varies by server version — do not
 *       rely on `ids` being present. Use findRecentEventByName() instead.
 */

export function getInngestConfig() {
  const baseUrl = process.env.INNGEST_BASE_URL
  const eventKey = process.env.INNGEST_EVENT_KEY ?? 'deadbeef00000000'
  return { baseUrl, eventKey }
}

/**
 * Safely fetch JSON from the dev server. Returns null if response is
 * non-JSON, non-2xx, or the request fails (the dev server sometimes
 * returns HTML for paths it doesn't recognise).
 */
export async function fetchDevServerJson(url: string): Promise<unknown> {
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.includes('json')) return null
    return await response.json()
  } catch {
    return null
  }
}

/**
 * Send an event to the Inngest dev server.
 * Returns the HTTP status. Does NOT guarantee event IDs in the response
 * (the dev server format varies). Use findRecentEventByName() to locate
 * sent events.
 */
export async function sendEvent(
  name: string,
  data: Record<string, unknown>,
): Promise<{ status: number; accepted: boolean }> {
  const { baseUrl, eventKey } = getInngestConfig()
  if (!baseUrl) throw new Error('INNGEST_BASE_URL is not set')

  const response = await fetch(`${baseUrl}/e/${eventKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, data }),
  })

  // Drain the response body to avoid resource leaks in tight polling loops
  await response.text().catch(() => {})

  return {
    status: response.status,
    accepted: response.ok,
  }
}

export type InngestEvent = {
  id: string
  name: string
  received_at?: string
  [key: string]: unknown
}

export type InngestRun = {
  run_id: string
  status: string
  function_id?: string
  event_id?: string
  output?: unknown
  ended_at?: string | null
  [key: string]: unknown
}

/**
 * Poll `GET /v1/events?name={name}` until an event with the given name
 * appears that was sent after `sentAfter` (epoch ms). Returns the event or null.
 *
 * The `sentAfter` filter prevents matching stale events from previous test runs.
 */
export async function findRecentEventByName(
  name: string,
  options?: { timeoutMs?: number; intervalMs?: number; sentAfter?: number },
): Promise<InngestEvent | null> {
  const { baseUrl } = getInngestConfig()
  if (!baseUrl) throw new Error('INNGEST_BASE_URL is not set')

  const timeout = options?.timeoutMs ?? 10_000
  const interval = options?.intervalMs ?? 1_000
  const sentAfter = options?.sentAfter ?? 0
  const deadline = Date.now() + timeout

  while (Date.now() < deadline) {
    const body = await fetchDevServerJson(
      `${baseUrl}/v1/events?name=${encodeURIComponent(name)}&limit=10`,
    )
    if (body && typeof body === 'object') {
      const events = (body as { data?: InngestEvent[] }).data
        ?? (Array.isArray(body) ? body as InngestEvent[] : [])
      // Find the most recent event that was sent after our timestamp
      const match = events.find((e) => {
        if (!e.id) return false
        if (sentAfter && e.received_at) {
          return new Date(e.received_at).getTime() >= sentAfter
        }
        return true
      })
      if (match) return match
    }
    await new Promise((resolve) => setTimeout(resolve, interval))
  }

  return null
}

/**
 * Poll `GET /v1/events/{eventId}/runs` until at least one run reaches
 * a terminal status (Completed, Failed, Cancelled) or the timeout expires.
 */
export async function waitForEventRuns(
  eventId: string,
  options?: { timeoutMs?: number; intervalMs?: number },
): Promise<InngestRun[]> {
  const { baseUrl } = getInngestConfig()
  if (!baseUrl) throw new Error('INNGEST_BASE_URL is not set')

  const timeout = options?.timeoutMs ?? 15_000
  const interval = options?.intervalMs ?? 1_000
  const deadline = Date.now() + timeout

  const terminalStatuses = new Set(['Completed', 'Failed', 'Cancelled'])

  while (Date.now() < deadline) {
    const body = await fetchDevServerJson(`${baseUrl}/v1/events/${eventId}/runs`)
    if (body && typeof body === 'object') {
      const runs = (body as { data?: InngestRun[] }).data
        ?? (Array.isArray(body) ? body as InngestRun[] : [])
      if (runs.length > 0 && runs.some((r) => terminalStatuses.has(r.status))) {
        return runs
      }
    }
    await new Promise((resolve) => setTimeout(resolve, interval))
  }

  return []
}

/**
 * Query `GET /dev` to list registered functions from the dev server.
 * Returns the functions array or null if unavailable.
 */
export async function listRegisteredFunctions(): Promise<Array<{ name?: string; id?: string; slug?: string; [key: string]: unknown }> | null> {
  const { baseUrl } = getInngestConfig()
  if (!baseUrl) throw new Error('INNGEST_BASE_URL is not set')

  const body = await fetchDevServerJson(`${baseUrl}/dev`)
  if (!body || typeof body !== 'object') return null

  const devInfo = body as { Functions?: unknown[]; functions?: unknown[] }
  const functions = devInfo.Functions ?? devInfo.functions
  if (!Array.isArray(functions)) return null

  return functions as Array<{ name?: string; id?: string; slug?: string; [key: string]: unknown }>
}
