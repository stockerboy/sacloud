import { NexonApiError, NexonClient, readNexonConfig } from '@sacloud/nexon'
import { badRequest, forbidden, guard, ok } from '@/lib/server/respond'
import { requireAdmin } from '@/lib/server/session'
import { query } from '@/lib/server/request'

/**
 * GET /api/admin/nexon-probe?nickname=밤빵걸 — ★넥슨 Open API 가 실제로 뭘 답하는지★ 본다.
 *
 * ── 왜 만들었나 (2026-09-13)
 *   계정인증(칭호)이 ★모든 닉네임에서★ 실패했다. 화면에는 «모르는 닉» 이라고만 뜨는데,
 *   그건 ★400 이거나 ouid 가 null★ 인 두 경우를 한 말로 뭉갠 값이라 원인을 알 수 없었다.
 *   로컬 열쇠는 ${'test_'} 로 시작하는 시험용이라 어떤 닉을 넣어도 400 이 나서
 *   ★운영 열쇠가 받는 진짜 답★ 을 볼 길이 없었다.
 *
 * ── 무엇을 돌려주나
 *   넥슨이 준 것을 ★가공하지 않고★ 그대로 — 종류 · HTTP 상태 · 본문.
 *   그래야 「열쇠 문제인가 · 칸 이름 문제인가 · 정말 없는 닉인가」 가 갈린다.
 *
 * ── 안전
 *   · ★관리자만★ (${'requireAdmin'}). 일반 사용자는 403
 *   · ★열쇠 값을 절대 안 내보낸다★ — 길이와 «시험용이냐» 만 적는다
 *   · 넥슨 호출은 한 번(닉→ouid). ouid 가 나오면 한 번 더(칭호)
 */
export async function GET(request: Request) {
  return guard(async () => {
    const admin = await requireAdmin(request)
    if (!admin) return forbidden('관리자만 접근할 수 있습니다')

    const nickname = (query(request, 'nickname') ?? '').trim()
    if (nickname === '') return badRequest('nickname 이 필요합니다')

    const config = readNexonConfig(process.env)
    const raw = process.env.NEXON_API_KEY ?? ''
    const keyInfo = {
      있음: raw !== '',
      길이: raw.length,
      시험용: raw.startsWith('test_'),
      /* 값이 아니라 ★모양★ 만 — 앞 두 글자로 어느 열쇠인지 사람이 알아본다 */
      앞두글자: raw.slice(0, 2),
      baseUrl: config.baseUrl,
    }

    const client = new NexonClient({ config })
    const step: Record<string, unknown> = { nickname, key: keyInfo }

    try {
      const idRes = await client.getOuid(nickname)
      step.id = { ok: true, ouid: idRes.data.ouid }
      if (idRes.data.ouid === null) {
        step.판정 = 'ouid 가 null — 그 닉을 쓰는 사람이 없다'
        return ok(step)
      }
      try {
        const basic = await client.getUserBasic(idRes.data.ouid)
        step.basic = {
          ok: true,
          user_name: basic.data.user_name ?? null,
          title_name: basic.data.title_name ?? null,
        }
        step.판정 = '정상 — 닉과 칭호를 다 읽었다'
      } catch (error) {
        step.basic = describe(error)
        step.판정 = 'ouid 는 됐는데 칭호를 못 읽었다'
      }
      return ok(step)
    } catch (error) {
      step.id = describe(error)
      step.판정 = '닉 → ouid 에서 막혔다'
      return ok(step)
    }
  })
}

/** 넥슨이 준 오류를 ★가공 없이★ 펼친다 (열쇠 값은 여기 안 온다) */
function describe(error: unknown): Record<string, unknown> {
  if (error instanceof NexonApiError) {
    return {
      ok: false,
      kind: error.kind,
      httpStatus: error.httpStatus,
      /* 본문은 넥슨의 오류 이름·문구다 — 예: OPENAPI00004 Please input valid parameter */
      apiErrorName: error.apiErrorName,
      endpoint: error.endpoint,
      message: String(error.message).slice(0, 500),
    }
  }
  return { ok: false, kind: 'unknown', message: String(error).slice(0, 500) }
}
