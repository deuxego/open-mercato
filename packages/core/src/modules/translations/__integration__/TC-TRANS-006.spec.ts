import { expect, test, type Locator, type Page } from '@playwright/test'
import { apiRequest, getAuthToken } from '@open-mercato/core/modules/core/__integration__/helpers/api'
import {
  createDictionaryFixture,
  createDictionaryEntryFixture,
  deleteDictionaryEntryIfExists,
  deleteDictionaryIfExists,
} from '@open-mercato/core/modules/core/__integration__/helpers/dictionariesFixtures'
import { login } from '@open-mercato/core/modules/core/__integration__/helpers/auth'
import { deleteTranslationIfExists, getLocales, setLocales } from './helpers/translationFixtures'

const ENTITY_TYPE = 'dictionaries:dictionary_entry'

async function fillCombobox(page: Page, placeholder: string, value: string) {
  const input = page.getByPlaceholder(placeholder)
  await expect(input).toBeEnabled({ timeout: 30_000 })
  await input.click()
  await input.fill(value)
  await input.press('Enter')
  await input.press('Tab')
  await page.waitForTimeout(300)
}

async function waitForTranslationField(container: Locator, preferredPlaceholder?: string): Promise<Locator> {
  const fieldLocator = container.locator('table').locator('input, textarea')
  await expect.poll(async () => fieldLocator.count(), {
    message: 'Expected at least one translation input to be available',
    timeout: 45_000,
  }).toBeGreaterThan(0)
  const firstEditableField = fieldLocator.first()
  await expect(firstEditableField).toBeVisible()
  await expect(firstEditableField).toBeEnabled()

  const normalizedPlaceholder = preferredPlaceholder?.trim()
  if (!normalizedPlaceholder) return firstEditableField

  const preferredField = container.getByPlaceholder(normalizedPlaceholder).first()
  if (await preferredField.count()) {
    if (await preferredField.isVisible()) return preferredField
  }

  return firstEditableField
}

/**
 * TC-TRANS-006: Translation Entry and Save via Standalone Manager
 * Covers entering translations in the standalone manager, saving, and verifying persistence via API.
 * (Adapted from the original product-detail drawer test to use the standalone
 * Translation Manager on /backend/config/translations with dictionary entries.)
 */
