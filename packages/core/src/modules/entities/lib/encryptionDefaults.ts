export const DEFAULT_ENCRYPTION_MAPS: Array<{ entityId: string; fields: Array<{ field: string; hashField?: string | null }> }> = [
  {
    entityId: 'auth:user',
    fields: [{ field: 'email', hashField: 'email_hash' }],
  },
  {
    entityId: 'audit_logs:action_log',
    fields: [
      { field: 'command_id' },
      { field: 'action_label' },
      { field: 'command_payload' },
      { field: 'snapshot_before' },
      { field: 'snapshot_after' },
      { field: 'changes_json' },
      { field: 'context_json' },
    ],
  },
  {
    entityId: 'audit_logs:access_log',
    fields: [
      { field: 'resource_id' },
      { field: 'fields_json' },
      { field: 'context_json' },
    ],
  },
  {
    entityId: 'integrations:integration_credentials',
    fields: [{ field: 'credentials' }],
  },
  {
    entityId: 'vector:vector_search',
    fields: [
      { field: 'links' },
      { field: 'payload' },
      { field: 'result_title' },
      { field: 'result_subtitle' },
      { field: 'result_icon' },
      { field: 'result_badge' },
      { field: 'result_snapshot' },
      { field: 'primary_link_href' },
      { field: 'primary_link_label' },
    ],
  }
]
