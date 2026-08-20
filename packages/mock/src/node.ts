import { setupServer } from 'msw/node'
import { createHandlers } from './handlers'
import { DEFAULT_API_BASE_URL } from '@sacloud/contract'

/** Node(테스트·SSR)에서 Mock API를 켠다. */
export function createMockServer(baseUrl: string = DEFAULT_API_BASE_URL) {
  return setupServer(...createHandlers(baseUrl))
}
