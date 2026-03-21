/**
 * @jest-environment node
 */
import type { ModuleInjectionTable } from '@open-mercato/shared/modules/widgets/injection'

async function loadInjectionTable(): Promise<ModuleInjectionTable> {
  jest.resetModules()
  const mod = await import('../injection-table')
  return mod.injectionTable
}

describe('example injection-table', () => {
  afterEach(() => {
    jest.resetModules()
  })

  it('keeps todo harness and menu injections enabled', async () => {
    const table = await loadInjectionTable()

    expect(table['crud-form:example.todo']).toBe('example.injection.crud-validation')
    expect(table['widget:example.injection.crud-validation:addon']).toBeDefined()
    expect(table['example:phase-c-handlers']).toBe('example.injection.crud-validation')
    expect(table['menu:sidebar:main']).toBeDefined()
    expect(table['menu:topbar:profile-dropdown']).toBeDefined()
  })

  it('includes portal dashboard widget injections', async () => {
    const table = await loadInjectionTable()

    const portalSections = table['portal:dashboard:sections']
    expect(Array.isArray(portalSections)).toBe(true)
    expect((portalSections as any[]).length).toBe(3)
  })
})
