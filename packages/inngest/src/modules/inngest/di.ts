import { asValue } from 'awilix'
import type { AwilixContainer } from 'awilix'
import { inngest } from '../../client.js'

export function register(container: AwilixContainer): void {
  container.register({
    inngestClient: asValue(inngest),
  })
}
