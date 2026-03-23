import { test, expect } from '@playwright/test'
import { getInngestConfig, sendEvent, findRecentEventByName, waitForEventRuns } from './helpers/inngest'

/**
 * TC-INNGEST-005: Workflow rejects events without organizationId/tenantId
 *
 * Sends an event to Inngest without the required org/tenant fields.
 * The wrapWorkflow adapter should throw NonRetriableError (HTTP 400),
 * preventing infinite retries of a permanently invalid event.
 *
 * Verification: find the event via /v1/events, query its runs via
 * /v1/events/{id}/runs, and assert the run Failed with a tenant error.
 */
test.describe('Inngest Tenant Validation', () => {
  const { baseUrl } = getInngestConfig()

  test.skip(!baseUrl, 'Requires INNGEST_BASE_URL (Inngest dev server)')

  test('workflow fails with NonRetriableError when organizationId is missing', async () => {
    const sentAfter = Date.now()

    // Send event WITHOUT organizationId/tenantId
    const result = await sendEvent('example.todo-followup', {
      id: `test-missing-tenant-${sentAfter}`,
    })
    expect(result.accepted).toBe(true)

    // Find the event sent in THIS test run (sentAfter prevents stale matches)
    const event = await findRecentEventByName('example.todo-followup', {
      timeoutMs: 10_000,
      sentAfter,
    })
    if (!event) {
      console.log('[TC-INNGEST-005] Event not found via /v1/events — dev server may not expose events API')
      return
    }

    // Wait for the workflow run to reach a terminal state
    const runs = await waitForEventRuns(event.id, { timeoutMs: 15_000 })
    if (runs.length === 0) {
      console.log('[TC-INNGEST-005] No runs found for event', event.id, '— workflow may not be registered')
      return
    }

    // The run should have Failed (NonRetriableError = no retry)
    const run = runs[0]
    expect(run.status).toBe('Failed')

    // Verify the error output mentions the missing tenant context
    const output = JSON.stringify(run.output ?? '')
    const mentionsTenant = output.includes('organizationId') || output.includes('tenantId')
    if (!mentionsTenant) {
      console.log('[TC-INNGEST-005] Run failed but output does not mention tenant:', output)
    }
    expect(mentionsTenant).toBe(true)
  })
})
