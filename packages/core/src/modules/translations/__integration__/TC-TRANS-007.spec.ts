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
  await page.waitForTimeout(1_000)
  const dropdown = page.locator('.absolute.z-50')
  try {
    await dropdown.waitFor({ state: 'visible', timeout: 5_000 })
    const item = dropdown.locator('button', { hasText: value }).first()
    await item.click({ timeout: 3_000 })
  } catch {
    await input.press('ArrowDown')
    await page.waitForTimeout(300)
    await input.press('Enter')
  }
  await page.waitForTimeout(500)
}

async function waitForTranslationField(container: Locator, preferredPlaceholder?: string): Promise<Locator> {
  const firstEditableField = container.locator('table').locator('input, textarea').first()
  await expect(firstEditableField).toBeVisible()

  const normalizedPlaceholder = preferredPlaceholder?.trim()
  if (!normalizedPlaceholder) return firstEditableField

  const preferredField = container.getByPlaceholder(normalizedPlaceholder).first()
  if (await preferredField.count()) {
    await expect(preferredField).toBeVisible()
    return preferredField
  }

  return firstEditableField
}

/**
 * TC-TRANS-007: Dynamic Translation Manager for Multiple Entity Types
 * Verifies that the standalone Translation Manager correctly handles translations
 * for dictionary entries. This confirms the dynamic translatable-fields mechanism
 * works for all registered entity types.
 * (Adapted from the original category-edit drawer test.)
 */
test.describe('TC-TRANS-007: Dynamic Translation Manager for Multiple Entity Types', () => {
  test.use({ actionTimeout: 30_000 })

  test('should show translation fields for a dictionary entry', async ({ page, request }) => {
    const adminToken = await getAuthToken(request, 'admin')
    const originalLocales = await getLocales(request, adminToken)
    const dictKey = `qa-trans-007-1-${Date.now()}`
    const entryLabel = `QA TC-TRANS-007-1 ${Date.now()}`
    let dictionaryId: string | null = null
    let entryId: string | null = null

    try {
      await setLocales(request, adminToken, [...new Set([...originalLocales, 'de'])])
      dictionaryId = await createDictionaryFixture(request, adminToken, { key: dictKey, name: `Dict ${Date.now()}` })
      entryId = await createDictionaryEntryFixture(request, adminToken, dictionaryId, { value: dictKey, label: entryLabel })

      await login(page, 'superadmin')
      await page.goto('/backend/config/translations')

      await fillCombobox(page, 'Select an entity', ENTITY_TYPE)
      await fillCombobox(page, 'Search records...', entryId!)

      await expect(page.getByRole('button', { name: 'Save translations' })).toBeVisible()
    } finally {
      await deleteDictionaryEntryIfExists(request, adminToken, dictionaryId, entryId)
      await deleteDictionaryIfExists(request, adminToken, dictionaryId)
      await setLocales(request, adminToken, originalLocales).catch(() => {})
    }
  })

  test('should save a translation for a dictionary entry and verify via API', async ({ page, request }) => {
    const adminToken = await getAuthToken(request, 'admin')
    const saToken = await getAuthToken(request, 'superadmin')
    const originalLocales = await getLocales(request, adminToken)
    const dictKey = `qa-trans-007-2-${Date.now()}`
    const entryLabel = `QA TC-TRANS-007-2 ${Date.now()}`
    let dictionaryId: string | null = null
    let entryId: string | null = null

    try {
      await setLocales(request, adminToken, [...new Set([...originalLocales, 'de'])])
      dictionaryId = await createDictionaryFixture(request, adminToken, { key: dictKey, name: `Dict ${Date.now()}` })
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
      await translationField.fill('Eintrag QA')

      await page.getByRole('button', { name: 'Save translations' }).click()
      await expect(page.getByText('Translations saved').first()).toBeVisible()

      const getResponse = await apiRequest(request, 'GET', `/api/translations/${ENTITY_TYPE}/${entryId}`, { token: saToken })
      expect(getResponse.ok()).toBeTruthy()
      const body = (await getResponse.json()) as { translations: Record<string, Record<string, string>> }
      expect(body.translations.de.label).toBe('Eintrag QA')
    } finally {
      await deleteTranslationIfExists(request, saToken, ENTITY_TYPE, entryId)
      await deleteDictionaryEntryIfExists(request, adminToken, dictionaryId, entryId)
      await deleteDictionaryIfExists(request, adminToken, dictionaryId)
      await setLocales(request, adminToken, originalLocales).catch(() => {})
    }
  })
})
