// NOTE: This route lives in apps/mercato/src/ because Inngest's serve() requires
// exporting named HTTP method handlers (GET/POST/PUT) in Next.js App Router format,
// which is incompatible with the module API auto-discovery dispatch layer.
import { serve } from 'inngest/next'
import { inngest } from '@open-mercato/inngest'

// The generated file may not exist yet (before first yarn generate with workflows).
// Import conditionally to allow the app to build without any workflows registered.
let functions: Parameters<typeof serve>[0]['functions'] = []
try {
  const generated = await import('@/.mercato/generated/inngest-workflows.generated')
  functions = generated.functions ?? []
} catch (error) {
  if (process.env.NODE_ENV === 'development') {
    console.warn('[inngest] Failed to load workflows:', error)
  }
}

if (process.env.INNGEST_DEV === '1' && process.env.NODE_ENV !== 'development') {
  throw new Error('INNGEST_DEV=1 is not allowed outside development')
}

export const { GET, POST, PUT } = serve({ client: inngest, functions })
