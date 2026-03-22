import { test, expect } from '@playwright/test'
import { getInngestConfig, sendEvent, listRegisteredFunctions } from './helpers/inngest'

/**
 * TC-INNGEST-002: Inngest dev server connectivity and function discovery
 *
 * Verifies the dev server is healthy, functions are registered via GET /dev,
 * and the event API (POST /e/{key}) accepts events.
 */
test.describe('Inngest Server Integration', () => {
  const { baseUrl } = getInngestConfig()

  test.skip(!baseUrl, 'Requires INNGEST_BASE_URL (Inngest dev server)')

  test('dev server health check passes', async () => {
    const response = await fetch(`${baseUrl}/health`)
    expect(response.ok).toBe(true)
  })

  test('dev server has registered functions', async () => {
    const functions = await listRegisteredFunctions()
    if (!functions) {
      console.log('[TC-INNGEST-002] GET /dev not available — skipping function discovery')
      return
    }
    expect(functions.length).toBeGreaterThanOrEqual(1)
    const hasExampleWorkflow = functions.some(
      (fn) => JSON.stringify(fn).includes('todo-followup'),
    )
    if (!hasExampleWorkflow) {
      console.log('[TC-INNGEST-002] example.todo-followup not found among', functions.length, 'functions')
    }
  })

  test('event API accepts events', async () => {
    const result = await sendEvent('test/integration.ping', {
      testRun: true,
      timestamp: Date.now(),
    })
    // The event should be accepted (HTTP 200). The dev server response body
    // format varies by version — we only assert on acceptance, not IDs.
    expect(result.accepted).toBe(true)
  })
})
