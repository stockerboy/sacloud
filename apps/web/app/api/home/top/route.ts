import { ok, guard } from '@/lib/server/respond'
import { getHomeTop } from '@/lib/server/queries/homeTop'

/**
 * GET /api/home/top — 메인페이지 리그별 개인랭킹 TOP3 (`docs/SITE_SPEC_V2.md` 3절)
 *
 * SPL(`supply`) · IPL(`nolink`) · YSL(`sanply`) 세 리그를 **한 번에** 준다.
 * 개인랭킹 질의를 그대로 재사용하므로 순위 규칙은 랭킹 화면과 같다.
 *
 * 이 경로는 계약의 엔드포인트 레지스트리(`packages/contract/src/endpoints.ts`)에
 * 아직 등록돼 있지 않다 — 메인 전용 묶음이라 원본 관측 대상이 아니고,
 * 응답 형태는 `HomeTop` 스키마로 클라이언트에서 파싱한다.
 */
export async function GET() {
  return guard(async () => ok(await getHomeTop()))
}
