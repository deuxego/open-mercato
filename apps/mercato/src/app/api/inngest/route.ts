// NOTE: This route lives in apps/mercato/src/ because Inngest's serve() requires
// exporting named HTTP method handlers (GET/POST/PUT) in Next.js App Router format,
// which is incompatible with the module API auto-discovery dispatch layer.
import { bootstrap } from '@/bootstrap'
import { serve } from 'inngest/next'
import { inngest } from '@open-mercato/inngest'

// Ensure ORM entities, DI registrars, and modules are initialized before serving.
bootstrap()

if (process.env.INNGEST_DEV === '1' && process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test' && !process.env.OM_TEST_MODE) {
  throw new Error('INNGEST_DEV=1 is not allowed outside development/test')
}

// The generated file may not exist before first `yarn generate`.
async function loadFunctions(): Promise<Parameters<typeof serve>[0]['functions']> {
  try {
    const generated = await import('@/.mercato/generated/inngest-workflows.generated')
    return generated.functions ?? []
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[inngest] Failed to load workflows:', error)
    }
    return []
  }
}

// In development: re-evaluate on each request so the Inngest dev server's
// periodic poll (GET) picks up newly generated workflows after `yarn generate`.
// Dynamic import() is cached by the module specifier, but webpack/Turbopack
// invalidates that cache when the file changes on disk — so the next request
// after `yarn generate` returns the fresh function list.
//
// In production: cache after first request (functions don't change at runtime).
let cachedHandler: ReturnType<typeof serve> | null = null

async function getHandler() {
  if (!cachedHandler || process.env.NODE_ENV === 'development') {
    const functions = await loadFunctions()
    cachedHandler = serve({ client: inngest, functions })
  }
  return cachedHandler
}

export async function GET(req: Request, res: unknown) {
  return (await getHandler()).GET(req as Parameters<ReturnType<typeof serve>['GET']>[0], res)
}

export async function POST(req: Request, res: unknown) {
  return (await getHandler()).POST(req as Parameters<ReturnType<typeof serve>['POST']>[0], res)
}

export async function PUT(req: Request, res: unknown) {
  return (await getHandler()).PUT(req as Parameters<ReturnType<typeof serve>['PUT']>[0], res)
}
