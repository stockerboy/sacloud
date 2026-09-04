/**
 * **두 곳에 적힌 시즌 경계가 서로 같은가** (2026-09-04).
 *
 * ══ ★왜 이 검사가 생겼나★ ══
 *
 * 시즌0 시작이 ★두 파일에 따로 박혀★ 있었다.
 *
 * ```
 * apps/worker/src/lib/season0Window.ts   SEASON0_FROM      ← 래더·집계가 본다
 * packages/contract/src/seasonWindow.ts  SEASON_WINDOWS    ← 시즌 딱지(Match.seasonId)가 본다
 * ```
 *
 * 2026-09-04 에 앞의 것만 9/3 07:00 으로 옮겼더니 뒤의 것은 ★7/2 자정에 그대로 남았다.★
 * 그러면 ★같은 경기가 「시즌0 집계에는 안 들어가는데 시즌0 딱지는 붙은」★ 상태가 된다.
 * 화면 숫자와 시즌 표가 어긋나고, 어느 쪽이 맞는지 코드만 봐서는 알 수 없다.
 *
 * ★패키지 의존 방향 때문에 `contract` 가 `worker` 를 가져올 수 없다.★
 * 그래서 값을 지우고 하나로 합칠 수가 없다 — ★대신 이 검사가 둘이 같은지 본다.★
 * ★한쪽만 고치면 여기가 빨개진다.★
 *
 * ⚠ 이 검사를 통과시키려고 ★한쪽 값을 베껴 넣지 마라.★
 *   경계는 사장님이 정한다. ★두 파일을 같이 고치는 것★ 이 맞는 답이다.
 */
import { describe, expect, it } from 'vitest'
import { SEASON_WINDOWS } from '@sacloud/contract'
import { SEASON0_FROM, SEASON0_TO } from '../lib/season0Window.js'

const season0 = SEASON_WINDOWS.find((w) => w.number === 0)
const beta = SEASON_WINDOWS.find((w) => w.number === -1)

describe('시즌 경계는 두 파일에서 같은 값이어야 한다', () => {
  it('전제 — 시즌0 과 Beta 창이 표에 있다', () => {
    expect(season0).toBeDefined()
    expect(beta).toBeDefined()
  })

  it('★시즌0 시작 = SEASON0_FROM★', () => {
    expect(season0!.startedAt.toISOString()).toBe(SEASON0_FROM.toISOString())
  })

  it('★시즌0 끝 = SEASON0_TO★', () => {
    expect(season0!.endedAt?.toISOString() ?? null).toBe(SEASON0_TO?.toISOString() ?? null)
  })

  it('★Beta 는 시즌0 이 시작하는 바로 그 순간 끝난다★ — 사이에 빈 구간이 없다', () => {
    expect(beta!.endedAt?.toISOString()).toBe(SEASON0_FROM.toISOString())
  })

  it('창들이 앞뒤로 이어진다 — 겹치지도, 벌어지지도 않는다', () => {
    const sorted = [...SEASON_WINDOWS].sort((a, b) => a.number - b.number)
    for (let i = 0; i < sorted.length - 1; i += 1) {
      expect(sorted[i]!.endedAt?.toISOString()).toBe(sorted[i + 1]!.startedAt.toISOString())
    }
  })
})
