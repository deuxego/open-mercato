import type { GetFunctionInput, GetStepTools } from 'inngest'
import type { inngest } from './client.js'

/** Full handler args — properly typed via SDK's GetFunctionInput */
type InngestHandlerArgs = GetFunctionInput<typeof inngest>

/** Step tools — properly typed via SDK's GetStepTools */
export type StepTools = GetStepTools<typeof inngest>

/** Infer createFunction config from the SDK */
export type CreateFnConfig = Parameters<typeof inngest.createFunction>[0]

/**
 * Workflow metadata — inferred from inngest.createFunction's first parameter.
 * Any SDK option (retries, concurrency, cancelOn, debounce, rateLimit, singleton, etc.) is valid.
 * We enforce `id` as required and add `event` as a shorthand for the trigger event name.
 */
export type WorkflowMeta = CreateFnConfig & {
  id: string
  event?: string
}

/** DI tools returned by buildDITools — inferred from the actual implementation */
import type { buildDITools } from './context.js'
type DITools = ReturnType<typeof buildDITools>

/** Full Inngest handler args + our DI additions — what the workflow handler receives */
export type WorkflowTools = InngestHandlerArgs & DITools

/**
 * Base payload fields required by every workflow.
 * Workflows should extend this with their own fields.
 */
export type BaseWorkflowPayload = {
  organizationId: string
  tenantId: string
}

/** Workflow handler — generic over payload type for full type safety */
export type WorkflowHandler<TPayload extends BaseWorkflowPayload = BaseWorkflowPayload> = (
  payload: TPayload,
  tools: WorkflowTools
) => Promise<unknown>
