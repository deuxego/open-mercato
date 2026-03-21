import { expect, test, type Page } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/modules/core/__integration__/helpers/api'
import {
  createDictionaryFixture,
  createDictionaryEntryFixture,
  deleteDictionaryEntryIfExists,
  deleteDictionaryIfExists,
} from '@open-mercato/core/modules/core/__integration__/helpers/dictionariesFixtures'
import { login } from '@open-mercato/core/modules/core/__integration__/helpers/auth'
import { getLocales, setLocales } from './helpers/translationFixtures'

const ENTITY_TYPE = 'dictionaries:dictionary_entry'

async function fillCombobox(page: Page, placeholder: string, value: string) {
  const input = page.getByPlaceholder(placeholder)
  await expect(input).toBeEnabled({ timeout: 10_000 })
  await input.click()
  await input.fill(value)
  await input.press('Enter')
  await input.press('Tab')
  await page.waitForTimeout(300)
}

/**
 * TC-TRANS-010: Translation Manager Page Interaction
 * Verifies that the standalone translation manager correctly shows and hides
 * translation fields when selecting and deselecting records.
 * (Adapted from the original drawer Escape/scroll-restore test.)
 */
test.describe('TC-TRANS-010: Translation Manager Page Interaction', () => {
  test('should show translation fields when a record is selected and hide them when entity is cleared', async ({ page, request }) => {
    const adminToken = await getAuthToken(request, 'admin')
    const originalLocales = await getLocales(request, adminToken)
    const dictKey = `qa-trans-010-${Date.now()}`
    let dictionaryId: string | null = null
    let entryId: string | null = null

    try {
      await setLocales(request, adminToken, [...new Set([...originalLocales, 'de'])])
      dictionaryId = await createDictionaryFixture(request, adminToken, { key: dictKey, name: `QA TC-TRANS-010 ${Date.now()}` })
      entryId = await createDictionaryEntryFixture(request, adminToken, dictionaryId, { value: dictKey, label: `Label ${Date.now()}` })

      await login(page, 'superadmin')
      await page.goto('/backend/config/translations')
      await expect(page.getByRole('heading', { name: 'Translations' })).toBeVisible()

      await fillCombobox(page, 'Select an entity', ENTITY_TYPE)
      await fillCombobox(page, 'Search records...', entryId!)

      await expect(page.getByRole('button', { name: 'Save translations' })).toBeVisible()
      await expect(page.getByText('Base value')).toBeVisible()

      const entityInput = page.getByPlaceholder('Select an entity')
      await entityInput.click()
      await entityInput.clear()
      await entityInput.press('Escape')

      await expect(page.getByRole('button', { name: 'Save translations' })).not.toBeVisible()
    } finally {
      await deleteDictionaryEntryIfExists(request, adminToken, dictionaryId, entryId)
      await deleteDictionaryIfExists(request, adminToken, dictionaryId)
      await setLocales(request, adminToken, originalLocales).catch(() => {})
    }
  })
})
