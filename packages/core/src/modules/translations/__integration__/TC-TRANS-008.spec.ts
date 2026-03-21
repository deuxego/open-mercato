import { expect, test } from '@playwright/test'
import { apiRequest, getAuthToken } from '@open-mercato/core/modules/core/__integration__/helpers/api'
import {
  createDictionaryFixture,
  createDictionaryEntryFixture,
  deleteDictionaryEntryIfExists,
  deleteDictionaryIfExists,
} from '@open-mercato/core/modules/core/__integration__/helpers/dictionariesFixtures'
import { deleteTranslationIfExists, ensureRoleFeatures, getLocales, restoreRoleFeatures, setLocales } from './helpers/translationFixtures'

const ENTITY_TYPE = 'dictionaries:dictionary_entry'

/**
 * TC-TRANS-008: RBAC Authorization per Role
 * Verifies that translation API endpoints enforce correct feature-based access
 * control for admin (translations.*) and employee (translations.view + translations.manage).
 *
 * Role matrix:
 *   superadmin — all features (implicit)
 *   admin      — translations.* (all)
 *   employee   — translations.view + translations.manage (edit translations)
 */
test.describe('TC-TRANS-008: RBAC Authorization per Role', () => {
  let adminOriginalFeatures: string[] = []
  let employeeOriginalFeatures: string[] = []

  test.beforeAll(async ({ request }) => {
    const saToken = await getAuthToken(request, 'superadmin')
    adminOriginalFeatures = await ensureRoleFeatures(request, saToken, 'admin', ['translations.*'])
    employeeOriginalFeatures = await ensureRoleFeatures(request, saToken, 'employee', ['translations.view', 'translations.manage'])
  })

  test.afterAll(async ({ request }) => {
    const saToken = await getAuthToken(request, 'superadmin')
    await restoreRoleFeatures(request, saToken, 'admin', adminOriginalFeatures).catch(() => {})
    await restoreRoleFeatures(request, saToken, 'employee', employeeOriginalFeatures).catch(() => {})
  })

  // --- Admin: full access ---

  test('admin can GET translations (translations.view)', async ({ request }) => {
    const adminToken = await getAuthToken(request, 'admin')
    const saToken = await getAuthToken(request, 'superadmin')
    const dictKey = `qa-t008-ag-${Date.now()}`
    let dictionaryId: string | null = null
    let entryId: string | null = null

    try {
      dictionaryId = await createDictionaryFixture(request, adminToken, { key: dictKey, name: `QA TC-TRANS-008-AG ${Date.now()}` })
      entryId = await createDictionaryEntryFixture(request, adminToken, dictionaryId, { value: dictKey, label: `Label ${Date.now()}` })

      await apiRequest(request, 'PUT', `/api/translations/${ENTITY_TYPE}/${entryId}`, {
        token: saToken,
        data: { de: { label: 'Admin GET Test' } },
      })

      const response = await apiRequest(request, 'GET', `/api/translations/${ENTITY_TYPE}/${entryId}`, { token: adminToken })
      expect(response.ok()).toBeTruthy()
    } finally {
      await deleteTranslationIfExists(request, saToken, ENTITY_TYPE, entryId)
      await deleteDictionaryEntryIfExists(request, adminToken, dictionaryId, entryId)
      await deleteDictionaryIfExists(request, adminToken, dictionaryId)
    }
  })

  test('admin can PUT translations (translations.manage)', async ({ request }) => {
    const adminToken = await getAuthToken(request, 'admin')
    const saToken = await getAuthToken(request, 'superadmin')
    const dictKey = `qa-t008-ap-${Date.now()}`
    let dictionaryId: string | null = null
    let entryId: string | null = null

    try {
      dictionaryId = await createDictionaryFixture(request, adminToken, { key: dictKey, name: `QA TC-TRANS-008-AP ${Date.now()}` })
      entryId = await createDictionaryEntryFixture(request, adminToken, dictionaryId, { value: dictKey, label: `Label ${Date.now()}` })

      const response = await apiRequest(request, 'PUT', `/api/translations/${ENTITY_TYPE}/${entryId}`, {
        token: adminToken,
        data: { de: { label: 'Admin PUT Test' } },
      })
      expect(response.ok()).toBeTruthy()
    } finally {
      await deleteTranslationIfExists(request, saToken, ENTITY_TYPE, entryId)
      await deleteDictionaryEntryIfExists(request, adminToken, dictionaryId, entryId)
      await deleteDictionaryIfExists(request, adminToken, dictionaryId)
    }
  })

  test('admin can DELETE translations (translations.manage)', async ({ request }) => {
    const adminToken = await getAuthToken(request, 'admin')
    const saToken = await getAuthToken(request, 'superadmin')
    const dictKey = `qa-t008-ad-${Date.now()}`
    let dictionaryId: string | null = null
    let entryId: string | null = null

    try {
      dictionaryId = await createDictionaryFixture(request, adminToken, { key: dictKey, name: `QA TC-TRANS-008-AD ${Date.now()}` })
      entryId = await createDictionaryEntryFixture(request, adminToken, dictionaryId, { value: dictKey, label: `Label ${Date.now()}` })

      await apiRequest(request, 'PUT', `/api/translations/${ENTITY_TYPE}/${entryId}`, {
        token: saToken,
        data: { de: { label: 'To delete' } },
      })

      const response = await apiRequest(request, 'DELETE', `/api/translations/${ENTITY_TYPE}/${entryId}`, { token: adminToken })
      expect(response.status()).toBe(204)
    } finally {
      await deleteTranslationIfExists(request, saToken, ENTITY_TYPE, entryId)
      await deleteDictionaryEntryIfExists(request, adminToken, dictionaryId, entryId)
      await deleteDictionaryIfExists(request, adminToken, dictionaryId)
    }
  })

  test('admin can PUT locales (translations.manage_locales)', async ({ request }) => {
    const adminToken = await getAuthToken(request, 'admin')
    const originalLocales = await getLocales(request, adminToken)

    try {
      const response = await apiRequest(request, 'PUT', '/api/translations/locales', {
        token: adminToken,
        data: { locales: ['en', 'de'] },
      })
      expect(response.ok()).toBeTruthy()
    } finally {
      await setLocales(request, adminToken, originalLocales).catch(() => {})
    }
  })

  // --- Employee: can edit translations, cannot manage locales ---

  test('employee can GET translations (translations.view)', async ({ request }) => {
    const adminToken = await getAuthToken(request, 'admin')
    const saToken = await getAuthToken(request, 'superadmin')
    const employeeToken = await getAuthToken(request, 'employee')
    const dictKey = `qa-t008-eg-${Date.now()}`
    let dictionaryId: string | null = null
    let entryId: string | null = null

    try {
      dictionaryId = await createDictionaryFixture(request, adminToken, { key: dictKey, name: `QA TC-TRANS-008-EG ${Date.now()}` })
      entryId = await createDictionaryEntryFixture(request, adminToken, dictionaryId, { value: dictKey, label: `Label ${Date.now()}` })

      await apiRequest(request, 'PUT', `/api/translations/${ENTITY_TYPE}/${entryId}`, {
        token: saToken,
        data: { de: { label: 'Employee GET Test' } },
      })

      const response = await apiRequest(request, 'GET', `/api/translations/${ENTITY_TYPE}/${entryId}`, { token: employeeToken })
      expect(response.ok()).toBeTruthy()
      const body = (await response.json()) as { translations: Record<string, Record<string, string>> }
      expect(body.translations.de.label).toBe('Employee GET Test')
    } finally {
      await deleteTranslationIfExists(request, saToken, ENTITY_TYPE, entryId)
      await deleteDictionaryEntryIfExists(request, adminToken, dictionaryId, entryId)
      await deleteDictionaryIfExists(request, adminToken, dictionaryId)
    }
  })

  test('employee can GET locales (translations.view)', async ({ request }) => {
    const employeeToken = await getAuthToken(request, 'employee')
    const response = await apiRequest(request, 'GET', '/api/translations/locales', { token: employeeToken })
    expect(response.ok()).toBeTruthy()
    const body = (await response.json()) as { locales: string[] }
    expect(Array.isArray(body.locales)).toBeTruthy()
  })

  test('employee can PUT translations (translations.manage)', async ({ request }) => {
    const adminToken = await getAuthToken(request, 'admin')
    const employeeToken = await getAuthToken(request, 'employee')
    const dictKey = `qa-t008-ep-${Date.now()}`
    let dictionaryId: string | null = null
    let entryId: string | null = null

    try {
      dictionaryId = await createDictionaryFixture(request, adminToken, { key: dictKey, name: `QA TC-TRANS-008-EP ${Date.now()}` })
      entryId = await createDictionaryEntryFixture(request, adminToken, dictionaryId, { value: dictKey, label: `Label ${Date.now()}` })

      const response = await apiRequest(request, 'PUT', `/api/translations/${ENTITY_TYPE}/${entryId}`, {
        token: employeeToken,
        data: { de: { label: 'Employee PUT Test' } },
      })
      expect(response.ok()).toBeTruthy()
    } finally {
      const saToken = await getAuthToken(request, 'superadmin')
      await deleteTranslationIfExists(request, saToken, ENTITY_TYPE, entryId)
      await deleteDictionaryEntryIfExists(request, adminToken, dictionaryId, entryId)
      await deleteDictionaryIfExists(request, adminToken, dictionaryId)
    }
  })

  test('employee can DELETE translations (translations.manage)', async ({ request }) => {
    const adminToken = await getAuthToken(request, 'admin')
    const saToken = await getAuthToken(request, 'superadmin')
    const employeeToken = await getAuthToken(request, 'employee')
    const dictKey = `qa-t008-ed-${Date.now()}`
    let dictionaryId: string | null = null
    let entryId: string | null = null

    try {
      dictionaryId = await createDictionaryFixture(request, adminToken, { key: dictKey, name: `QA TC-TRANS-008-ED ${Date.now()}` })
      entryId = await createDictionaryEntryFixture(request, adminToken, dictionaryId, { value: dictKey, label: `Label ${Date.now()}` })

      await apiRequest(request, 'PUT', `/api/translations/${ENTITY_TYPE}/${entryId}`, {
        token: saToken,
        data: { de: { label: 'Cannot delete' } },
      })

      const response = await apiRequest(request, 'DELETE', `/api/translations/${ENTITY_TYPE}/${entryId}`, { token: employeeToken })
      expect(response.status()).toBe(204)
    } finally {
      await deleteTranslationIfExists(request, saToken, ENTITY_TYPE, entryId)
      await deleteDictionaryEntryIfExists(request, adminToken, dictionaryId, entryId)
      await deleteDictionaryIfExists(request, adminToken, dictionaryId)
    }
  })

  test('employee cannot PUT locales (403 — missing translations.manage_locales)', async ({ request }) => {
    const employeeToken = await getAuthToken(request, 'employee')

    const response = await apiRequest(request, 'PUT', '/api/translations/locales', {
      token: employeeToken,
      data: { locales: ['en', 'de', 'fr'] },
    })
    expect(response.status()).toBe(403)
  })
})
