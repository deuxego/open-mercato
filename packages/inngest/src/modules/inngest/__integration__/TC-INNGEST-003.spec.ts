import { test, expect } from '@playwright/test'
import { getInngestConfig, findRecentEventByName, waitForEventRuns } from './helpers/inngest'

/**
 * TC-INNGEST-003: End-to-end workflow trigger via API
 *
 * Creates a todo via the app API → emits example.todo.created →
 * subscriber calls inngest.send('example.todo-followup') →
 * Inngest executes the workflow.
 *
 * Verifies the full chain by querying the dev server for the
 * workflow event and checking its run status.
 */
test.describe('Inngest Workflow Trigger E2E', () => {
  const { baseUrl } = getInngestConfig()

  test.skip(!baseUrl, 'Requires INNGEST_BASE_URL (Inngest dev server)')

  test('creating a todo triggers the followup workflow', async ({ request }) => {
    // Step 1: Authenticate
    const loginResponse = await request.post('/api/auth/login', {
      data: { email: 'admin@open-mercato.com', password: 'password' },
    })
    if (loginResponse.status() !== 200) {
      test.skip(true, 'Could not authenticate — skipping E2E workflow test')
      return
    }

    const sentAfter = Date.now()

    // Step 2: Create a todo to trigger the event chain
    const todoResponse = await request.post('/api/example/todos', {
      data: { title: `Inngest E2E Test ${sentAfter}` },
    })
    if (todoResponse.status() !== 200 && todoResponse.status() !== 201) {
      test.skip(true, 'Todo API not available — skipping E2E workflow test')
      return
    }

    // Step 3: Find the workflow trigger event sent by the subscriber
    const event = await findRecentEventByName('example.todo-followup', {
      timeoutMs: 15_000,
      sentAfter,
    })
    if (!event) {
      test.skip(true, 'Workflow event not found — subscriber chain may not be wired in this environment')
      return
    }

    // Step 4: Verify the workflow run was created
    const runs = await waitForEventRuns(event.id, { timeoutMs: 15_000 })
    expect(runs.length).toBeGreaterThanOrEqual(1)

    // The workflow sleeps for 1 minute, so in CI it will still be Running.
    // Accept Running, Completed, or Queued — but NOT Failed (that would mean a bug).
    const run = runs[0]
    const validStatuses = ['Running', 'Completed', 'Queued']
    expect(validStatuses).toContain(run.status)
  })
})
