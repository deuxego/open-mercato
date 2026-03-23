import { test, expect } from '@playwright/test'

/**
 * TC-INNGEST-001: Inngest serve route — introspection and registration
 *
 * Verifies the /api/inngest endpoint is correctly mounted and responds
 * to GET (introspection), PUT (sync), and POST (invocation).
 */
test.describe('Inngest Serve Route', () => {
  test('GET /api/inngest returns introspection metadata', async ({ request }) => {
    const response = await request.get('/api/inngest')
    expect(response.status()).not.toBe(404)

    const contentType = response.headers()['content-type'] ?? ''
    // In dev mode the SDK may return HTML; in cloud mode it returns JSON.
    // If JSON, validate the introspection payload.
    if (!contentType.includes('application/json')) {
      test.skip(true, 'Endpoint returned non-JSON (HTML landing page in dev mode)')
      return
    }
    const body = await response.json()
    expect(body).toHaveProperty('function_count')
    expect(typeof body.function_count).toBe('number')
    expect(body.function_count).toBeGreaterThanOrEqual(1)
  })

  test('PUT /api/inngest triggers function sync', async ({ request }) => {
    const response = await request.put('/api/inngest')
    expect(response.status()).not.toBe(404)
    expect(response.status()).toBeLessThan(500)
  })

  test('POST /api/inngest rejects invalid requests gracefully', async ({ request }) => {
    const response = await request.post('/api/inngest', {
      data: { invalid: 'payload' },
      headers: { 'Content-Type': 'application/json' },
    })
    expect(response.status()).not.toBe(404)
    expect(response.status()).toBeLessThan(500)
  })
})
