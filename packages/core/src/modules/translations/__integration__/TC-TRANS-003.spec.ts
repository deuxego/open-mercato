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
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

/**
 * TC-TRANS-003: Validation & Authorization
 * Covers input validation (entityType, body limits) and basic access control.
 */
test.describe('TC-TRANS-003: Validation & Authorization', () => {
  test('should reject invalid entityType format with 400', async ({ request }) => {
    const token = await getAuthToken(request, 'superadmin')
    const response = await apiRequest(request, 'PUT', '/api/translations/INVALID/some-id', {
      token,
      data: { en: { label: 'test' } },
    })
    expect(response.status()).toBe(400)
  })

  test('should reject field value exceeding 10000 characters with 400', async ({ request }) => {
    const adminToken = await getAuthToken(request, 'admin')
    const saToken = await getAuthToken(request, 'superadmin')
    const dictKey = `qa-trans-003-2-${Date.now()}`
    let dictionaryId: string | null = null
    let entryId: string | null = null

    try {
      dictionaryId = await createDictionaryFixture(request, adminToken, { key: dictKey, name: `QA TC-TRANS-003-2 ${Date.now()}` })
      entryId = await createDictionaryEntryFixture(request, adminToken, dictionaryId, { value: dictKey, label: `Label ${Date.now()}` })
      const longValue = 'x'.repeat(10001)
      const response = await apiRequest(request, 'PUT', `/api/translations/${ENTITY_TYPE}/${entryId}`, {
        token: saToken,
        data: { en: { label: longValue } },
      })
      expect(response.status()).toBe(400)
    } finally {
      await deleteTranslationIfExists(request, saToken, ENTITY_TYPE, entryId)
      await deleteDictionaryEntryIfExists(request, adminToken, dictionaryId, entryId)
      await deleteDictionaryIfExists(request, adminToken, dictionaryId)
    }
  })

  test('should reject locale key exceeding max length with 400', async ({ request }) => {
    const adminToken = await getAuthToken(request, 'admin')
    const saToken = await getAuthToken(request, 'superadmin')
    const dictKey = `qa-trans-003-3-${Date.now()}`
    let dictionaryId: string | null = null
    let entryId: string | null = null

    try {
      dictionaryId = await createDictionaryFixture(request, adminToken, { key: dictKey, name: `QA TC-TRANS-003-3 ${Date.now()}` })
      entryId = await createDictionaryEntryFixture(request, adminToken, dictionaryId, { value: dictKey, label: `Label ${Date.now()}` })
      const response = await apiRequest(request, 'PUT', `/api/translations/${ENTITY_TYPE}/${entryId}`, {
        token: saToken,
        data: { abcdefghijk: { label: 'test' } },
      })
      expect(response.status()).toBe(400)
    } finally {
      await deleteTranslationIfExists(request, saToken, ENTITY_TYPE, entryId)
      await deleteDictionaryEntryIfExists(request, adminToken, dictionaryId, entryId)
      await deleteDictionaryIfExists(request, adminToken, dictionaryId)
    }
  })

  test('should reject unauthenticated requests with 401', async ({ request }) => {
    const response = await request.fetch(`${BASE_URL}/api/translations/locales`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    })
    expect(response.status()).toBe(401)
  })
})
