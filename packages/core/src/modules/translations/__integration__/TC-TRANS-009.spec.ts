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

async function fillCombobox(page: Page, placeholder: string, value: string) {
  const input = page.getByPlaceholder(placeholder)
  await expect(input).toBeEnabled({ timeout: 30_000 })
  await input.click()
  await input.fill(value)
  const option = page.getByRole('option', { name: new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })
  try {
    await option.first().click({ timeout: 5_000 })
  } catch {
    await input.press('Enter')
  }
  await input.press('Tab')
  await page.waitForTimeout(500)
}

/**
 * TC-TRANS-009: Translation Command Undo
 * Verifies undo for save (create & update) translation commands via UI.
 */
test.describe('TC-TRANS-009: Translation Command Undo', () => {
  test('undo save (create) should remove the translation', async ({ page, request }) => {
    const adminToken = await getAuthToken(request, 'admin')
    const saToken = await getAuthToken(request, 'superadmin')
    const originalLocales = await getLocales(request, adminToken)
    const dictKey = `qa-trans-009-1-${Date.now()}`
    let dictionaryId: string | null = null
    let entryId: string | null = null

    try {
      await setLocales(request, adminToken, [...new Set([...originalLocales, 'de'])])
      dictionaryId = await createDictionaryFixture(request, adminToken, { key: dictKey, name: `QA TC-TRANS-009-1 ${Date.now()}` })
      entryId = await createDictionaryEntryFixture(request, adminToken, dictionaryId, { value: dictKey, label: `Label ${Date.now()}` })

      await login(page, 'superadmin')
      await page.goto('/backend/config/translations')

      await fillCombobox(page, 'Select an entity', ENTITY_TYPE)
      await fillCombobox(page, 'Search records...', entryId!)

      const managerCard = page.locator('.bg-card').filter({
        has: page.getByRole('button', { name: 'Save translations' }),
      })
      await managerCard.getByRole('button', { name: 'DE' }).click()

      const labelInput = page.locator('table input').first()
      await labelInput.fill('Deutsches Label QA')

      await page.getByRole('button', { name: 'Save translations' }).click()
      await expect(page.getByText('Translations saved').first()).toBeVisible()

      const getBeforeUndo = await apiRequest(request, 'GET', `/api/translations/${ENTITY_TYPE}/${entryId}`, { token: saToken })
      expect(getBeforeUndo.ok()).toBeTruthy()

      const undoButton = page.getByRole('button', { name: /^Undo(?: last action)?$/ })
      await expect(undoButton).toBeVisible()
      await undoButton.click()

      await expect.poll(async () => {
        const resp = await apiRequest(request, 'GET', `/api/translations/${ENTITY_TYPE}/${entryId}`, { token: saToken })
        return resp.status()
      }, { timeout: 10_000 }).toBe(404)
    } finally {
      await deleteTranslationIfExists(request, saToken, ENTITY_TYPE, entryId)
      await deleteDictionaryEntryIfExists(request, adminToken, dictionaryId, entryId)
      await deleteDictionaryIfExists(request, adminToken, dictionaryId)
      await setLocales(request, adminToken, originalLocales).catch(() => {})
    }
  })

  test('undo save (update) should restore previous translations', async ({ page, request }) => {
    const adminToken = await getAuthToken(request, 'admin')
    const saToken = await getAuthToken(request, 'superadmin')
    const originalLocales = await getLocales(request, adminToken)
    const dictKey = `qa-trans-009-2-${Date.now()}`
    let dictionaryId: string | null = null
    let entryId: string | null = null

    try {
      await setLocales(request, adminToken, [...new Set([...originalLocales, 'de'])])
      dictionaryId = await createDictionaryFixture(request, adminToken, { key: dictKey, name: `QA TC-TRANS-009-2 ${Date.now()}` })
      entryId = await createDictionaryEntryFixture(request, adminToken, dictionaryId, { value: dictKey, label: `Label ${Date.now()}` })

      await apiRequest(request, 'PUT', `/api/translations/${ENTITY_TYPE}/${entryId}`, {
        token: saToken,
        data: { de: { label: 'Original Label' } },
      })

      await login(page, 'superadmin')
      await page.goto('/backend/config/translations')

      await fillCombobox(page, 'Select an entity', ENTITY_TYPE)
      await fillCombobox(page, 'Search records...', entryId!)

      const managerCard = page.locator('.bg-card').filter({
        has: page.getByRole('button', { name: 'Save translations' }),
      })
      await managerCard.getByRole('button', { name: 'DE' }).click()

      const labelInput = page.locator('table input').first()
      await expect(labelInput).toHaveValue('Original Label')

      await labelInput.fill('Aktualisiertes Label')
      await page.getByRole('button', { name: 'Save translations' }).click()
      await expect(page.getByText('Translations saved').first()).toBeVisible()

      const undoButton = page.getByRole('button', { name: /^Undo(?: last action)?$/ })
      await expect(undoButton).toBeVisible()
      await undoButton.click()

      await expect.poll(async () => {
        const resp = await apiRequest(request, 'GET', `/api/translations/${ENTITY_TYPE}/${entryId}`, { token: saToken })
        if (!resp.ok()) return null
        const body = (await resp.json()) as { translations: Record<string, Record<string, string>> }
        return body.translations?.de?.label ?? null
      }, { timeout: 10_000 }).toBe('Original Label')
    } finally {
      await deleteTranslationIfExists(request, saToken, ENTITY_TYPE, entryId)
      await deleteDictionaryEntryIfExists(request, adminToken, dictionaryId, entryId)
      await deleteDictionaryIfExists(request, adminToken, dictionaryId)
      await setLocales(request, adminToken, originalLocales).catch(() => {})
    }
  })
})
