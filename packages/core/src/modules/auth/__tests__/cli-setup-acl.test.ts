/** @jest-environment node */
import { registerModules } from '@open-mercato/shared/lib/modules/registry'
import { registerCliModules } from '@open-mercato/shared/modules/registry'
import type { Module } from '@open-mercato/shared/modules/registry'
import cli from '@open-mercato/core/modules/auth/cli'

// Register modules so that ensureDefaultRoleAcls can read defaultRoleFeatures
const testModules: Module[] = [
  { id: 'auth', setup: { defaultRoleFeatures: { admin: ['auth.*'] } } },
  { id: 'entities', setup: { defaultRoleFeatures: { admin: ['entities.*'] } } },
  { id: 'attachments', setup: { defaultRoleFeatures: { admin: ['attachments.*', 'attachments.view', 'attachments.manage'], employee: ['attachments.view'] } } },
  { id: 'query_index', setup: { defaultRoleFeatures: { admin: ['query_index.*'] } } },
  { id: 'configs', setup: { defaultRoleFeatures: { admin: ['configs.system_status.view', 'configs.cache.view', 'configs.cache.manage', 'configs.manage'] } } },
  { id: 'directory', setup: { defaultRoleFeatures: { superadmin: ['directory.tenants.*'], admin: ['directory.organizations.view', 'directory.organizations.manage'] } } },
  { id: 'dictionaries', setup: { defaultRoleFeatures: { admin: ['dictionaries.view', 'dictionaries.manage'], employee: ['dictionaries.view'] } } },
  { id: 'audit_logs', setup: { defaultRoleFeatures: { admin: ['audit_logs.*'], employee: ['audit_logs.view_self', 'audit_logs.undo_self'] } } },
  { id: 'dashboards', setup: { defaultRoleFeatures: { admin: ['dashboards.*', 'dashboards.admin.assign-widgets', 'analytics.view'], employee: ['dashboards.view', 'dashboards.configure', 'analytics.view'] } } },
  { id: 'api_keys', setup: { defaultRoleFeatures: { admin: ['api_keys.*'] } } },
  { id: 'feature_toggles', setup: { defaultRoleFeatures: { admin: ['feature_toggles.*'] } } },
  { id: 'business_rules', setup: { defaultRoleFeatures: { admin: ['business_rules.*'] } } },
  { id: 'translations', setup: { defaultRoleFeatures: { admin: ['translations.*'], employee: ['translations.view', 'translations.manage'] } } },
  { id: 'customer_accounts', setup: { defaultRoleFeatures: { superadmin: ['customer_accounts.*'], admin: ['customer_accounts.*'] } } },
  { id: 'integrations', setup: { defaultRoleFeatures: { superadmin: ['integrations.*', 'integrations.view', 'integrations.manage', 'integrations.credentials.manage'], admin: ['integrations.*', 'integrations.view', 'integrations.manage', 'integrations.credentials.manage'], employee: ['integrations.view'] } } },
  { id: 'data_sync', setup: { defaultRoleFeatures: { superadmin: ['data_sync.view', 'data_sync.run', 'data_sync.configure'], admin: ['data_sync.view', 'data_sync.run', 'data_sync.configure'], employee: ['data_sync.view'] } } },
  { id: 'messages', setup: { defaultRoleFeatures: { superadmin: ['messages.*'], admin: ['messages.*'], employee: ['messages.*'] } } },
  { id: 'progress', setup: { defaultRoleFeatures: { admin: ['progress.*'], employee: ['progress.view'] } } },
  { id: 'example', setup: { defaultRoleFeatures: { superadmin: ['example.*', 'payment_gateways.*', 'shipping_carriers.*'], admin: ['example.*', 'payment_gateways.*', 'shipping_carriers.*'], employee: ['example.*', 'example.widgets.*', 'payment_gateways.view', 'shipping_carriers.view'] } } },
]
registerModules(testModules)
registerCliModules(testModules)

// Mock DI container and EM
const persistAndFlush = jest.fn()
const findOne = jest.fn()
const findOneOrFail = jest.fn()
const create = jest.fn((entity: any, data: any) => {
  if (entity?.name === 'Tenant') return { id: 'tenant-1', ...data }
  if (entity?.name === 'Organization') return { id: 'org-1', ...data }
  return { ...data }
})
const find = jest.fn(async () => [])
const persist = jest.fn()
const flush = jest.fn()

