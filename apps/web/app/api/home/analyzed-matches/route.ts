import { guardPublic, okPublic } from '@/lib/server/respond'
import { homeAnalyzedMatches } from '@/lib/server/queries/homeAnalyzed'

/**
 * GET /api/home/analyzed-matches — ★경기분석까지 끝난 최근 경기 셋★ (2026-09-12 사장님)
 *
 * 홈에만 쓴다. 로그인과 무관해 엣지가 대신 답한다 (D-223).
 */
/** ⚠ 2026-09-12 사장님: «최근경기 두개만 넣어». 옛 값은 3 이었다 */
const HOME_MATCH_COUNT = 2

export async function GET(request: Request) {
  return guardPublic(request, 300, async () => okPublic(await homeAnalyzedMatches(HOME_MATCH_COUNT)))
}
