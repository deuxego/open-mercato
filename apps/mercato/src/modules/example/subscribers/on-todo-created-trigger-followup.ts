import type { Inngest } from '@open-mercato/inngest'

export const metadata = {
  event: 'example.todo.created',
  persistent: true,
  id: 'example.todo.trigger-followup',
}

// Dedup guard — persistent subscribers fire both in-memory and via BullMQ worker.
// Track sent IDs to prevent double inngest.send() for the same record.
const recentlySent = new Set<string>()

export default async function handler(
  payload: Record<string, unknown>,
  ctx: { resolve: (name: string) => unknown; eventName?: string }
) {
  const recordId = payload.id as string | undefined
  if (!recordId) return

  if (recentlySent.has(recordId)) {
    recentlySent.delete(recordId)
    return
  }
  recentlySent.add(recordId)
  // Auto-cleanup after 10s to prevent memory leak
  setTimeout(() => recentlySent.delete(recordId), 10_000)

  let inngestClient: Inngest
  try {
    inngestClient = ctx.resolve('inngestClient') as Inngest
  } catch {
    return
  }

  try {
    await inngestClient.send({
      name: 'example.todo-followup',
      data: payload,
      id: `todo-followup-${recordId}`,
    })
  } catch (e) {
    console.error('[inngest] Failed to send workflow event:', e)
  }
}
