import { test, expect } from '@playwright/test'
import { getAuthToken, apiRequest } from '@open-mercato/core/modules/core/__integration__/helpers/api'
import { login } from '@open-mercato/core/modules/core/__integration__/helpers/auth'
import { deleteEntityIfExists } from '@open-mercato/core/modules/core/__integration__/helpers/generalFixtures'

test.describe('TC-UMES-004: Phase E-H completion', () => {
  let adminToken = ''

  test.beforeAll(async ({ request }) => {
    adminToken = await getAuthToken(request, 'admin')
  })

  test('TC-UMES-I01: interceptor before rejects blocked POST with 422', async ({ request }) => {
    const blocked = await apiRequest(request, 'POST', '/api/example/todos', {
      token: adminToken,
      data: { title: 'BLOCKED todo from interceptor test' },
    })
    expect(blocked.status()).toBe(422)
  })

  test('TC-UMES-I02: interceptor before allows valid POST', async ({ request }) => {
    let todoId: string | null = null
    try {
      const created = await apiRequest(request, 'POST', '/api/example/todos', {
        token: adminToken,
        data: { title: `VALID-${Date.now()}` },
      })
      expect(created.ok()).toBeTruthy()
      todoId = (await created.json())?.id ?? null
      expect(typeof todoId).toBe('string')
    } finally {
      await deleteEntityIfExists(request, adminToken, '/api/example/todos', todoId)
    }
  })

  test('TC-UMES-I03/I06: interceptor after merges metadata payload in GET response', async ({ request }) => {
    const enriched = await apiRequest(request, 'GET', '/api/example/todos?page=1&pageSize=1', {
      token: adminToken,
    })
    expect(enriched.ok()).toBeTruthy()
    const enrichedBody = await enriched.json()
    expect(Array.isArray(enrichedBody)).toBe(false)
    expect(Array.isArray(enrichedBody?.items)).toBe(true)
    expect(enrichedBody?._example?.interceptor).toBeDefined()
    expect(typeof enrichedBody?._example?.interceptor?.processingTimeMs).toBe('number')
  })

  test('TC-UMES-I04: wildcard interceptor matches /example/todos', async ({ request }) => {
    const todosResponse = await apiRequest(
      request,
      'GET',
      '/api/example/todos?page=1&pageSize=1&interceptorProbe=wildcard',
      { token: adminToken },
    )
    expect(todosResponse.ok()).toBeTruthy()
    const todosPayload = await todosResponse.json()
    expect(Array.isArray(todosPayload)).toBe(false)
    expect(todosPayload?._example?.wildcardProbe).toBe(true)
  })

  test('TC-UMES-I05: interceptor query rewrite is revalidated by route schema', async ({ request }) => {
    const badQuery = await apiRequest(request, 'GET', '/api/example/todos?interceptorProbe=bad-query', {
      token: adminToken,
    })
    expect(badQuery.status()).toBe(400)
  })

  test('TC-UMES-I08/I09: interceptor timeout and crash fail closed', async ({ request }) => {
    const timeout = await apiRequest(request, 'GET', '/api/example/todos?interceptorProbe=timeout', {
      token: adminToken,
    })
    expect(timeout.status()).toBe(504)
    const timeoutBody = await timeout.json()
    expect(timeoutBody.error).toBe('Interceptor timeout')

    const crash = await apiRequest(request, 'GET', '/api/example/todos?interceptorProbe=crash', {
      token: adminToken,
    })
    expect(crash.status()).toBe(500)
    const crashBody = await crash.json()
    expect(crashBody.error).toBe('Internal interceptor error')
  })

  test('TC-UMES-I10: extension page probe reports interceptor metadata rows as ok', async ({ page }) => {
    await login(page, 'admin')
    await page.goto('/backend/umes-extensions')
    await page.waitForLoadState('domcontentloaded')

    await page.getByTestId('phase-e-run-probe').click()
    await expect(page.getByTestId('phase-e-status')).toContainText('status=ok', { timeout: 15_000 })
    await expect(page.getByTestId('phase-e-probe-default')).toContainText('status=ok')
    await expect(page.getByTestId('phase-e-probe-wildcard')).toContainText('status=ok')
    await expect(page.getByTestId('phase-e-result')).toContainText('_example')
    await expect(page.getByTestId('phase-e-result')).not.toContainText('response=[]')
  })

  test('TC-UMES-CR01/CR02/CR03: replacement handles and wrapper render', async ({ page }) => {
    await login(page, 'admin')
    await page.goto('/backend/umes-extensions')
    await page.waitForLoadState('domcontentloaded')
    const interceptorHint = page.getByText(
      'Note: red network entries for probes 3-5 are expected and indicate correct fail-closed behavior.',
    )
    await expect(interceptorHint).toBeVisible()
    await expect(interceptorHint.locator('xpath=ancestor::div[1]')).toHaveClass(/border-amber-500\/40/)

    await expect(page.locator('[data-component-handle="page:/backend/umes-extensions"]')).toHaveCount(1)
    await expect(page.locator('[data-component-handle="data-table:example.umes.extensions"]')).toHaveCount(1)
    await expect(page.locator('[data-component-handle="crud-form:example.todo"]')).toHaveCount(1)
  })
})
