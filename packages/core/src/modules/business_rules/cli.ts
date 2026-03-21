import type { ModuleCli } from '@open-mercato/shared/modules/registry'

/**
 * Seed guard rules for workflow checkout demo
 * NOTE: The example JSON file has been removed. This command is retained as a no-op
 * so existing scripts referencing it do not crash.
 */
const seedGuardRules: ModuleCli = {
  command: 'seed-guard-rules',
  async run() {
    console.warn('⚠️  seed-guard-rules: The guard-rules example data is no longer available. This command is a no-op.')
  },
}

const businessRulesCliCommands = [
  seedGuardRules,
]

export default businessRulesCliCommands
