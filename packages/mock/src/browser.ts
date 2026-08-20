import { setupWorker } from 'msw/browser'
import { createHandlers } from './handlers'
import { DEFAULT_API_BASE_URL } from '@sacloud/contract'

/**
 * 브라우저에서 Mock API를 켠다 (Service Worker).
 * `apps/web/public/mockServiceWorker.js` 가 있어야 동작한다 (`pnpm --filter @sacloud/web mock:init`).
 */
export function createWorker(baseUrl: string = DEFAULT_API_BASE_URL) {
  return setupWorker(...createHandlers(baseUrl))
}
