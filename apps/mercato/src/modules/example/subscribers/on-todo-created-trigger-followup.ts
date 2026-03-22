import type { Inngest } from '@open-mercato/inngest'

export const metadata = {
  event: 'example.todo.created',
  persistent: true,
  id: 'example.todo.trigger-followup',
}

export default async function handler(
  payload: Record<string, unknown>,
  ctx: { resolve: (name: string) => unknown; eventName?: string }
) {
  let inngestClient: Inngest
  try {
    inngestClient = ctx.resolve('inngestClient') as Inngest
  } catch (e) {
    console.log(e)
    // Inngest module not installed — skip silently
    return
  }

  try {
    // Event name = workflow ID (hyphens distinguish from dot-separated domain events)
    await inngestClient.send({
      name: 'example.todo-followup',
      data: payload,
    })
  } catch (e) {
    console.log(e)
  }
}
