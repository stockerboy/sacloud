import { getHealth } from '@/lib/server/queries/health'
import { softFail } from '@/lib/server/softFail'

/**
 * GET /api/health — 운영 상태 (D-137).
 *
 * 인증 없이 열어 둔다. **민감한 값은 하나도 담지 않는다** — 숫자와 시각, 판정뿐이다.
 * 로드밸런서·업타임 감시가 그대로 찌를 수 있게 계약 봉투(`{message,data}`)를 쓰지 않고
 * 평평한 JSON을 돌려준다.
 *
 * 상태 코드
 *   200  ok · degraded  — 서비스는 살아 있다. degraded 는 사람이 봐야 한다는 뜻이다
 *   503  down           — 실제로 못 쓴다
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  /* ★상태를 못 본 이유까지 삼키면 안 된다★ (O-028).
     이 경로가 `down` 을 내면 사람이 제일 먼저 보러 오는데, 그때 「왜」가
     아무 데도 없으면 감시 장치가 감시당하지 않는 것과 같다. 답은 그대로 503 이다 */
  const report = await softFail('health', null)(getHealth())
  if (!report) {
    return Response.json(
      { status: 'down', detail: '상태를 확인할 수 없다' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }
  return Response.json(report, {
    status: report.status === 'down' ? 503 : 200,
    headers: { 'Cache-Control': 'no-store' },
  })
}