test.describe('TC-TRANS-006: Translation Entry and Save via Standalone Manager', () => {
  test.use({ actionTimeout: 30_000 })

  test('should show translation manager with save button after selecting entity and record', async ({ page, request }) => {
    const adminToken = await getAuthToken(request, 'admin')
    const originalLocales = await getLocales(request, adminToken)
    const dictKey = `qa-trans-006-1-${Date.now()}`
    let dictionaryId: string | null = null
    let entryId: string | null = null

    try {
      await setLocales(request, adminToken, [...new Set([...originalLocales, 'de'])])
      dictionaryId = await createDictionaryFixture(request, adminToken, { key: dictKey, name: `QA TC-TRANS-006-1 ${Date.now()}` })
      entryId = await createDictionaryEntryFixture(request, adminToken, dictionaryId, { value: dictKey, label: `Label ${Date.now()}` })

      await login(page, 'superadmin')
      await page.goto('/backend/config/translations')
      await expect(page.getByRole('heading', { name: 'Translations' })).toBeVisible()

      await fillCombobox(page, 'Select an entity', ENTITY_TYPE)
      await fillCombobox(page, 'Search records...', entryId!)

      await expect(page.getByRole('button', { name: 'Save translations' })).toBeVisible()
    } finally {
      await deleteDictionaryEntryIfExists(request, adminToken, dictionaryId, entryId)
      await deleteDictionaryIfExists(request, adminToken, dictionaryId)
      await setLocales(request, adminToken, originalLocales).catch(() => {})
    }
  })

  test('should enter and save a translation in the standalone manager', async ({ page, request }) => {
    const adminToken = await getAuthToken(request, 'admin')
    const saToken = await getAuthToken(request, 'superadmin')
    const originalLocales = await getLocales(request, adminToken)
    const dictKey = `qa-trans-006-2-${Date.now()}`
    const entryLabel = `Label ${Date.now()}`
    let dictionaryId: string | null = null
    let entryId: string | null = null

    try {
      await setLocales(request, adminToken, [...new Set([...originalLocales, 'de'])])
      dictionaryId = await createDictionaryFixture(request, adminToken, { key: dictKey, name: `QA TC-TRANS-006-2 ${Date.now()}` })
      entryId = await createDictionaryEntryFixture(request, adminToken, dictionaryId, { value: dictKey, label: entryLabel })

      await login(page, 'superadmin')
      await page.goto('/backend/config/translations')

      await fillCombobox(page, 'Select an entity', ENTITY_TYPE)
      await fillCombobox(page, 'Search records...', entryId!)

      const managerCard = page.locator('.bg-card').filter({
        has: page.getByRole('button', { name: 'Save translations' }),
      })
      const deTab = managerCard.getByRole('button', { name: 'DE' })
      await deTab.click()

      const translationField = await waitForTranslationField(managerCard, entryLabel)
      await translationField.fill('Widget Label QA')
      await translationField.press('Tab')

      await page.getByRole('button', { name: 'Save translations' }).click()
      await expect(page.getByText('Translations saved').first()).toBeVisible()
    } finally {
      await deleteTranslationIfExists(request, saToken, ENTITY_TYPE, entryId)
      await deleteDictionaryEntryIfExists(request, adminToken, dictionaryId, entryId)
      await deleteDictionaryIfExists(request, adminToken, dictionaryId)
      await setLocales(request, adminToken, originalLocales).catch(() => {})
    }
  })

  test('should verify saved translation via API', async ({ page, request }) => {
    test.setTimeout(120_000)
    const adminToken = await getAuthToken(request, 'admin')
    const saToken = await getAuthToken(request, 'superadmin')
    const originalLocales = await getLocales(request, adminToken)
    const dictKey = `qa-trans-006-3-${Date.now()}`
    const entryLabel = `Label ${Date.now()}`
    let dictionaryId: string | null = null
    let entryId: string | null = null

    try {
      await setLocales(request, adminToken, [...new Set([...originalLocales, 'de'])])
      dictionaryId = await createDictionaryFixture(request, adminToken, { key: dictKey, name: `QA TC-TRANS-006-3 ${Date.now()}` })
      entryId = await createDictionaryEntryFixture(request, adminToken, dictionaryId, { value: dictKey, label: entryLabel })

      await login(page, 'superadmin')
      await page.goto('/backend/config/translations')

      await fillCombobox(page, 'Select an entity', ENTITY_TYPE)
      await fillCombobox(page, 'Search records...', entryId!)

      const managerCard = page.locator('.bg-card').filter({
        has: page.getByRole('button', { name: 'Save translations' }),
      })
      const deTab = managerCard.getByRole('button', { name: 'DE' })
      await deTab.click()

      const translationField = await waitForTranslationField(managerCard, entryLabel)
      await translationField.fill('API Verifiziert QA')
      await translationField.press('Tab')

      await page.getByRole('button', { name: 'Save translations' }).click()
      await expect(page.getByText('Translations saved').first()).toBeVisible()

      const getResponse = await apiRequest(request, 'GET', `/api/translations/${ENTITY_TYPE}/${entryId}`, { token: saToken })
      expect(getResponse.ok()).toBeTruthy()
      const body = (await getResponse.json()) as { translations: Record<string, Record<string, string>> }
      expect(body.translations.de.label).toBe('API Verifiziert QA')
    } finally {
      await deleteTranslationIfExists(request, saToken, ENTITY_TYPE, entryId)
      await deleteDictionaryEntryIfExists(request, adminToken, dictionaryId, entryId)
      await deleteDictionaryIfExists(request, adminToken, dictionaryId)
      await setLocales(request, adminToken, originalLocales).catch(() => {})
    }
  })
})
