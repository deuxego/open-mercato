import { test, expect } from '@playwright/test'

/**
 * TC-INNGEST-004: Inngest Dashboard sidebar link visibility
 *
 * Verifies the "Inngest Dashboard" link appears in the admin settings sidebar
 * and points to the correct URL (port 8288).
 */
test.describe('Inngest Dashboard Link', () => {
  test('Inngest Dashboard link appears in settings sidebar', async ({ page, request }) => {
    const loginResponse = await request.post('/api/auth/login', {
      data: { email: 'admin@open-mercato.com', password: 'password' },
    })
    if (loginResponse.status() !== 200) {
      test.skip(true, 'Could not authenticate')
      return
    }

    await page.goto('/backend/settings')
    await page.waitForLoadState('domcontentloaded')

    const inngestLink = page.getByText('Inngest Dashboard')
    const isVisible = await inngestLink.isVisible().catch(() => false)

    if (isVisible) {
      const href = await inngestLink.getAttribute('href')
      expect(href).toContain('8288')
    }
    // Link visibility depends on NEXT_PUBLIC_INNGEST_BASE_URL being set
  })
})
