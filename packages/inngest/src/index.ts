/**
 * @open-mercato/inngest — Inngest workflow orchestration layer
 *
 * Provides durable multi-step workflows (sleep, wait, fan-out, step-level retry)
 * with tenant-scoped DI integration.
 *
 * Re-exports key Inngest SDK types so consumers import from @open-mercato/inngest
 * instead of inngest directly.
 */

// Our additions
export { inngest } from './client.js'
export { wrapWorkflow } from './adapter.js'
export { buildDITools } from './context.js'
export { createScopedWorkflowContainer } from './container.js'
export { assertJsonSerializable } from './guards.js'
export type { WorkflowMeta, WorkflowHandler, WorkflowTools, StepTools, BaseWorkflowPayload } from './types.js'

// Re-export Inngest SDK essentials — single import source for workflow authors
export {
  NonRetriableError,
  RetryAfterError,
  StepError,
  referenceFunction,
  eventType,
  cron,
  invoke,
  staticSchema,
  Inngest,
} from 'inngest'

export type {
  EventPayload,
  GetStepTools,
  GetFunctionInput,
  GetFunctionOutput,
  StepOptions,
  StepOptionsOrId,
  TimeStr,
  Logger,
  Context,
  Handler,
} from 'inngest'
