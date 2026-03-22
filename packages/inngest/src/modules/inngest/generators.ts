import type { GeneratorPlugin } from '@open-mercato/shared/modules/generators'

export const generatorPlugins: GeneratorPlugin[] = [{
  id: 'inngest.workflows',
  conventionFile: 'inngest.workflows.ts',
  importPrefix: 'INNGEST_WORKFLOWS',
  outputFileName: 'inngest-workflows.generated.ts',

  configExpr: (importName: string, moduleId: string) =>
    `...((${importName}.default ?? ${importName}.workflows ?? [])` +
    `.map((w: unknown) => ({ moduleId: '${moduleId}', metadata: (w as Record<string, unknown>).metadata, handler: (w as Record<string, unknown>).default })))`,

  buildOutput: ({ importSection, entriesLiteral }: { importSection: string; entriesLiteral: string }) => `
// AUTO-GENERATED — do not edit
import { wrapWorkflow } from '@open-mercato/inngest'
import type { WorkflowMeta, WorkflowHandler } from '@open-mercato/inngest'
${importSection}

type WorkflowEntryRaw = { moduleId: string; metadata: unknown; handler: unknown }

const entries: WorkflowEntryRaw[] = [
  ${entriesLiteral}
]

export const functions = entries.map(e => wrapWorkflow(e.metadata as WorkflowMeta, e.handler as WorkflowHandler))
`,
}]

export default generatorPlugins
