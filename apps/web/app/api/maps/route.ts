import { guard, ok } from '@/lib/server/respond'
import { listMaps } from '@/lib/server/queries/search'

/**
 * GET /api/maps — 리그 만들기 폼의 맵 선택 목록
 *
 * 목록이 소수라 페이지네이션 없이 전량을 준다 (Mock과 동일).
 */
export async function GET() {
  return guard(async () => ok(await listMaps()))
}
