import { describe, expect, it } from 'vitest'
import { LeagueCreateInput } from '../entities/league'

/**
 * **리그 만들기 화면이 보내는 몸통이 계약을 만족하는가** (O-030 · 2026-09-03).
 *
 * ══ 왜 이 파일이 생겼나 — 세 번째다 ══
 *
 * `apiSend` 를 쓰는 27자리를 계약과 눈으로 맞춰 봤다. **어긋난 곳이 하나 나왔다.**
 * ```
 * 계약   agreements: z.object({ no_paid_invitation, responsible_operation,
 *                              accept_deletion_policy })   ← 셋 다 literal(true)
 * 화면   agreements: agreements.map(() => true)            ★[true, true, true]★
 * ```
 * `z.object()` 는 배열을 안 받는다. **누가 무엇을 넣어도 400 이다. 100% 다.**
 *
 * 가입(`O-027`) · 로그인(`O-029`) 과 **똑같은 사고**다.
 * > 최윤서 — *"테스트가 지키는 것은 계약이 스스로 일관되는가이고,
 * >  ★화면이 그 계약대로 보내는가★ 는 아무도 안 지킨다."*
 *
 * ══ 왜 아무도 못 잡았나 ══
 *
 * **계약에 몸통(request) 스키마를 다는 자리가 없다.** `EndpointDef` 에는 `response` 와
 * `query` 뿐이다. 그래서 「이 엔드포인트가 무슨 몸통을 받는가」를 기계가 알 수 없고,
 * 테스트 2,288건이 초록이어도 이런 어긋남은 통과한다.
 *
 * ⚠ 이 화면은 지금 **닫혀 있다** (`O-024` · `SETTING_DOORS_OPEN`). 그래도 고쳤다 —
 *   **열 때 다시 찾을 일을 남기지 않는다.**
 */

/** 화면(`apps/web/app/leagues/create/page.tsx`)이 실제로 보내는 몸통 */
const bodyFromScreen = (over: Record<string, unknown> = {}) => ({
  name: '테스트',
  slug: 'testleague',
  division_count: 1,
  map_ids: ['cmt61pdo10000vltgeoimihql'],
  player_limits: [5],
  agreements: {
    no_paid_invitation: true,
    responsible_operation: true,
    accept_deletion_policy: true,
  },
  captcha_token: 'mock',
  ...over,
})

describe('리그 만들기 계약 — 화면이 보내는 몸통 (O-030)', () => {
  it('★화면이 보내는 그대로 통과한다★', () => {
    const parsed = LeagueCreateInput.safeParse(bodyFromScreen())
    expect(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.issues)).toBe(true)
  })

  it('★배열로 보내면 깨진다 — 오늘까지 화면이 이 상태였다★', () => {
    const parsed = LeagueCreateInput.safeParse(bodyFromScreen({ agreements: [true, true, true] }))
    expect(parsed.success).toBe(false)
    expect(parsed.success ? [] : parsed.error.issues.map((i) => String(i.path[0]))).toContain(
      'agreements',
    )
  })

  it('동의 하나라도 빠지면 깨진다 (셋 다 필수다)', () => {
    for (const missing of [
      'no_paid_invitation',
      'responsible_operation',
      'accept_deletion_policy',
    ]) {
      const agreements: Record<string, boolean> = {
        no_paid_invitation: true,
        responsible_operation: true,
        accept_deletion_policy: true,
      }
      delete agreements[missing]
      expect(LeagueCreateInput.safeParse(bodyFromScreen({ agreements })).success, missing).toBe(
        false,
      )
    }
  })

  it('captcha_token 은 **필수**다 — 화면이 빼면 깨진다', () => {
    const { captcha_token: _drop, ...withoutCaptcha } = bodyFromScreen()
    expect(LeagueCreateInput.safeParse(withoutCaptcha).success).toBe(false)
  })
})
