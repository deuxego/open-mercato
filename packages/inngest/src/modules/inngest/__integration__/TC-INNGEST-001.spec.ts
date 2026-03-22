import { test, expect } from '@playwright/test'

/**
 * TC-INNGEST-001: Inngest serve route responds to SDK introspection
 *
 * Verifies that the /api/inngest endpoint is registered and responds
 * to GET requests (Inngest SDK introspection/landing page).
 */
test.describe('Inngest Serve Route', () => {
  test('GET /api/inngest is reachable', async ({ request }) => {
    const response = await request.get('/api/inngest')
    // Inngest SDK serve() returns 200 in dev mode (with INNGEST_DEV=1)
    // or may return 500 without signing key configuration.
    // Either way, the route exists and responds (not 404).
    expect(response.status()).not.toBe(404)
  })

  test('PUT /api/inngest is reachable', async ({ request }) => {
    const response = await request.put('/api/inngest')
    // PUT triggers function registration with Inngest server.
    // Without a running server, response varies — but route exists.
    expect(response.status()).not.toBe(404)
  })
})
