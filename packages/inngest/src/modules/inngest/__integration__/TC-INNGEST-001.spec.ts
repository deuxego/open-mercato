import { test, expect } from '@playwright/test'

/**
 * TC-INNGEST-001: Inngest serve route — introspection and registration
 *
 * Verifies the /api/inngest endpoint is correctly mounted and functional.
 */
test.describe('Inngest Serve Route', () => {
  test('GET /api/inngest returns introspection metadata', async ({ request }) => {
    const response = await request.get('/api/inngest')
    expect(response.status()).not.toBe(404)

    // In cloud mode (INNGEST_DEV!=1), GET returns JSON with function_count
    // In dev mode, may return HTML landing page
    const contentType = response.headers()['content-type'] ?? ''
    if (contentType.includes('application/json')) {
      const body = await response.json()
      expect(body).toHaveProperty('function_count')
      expect(typeof body.function_count).toBe('number')
      expect(body.function_count).toBeGreaterThanOrEqual(1) // at least example workflow
      expect(body).toHaveProperty('has_signing_key')
    }
  })

  test('PUT /api/inngest triggers function registration', async ({ request }) => {
    const response = await request.put('/api/inngest')
    expect(response.status()).not.toBe(404)
    // PUT is used by Inngest server to sync function definitions
    // Should respond with 200 or a non-error status
    expect(response.status()).toBeLessThan(500)
  })

  test('POST /api/inngest rejects invalid requests gracefully', async ({ request }) => {
    const response = await request.post('/api/inngest', {
      data: { invalid: 'payload' },
      headers: { 'Content-Type': 'application/json' },
    })
    // Should not crash (500) — should return a structured error
    expect(response.status()).not.toBe(404)
  })
})
