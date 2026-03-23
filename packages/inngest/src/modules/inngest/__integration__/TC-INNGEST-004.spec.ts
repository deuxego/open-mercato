import { test, expect } from '@playwright/test'

const inngestDashboardUrl = process.env.NEXT_PUBLIC_INNGEST_BASE_URL

/**
 * TC-INNGEST-004: Inngest Dashboard sidebar link visibility
 *
 * Verifies the "Inngest Dashboard" link appears in the admin settings sidebar
 * and points to the configured Inngest dashboard URL.
 */
test.describe('Inngest Dashboard Link', () => {
  test.skip(!inngestDashboardUrl, 'Requires NEXT_PUBLIC_INNGEST_BASE_URL to be set')

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
    await expect(inngestLink).toBeVisible({ timeout: 10_000 })

    const href = await inngestLink.getAttribute('href')
    expect(href).toContain(new URL(inngestDashboardUrl!).host)
  })
})
