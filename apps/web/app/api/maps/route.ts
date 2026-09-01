import { guardPublic, okPublic } from '@/lib/server/respond'
import { listMaps } from '@/lib/server/queries/search'

/**
 * GET /api/maps — 리그 만들기 폼의 맵 선택 목록
 *
 * 목록이 소수라 페이지네이션 없이 전량을 준다 (Mock과 동일).
 */
export async function GET() {
  /* 길게(3600초) — 맵 목록은 게임 패치급 사건이 있어야 바뀐다 (D-240) */
  return guardPublic('/api/maps', 600, async () => okPublic(await listMaps(), undefined, 3600))
}
