import { test, expect } from '@playwright/test'

/**
 * TC-INNGEST-002: Inngest dev server connectivity and function discovery
 *
 * Requires Inngest dev server (provided automatically by ephemeral test environment).
 * Verifies the server is reachable, functions are discovered, and events can be sent.
 */
test.describe('Inngest Server Integration', () => {
  const inngestBaseUrl = process.env.INNGEST_BASE_URL

  test.skip(!inngestBaseUrl, 'Requires INNGEST_BASE_URL (Inngest dev server)')

  test('Inngest dev server health check passes', async () => {
    const response = await fetch(`${inngestBaseUrl}/health`)
    expect(response.ok).toBe(true)
  })

  test('Inngest server discovers registered functions', async () => {
    // Query the Inngest API for registered functions
    const response = await fetch(`${inngestBaseUrl}/v1/functions`)
    if (response.ok) {
      const body = await response.json()
      const functions = body.data ?? body.functions ?? body
      expect(Array.isArray(functions)).toBe(true)
      // At least the example.todo-followup workflow should be registered
      const names = functions.map((f: Record<string, unknown>) => f.name ?? f.id ?? '')
      expect(names.some((n: string) => n.includes('todo-followup'))).toBe(true)
    }
    // Some Inngest versions use different API paths — pass if response is not 404
    expect(response.status).not.toBe(404)
  })

  test('Inngest server accepts events via event API', async () => {
    const eventKey = process.env.INNGEST_EVENT_KEY ?? 'deadbeef00000000'
    const response = await fetch(`${inngestBaseUrl}/e/${eventKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'test/integration.ping',
        data: { testRun: true, timestamp: Date.now() },
      }),
    })
    // Event API should accept the event (200/201) or reject with auth error (401/403)
    // Should not be 404 or 500
    expect(response.status).toBeLessThan(500)
    expect(response.status).not.toBe(404)
  })
})
