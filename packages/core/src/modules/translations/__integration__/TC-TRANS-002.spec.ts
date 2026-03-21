import { expect, test } from '@playwright/test'
import { apiRequest, getAuthToken } from '@open-mercato/core/modules/core/__integration__/helpers/api'
import {
  createDictionaryFixture,
  createDictionaryEntryFixture,
  deleteDictionaryEntryIfExists,
  deleteDictionaryIfExists,
} from '@open-mercato/core/modules/core/__integration__/helpers/dictionariesFixtures'
import { deleteTranslationIfExists } from './helpers/translationFixtures'

const ENTITY_TYPE = 'dictionaries:dictionary_entry'

/**
 * TC-TRANS-002: Translation CRUD Lifecycle
 * Covers GET/PUT/DELETE /api/translations/:entityType/:entityId — full create-read-update-delete flow.
 */
test.describe('TC-TRANS-002: Translation CRUD Lifecycle', () => {
  test('should return 404 for non-existent translation', async ({ request }) => {
    const adminToken = await getAuthToken(request, 'admin')
    const saToken = await getAuthToken(request, 'superadmin')
    const dictKey = `qa-trans-002-1-${Date.now()}`
    let dictionaryId: string | null = null
    let entryId: string | null = null

    try {
      dictionaryId = await createDictionaryFixture(request, adminToken, { key: dictKey, name: `QA TC-TRANS-002-1 ${Date.now()}` })
      entryId = await createDictionaryEntryFixture(request, adminToken, dictionaryId, { value: dictKey, label: `Label ${Date.now()}` })
      const response = await apiRequest(request, 'GET', `/api/translations/${ENTITY_TYPE}/${entryId}`, { token: saToken })
      expect(response.status()).toBe(404)
    } finally {
      await deleteTranslationIfExists(request, saToken, ENTITY_TYPE, entryId)
      await deleteDictionaryEntryIfExists(request, adminToken, dictionaryId, entryId)
      await deleteDictionaryIfExists(request, adminToken, dictionaryId)
    }
  })

  test('should create and retrieve a translation', async ({ request }) => {
    const adminToken = await getAuthToken(request, 'admin')
    const saToken = await getAuthToken(request, 'superadmin')
    const dictKey = `qa-trans-002-2-${Date.now()}`
    let dictionaryId: string | null = null
    let entryId: string | null = null

    try {
      dictionaryId = await createDictionaryFixture(request, adminToken, { key: dictKey, name: `QA TC-TRANS-002-2 ${Date.now()}` })
      entryId = await createDictionaryEntryFixture(request, adminToken, dictionaryId, { value: dictKey, label: `Label ${Date.now()}` })

      const putResponse = await apiRequest(request, 'PUT', `/api/translations/${ENTITY_TYPE}/${entryId}`, {
        token: saToken,
        data: { de: { label: 'Deutsches Label' } },
      })
      expect(putResponse.ok()).toBeTruthy()
      const putBody = (await putResponse.json()) as { translations: Record<string, Record<string, string>> }
      expect(putBody.translations.de.label).toBe('Deutsches Label')

      const getResponse = await apiRequest(request, 'GET', `/api/translations/${ENTITY_TYPE}/${entryId}`, { token: saToken })
      expect(getResponse.ok()).toBeTruthy()
      const getBody = (await getResponse.json()) as { translations: Record<string, Record<string, string>> }
      expect(getBody.translations.de.label).toBe('Deutsches Label')
    } finally {
      await deleteTranslationIfExists(request, saToken, ENTITY_TYPE, entryId)
      await deleteDictionaryEntryIfExists(request, adminToken, dictionaryId, entryId)
      await deleteDictionaryIfExists(request, adminToken, dictionaryId)
    }
  })

  test('should upsert translations (add locale, update existing)', async ({ request }) => {
    const adminToken = await getAuthToken(request, 'admin')
    const saToken = await getAuthToken(request, 'superadmin')
    const dictKey = `qa-trans-002-3-${Date.now()}`
    let dictionaryId: string | null = null
    let entryId: string | null = null

    try {
      dictionaryId = await createDictionaryFixture(request, adminToken, { key: dictKey, name: `QA TC-TRANS-002-3 ${Date.now()}` })
      entryId = await createDictionaryEntryFixture(request, adminToken, dictionaryId, { value: dictKey, label: `Label ${Date.now()}` })

      await apiRequest(request, 'PUT', `/api/translations/${ENTITY_TYPE}/${entryId}`, {
        token: saToken,
        data: { de: { label: 'Original' } },
      })

      const upsertResponse = await apiRequest(request, 'PUT', `/api/translations/${ENTITY_TYPE}/${entryId}`, {
        token: saToken,
        data: { de: { label: 'Aktualisiert' }, fr: { label: 'Label Français' } },
      })
      expect(upsertResponse.ok()).toBeTruthy()

      const getResponse = await apiRequest(request, 'GET', `/api/translations/${ENTITY_TYPE}/${entryId}`, { token: saToken })
      const body = (await getResponse.json()) as { translations: Record<string, Record<string, string>> }
      expect(body.translations.de.label).toBe('Aktualisiert')
      expect(body.translations.fr.label).toBe('Label Français')
    } finally {
      await deleteTranslationIfExists(request, saToken, ENTITY_TYPE, entryId)
      await deleteDictionaryEntryIfExists(request, adminToken, dictionaryId, entryId)
      await deleteDictionaryIfExists(request, adminToken, dictionaryId)
    }
  })

  test('should delete translations and confirm 404', async ({ request }) => {
    const adminToken = await getAuthToken(request, 'admin')
    const saToken = await getAuthToken(request, 'superadmin')
    const dictKey = `qa-trans-002-4-${Date.now()}`
    let dictionaryId: string | null = null
    let entryId: string | null = null

    try {
      dictionaryId = await createDictionaryFixture(request, adminToken, { key: dictKey, name: `QA TC-TRANS-002-4 ${Date.now()}` })
      entryId = await createDictionaryEntryFixture(request, adminToken, dictionaryId, { value: dictKey, label: `Label ${Date.now()}` })

      await apiRequest(request, 'PUT', `/api/translations/${ENTITY_TYPE}/${entryId}`, {
        token: saToken,
        data: { de: { label: 'Zu löschen' } },
      })

      const deleteResponse = await apiRequest(request, 'DELETE', `/api/translations/${ENTITY_TYPE}/${entryId}`, { token: saToken })
      expect(deleteResponse.status()).toBe(204)

      const getResponse = await apiRequest(request, 'GET', `/api/translations/${ENTITY_TYPE}/${entryId}`, { token: saToken })
      expect(getResponse.status()).toBe(404)
    } finally {
      await deleteTranslationIfExists(request, saToken, ENTITY_TYPE, entryId)
      await deleteDictionaryEntryIfExists(request, adminToken, dictionaryId, entryId)
      await deleteDictionaryIfExists(request, adminToken, dictionaryId)
    }
  })
})