jest.mock('@open-mercato/shared/lib/di/container', () => ({
  createRequestContainer: async () => ({ resolve: (_: string) => {
    const baseEm = { persistAndFlush, findOne, findOneOrFail, create, find, persist, flush }
    return {
      ...baseEm,
      transactional: async (cb: (tem: any) => any) => {
        // Provide a transactional EM with persist/flush methods
        const tem = { ...baseEm }
        return await cb(tem)
      },
    }
  } }),
}))

describe('auth CLI setup seeds ACLs', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('creates role ACL rows for superadmin/admin/employee', async () => {
    const setup = cli.find((c: any) => c.command === 'setup')!

    // Arrange mocks: roles exist
    findOne.mockImplementation(async (Entity: any, where: any) => {
      if (where?.name === 'superadmin') return { id: 'r-superadmin', name: 'superadmin' }
      if (where?.name === 'admin') return { id: 'r-admin', name: 'admin' }
      if (where?.name === 'employee') return { id: 'r-employee', name: 'employee' }
      return null
    })
    findOneOrFail.mockImplementation(async (_: any, where: any) => ({ id: 'role-' + where.name, name: where.name }))

    // Act
    await setup.run(['--orgName', 'Acme', '--email', 'root@acme.com', '--password', 'secret', '--skip-password-policy'])

    // Assert: persistAndFlush was called to create three RoleAcl rows with expected flags/features
    const calls = persistAndFlush.mock.calls.map((c) => c[0])
    const roleAclCreates = calls.filter((row) => 'tenantId' in row && ('isSuperAdmin' in row || Array.isArray(row.featuresJson)))
    const superadminAcl = roleAclCreates.find((row) => row.isSuperAdmin === true)
    expect(superadminAcl).toBeDefined()
    expect(Array.isArray(superadminAcl?.featuresJson)).toBe(true)
    // superadmin gets features from modules declaring superadmin role
    expect(superadminAcl?.featuresJson).toEqual(expect.arrayContaining([
      'directory.tenants.*',
      'customer_accounts.*',
      'integrations.*',
      'data_sync.view',
      'data_sync.run',
      'data_sync.configure',
      'messages.*',
      'example.*',
    ]))

    const adminAcl = roleAclCreates.find((row) => Array.isArray(row.featuresJson) && row.featuresJson.includes('directory.organizations.manage'))
    expect(adminAcl).toBeDefined()
    expect(adminAcl?.featuresJson).toEqual(expect.arrayContaining([
      'auth.*',
      'entities.*',
      'attachments.*',
      'query_index.*',
      'configs.system_status.view',
      'configs.cache.view',
      'configs.cache.manage',
      'configs.manage',
      'directory.organizations.manage',
      'directory.organizations.view',
      'dictionaries.view',
      'dictionaries.manage',
      'example.*',
      'audit_logs.*',
      'dashboards.*',
      'dashboards.admin.assign-widgets',
      'analytics.view',
      'api_keys.*',
      'translations.*',
      'customer_accounts.*',
      'integrations.*',
      'data_sync.view',
      'data_sync.run',
      'data_sync.configure',
      'messages.*',
      'progress.*',
      'feature_toggles.*',
      'business_rules.*',
      'payment_gateways.*',
      'shipping_carriers.*',
    ]))
    // admin should NOT get superadmin-only wildcard features
    expect(adminAcl?.featuresJson).not.toContain('directory.tenants.*')

    const employeeAcl = roleAclCreates.find((row) => Array.isArray(row.featuresJson) && row.featuresJson.includes('example.widgets.*'))
    expect(employeeAcl).toBeDefined()
    expect(employeeAcl?.featuresJson).toEqual(expect.arrayContaining([
      'attachments.view',
      'dictionaries.view',
      'example.*',
      'example.widgets.*',
      'audit_logs.view_self',
      'audit_logs.undo_self',
      'dashboards.view',
      'dashboards.configure',
      'analytics.view',
      'translations.view',
      'translations.manage',
      'integrations.view',
      'data_sync.view',
      'messages.*',
      'progress.view',
      'payment_gateways.view',
      'shipping_carriers.view',
    ]))
  }, 20000)
})
