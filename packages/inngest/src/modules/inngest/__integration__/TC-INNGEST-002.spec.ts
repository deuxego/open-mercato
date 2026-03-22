import { test, expect } from '@playwright/test'

/**
 * TC-INNGEST-002: Workflow send and execution
 *
 * Requires Inngest dev server running (provided automatically by ephemeral test environment).
 * Verifies the Inngest dev server is reachable and the serve route is functional.
 */
test.describe('Inngest Workflow Execution', () => {
  const inngestBaseUrl = process.env.INNGEST_BASE_URL

  test.skip(!inngestBaseUrl, 'Requires INNGEST_BASE_URL (Inngest dev server)')

  test('Inngest dev server is reachable', async () => {
    const response = await fetch(`${inngestBaseUrl}/`)
    expect(response.ok).toBe(true)
  })

  test('serve route is registered with Inngest dev server', async ({ request }) => {
    // PUT triggers function sync with Inngest server
    const response = await request.put('/api/inngest')
    // The SDK should respond (not 404) when Inngest server is available
    expect(response.status()).not.toBe(404)
  })
})
