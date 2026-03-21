import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    superadmin: ['example.*'],
    admin: ['example.*'],
    employee: ['example.*', 'example.widgets.*'],
  },
}

export default setup
