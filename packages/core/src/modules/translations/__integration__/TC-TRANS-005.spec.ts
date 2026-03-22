import { expect, test } from '@playwright/test'
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

async function fillCombobox(page: import('@playwright/test').Page, placeholder: string, value: string) {
  const input = page.getByPlaceholder(placeholder)
  await expect(input).toBeEnabled({ timeout: 15_000 })
  await input.click()
  await input.fill(value)
  await page.waitForTimeout(1_000)
  // ComboboxInput renders dropdown items as Button > span.font-medium
  // Try clicking the dropdown suggestion that contains our value
  const dropdown = page.locator('.absolute.z-50')
  try {
    await dropdown.waitFor({ state: 'visible', timeout: 5_000 })
    const item = dropdown.locator('button', { hasText: value }).first()
    await item.click({ timeout: 3_000 })
  } catch {
    // Fallback: press ArrowDown + Enter to select first suggestion
    await input.press('ArrowDown')
    await page.waitForTimeout(300)
    await input.press('Enter')
  }
  await page.waitForTimeout(500)
}

/**
 * TC-TRANS-005: Translation Manager Standalone
 * Covers selecting entity/record, entering translations, saving, and verifying persistence.
 */
test.describe('TC-TRANS-005: Translation Manager Standalone', () => {
  test.describe.configure({ timeout: 60_000 })

  test('should select entity type and record, showing the field table', async ({ page, request }) => {
    const adminToken = await getAuthToken(request, 'admin')
    const saToken = await getAuthToken(request, 'superadmin')
    const originalLocales = await getLocales(request, adminToken)
    const dictKey = `qa-trans-005-1-${Date.now()}`
    let dictionaryId: string | null = null
    let entryId: string | null = null

    try {
      await setLocales(request, adminToken, [...new Set([...originalLocales, 'de'])])
      dictionaryId = await createDictionaryFixture(request, adminToken, { key: dictKey, name: `QA TC-TRANS-005-1 ${Date.now()}` })
      entryId = await createDictionaryEntryFixture(request, adminToken, dictionaryId, { value: dictKey, label: `Label ${Date.now()}` })

      await login(page, 'superadmin')
      await page.goto('/backend/config/translations')
      await expect(page.getByRole('heading', { name: 'Translations' })).toBeVisible()

      await fillCombobox(page, 'Select an entity', ENTITY_TYPE)
      await fillCombobox(page, 'Search records...', entryId!)

      await expect(page.getByText('Base value')).toBeVisible()
    } finally {
      await deleteTranslationIfExists(request, saToken, ENTITY_TYPE, entryId)
      await deleteDictionaryEntryIfExists(request, adminToken, dictionaryId, entryId)
      await deleteDictionaryIfExists(request, adminToken, dictionaryId)
      await setLocales(request, adminToken, originalLocales).catch(() => {})
    }
  })

  test('should enter and save a translation via standalone manager', async ({ page, request }) => {
    const adminToken = await getAuthToken(request, 'admin')
    const saToken = await getAuthToken(request, 'superadmin')
    const originalLocales = await getLocales(request, adminToken)
    const dictKey = `qa-trans-005-2-${Date.now()}`
    const entryLabel = `Label ${Date.now()}`
    let dictionaryId: string | null = null
    let entryId: string | null = null

    try {
      await setLocales(request, adminToken, [...new Set([...originalLocales, 'de'])])
      dictionaryId = await createDictionaryFixture(request, adminToken, { key: dictKey, name: `QA TC-TRANS-005-2 ${Date.now()}` })
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

      const labelInput = page.locator('table input').first()
      await labelInput.fill('Deutsches Label QA')

      await page.getByRole('button', { name: 'Save translations' }).click()
      await expect(page.getByText('Translations saved').first()).toBeVisible()

      const getResponse = await apiRequest(request, 'GET', `/api/translations/${ENTITY_TYPE}/${entryId}`, { token: saToken })
      expect(getResponse.ok()).toBeTruthy()
      const body = (await getResponse.json()) as { translations: Record<string, Record<string, string>> }
      expect(body.translations.de.label).toBe('Deutsches Label QA')
    } finally {
      await deleteTranslationIfExists(request, saToken, ENTITY_TYPE, entryId)
      await deleteDictionaryEntryIfExists(request, adminToken, dictionaryId, entryId)
      await deleteDictionaryIfExists(request, adminToken, dictionaryId)
      await setLocales(request, adminToken, originalLocales).catch(() => {})
    }
  })

  test('should persist translations after page reload', async ({ page, request }) => {
    const adminToken = await getAuthToken(request, 'admin')
    const saToken = await getAuthToken(request, 'superadmin')
    const originalLocales = await getLocales(request, adminToken)
    const dictKey = `qa-trans-005-3-${Date.now()}`
    let dictionaryId: string | null = null
    let entryId: string | null = null

    try {
      await setLocales(request, adminToken, [...new Set([...originalLocales, 'de'])])
      dictionaryId = await createDictionaryFixture(request, adminToken, { key: dictKey, name: `QA TC-TRANS-005-3 ${Date.now()}` })
      entryId = await createDictionaryEntryFixture(request, adminToken, dictionaryId, { value: dictKey, label: `Label ${Date.now()}` })

      await apiRequest(request, 'PUT', `/api/translations/${ENTITY_TYPE}/${entryId}`, {
        token: saToken,
        data: { de: { label: 'Persistentes Label' } },
      })

      await login(page, 'superadmin')
      await page.goto('/backend/config/translations')

      await fillCombobox(page, 'Select an entity', ENTITY_TYPE)
      await fillCombobox(page, 'Search records...', entryId!)

      const managerCard = page.locator('.bg-card').filter({
        has: page.getByRole('button', { name: 'Save translations' }),
      })
      const deTab = managerCard.getByRole('button', { name: 'DE' })
      await deTab.click()

      await expect(page.locator('table input').first()).toHaveValue('Persistentes Label')
    } finally {
      await deleteTranslationIfExists(request, saToken, ENTITY_TYPE, entryId)
      await deleteDictionaryEntryIfExists(request, adminToken, dictionaryId, entryId)
      await deleteDictionaryIfExists(request, adminToken, dictionaryId)
      await setLocales(request, adminToken, originalLocales).catch(() => {})
    }
  })
})
