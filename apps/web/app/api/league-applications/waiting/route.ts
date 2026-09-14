import { guardPublic, okPublic } from '@/lib/server/respond'
import { applicationWaiting } from '@/lib/server/queries/leagueApplication'

/**
 * GET /api/league-applications/waiting — ★참가대기 클랜★ (2026-09-14 사장님:
 * «참가대기 클랜들 하고 보여줘(Ipl Spl 활동량 가장 많은 클랜 마크 4개씩 하고 등등 으로 써줘)»).
 *
 * ★활동량 = 최근 7일 경기 수★ 다. 래더 순이 아니다 — 신청하려는 사람이 알고 싶은 것은
 * «지금 여기가 돌아가고 있나» 이지 «누가 세나» 가 아니다.
 *
 * 로그인과 무관하고 하루에 몇 번 바뀌지도 않는다. 엣지가 10분 대신 답한다.
 */
export async function GET(request: Request) {
  return guardPublic(request, 600, async () => okPublic(await applicationWaiting()))
}
