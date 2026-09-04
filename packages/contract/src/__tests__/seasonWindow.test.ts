import { describe, expect, it } from 'vitest'
import { SEASON_WINDOWS_V1, SEASON_WINDOWS, seasonWindowAt } from '../seasonWindow'

/**
 * **시즌 경계를 지킨다** (O-046 · 2026-09-03).
 *
 * ══ 왜 이 파일이 있나 ══
 *
 * 경계 하루가 틀리면 **그날 경기가 통째로 다른 시즌으로 간다.** 그리고 그 위에
 * 주간 그래프(`O-045`)가 얹히므로 ★한 번 틀리면 그래프까지 같이 틀어진다.★
 *
 * 사장님이 못박으신 값 —
 * > (7/1 인지 7/2 인지 여쭙자) → «**2일이다 무조건 목요일이다**»
 * > «**Beta 3월시작이다**» · «10월 첫째주 목요일에 시즌1 정식오픈»
 *
 * ⚠ ★이 저장소에는 「7/1」이 주석 두 곳에 남아 있었다★
 *   (`season0Apply.ts:393` · `supplyRollup.ts:411` — 「사용자가 고른 것」이라고까지 적혀 있었다).
 *   ★그걸 보고 7/1 로 되돌리는 사람이 반드시 나온다.★ 그때 이 검사가 빨간 줄을 낸다.
 *   ⚠ 실제 계산이 그 날짜를 어디서 정하는지는 ★아직 못 찾았다★ `[미확인]`.
 *     그래서 진실을 `SEASON_WINDOWS` 한 곳에 새로 박았고, 이 검사가 그것을 지킨다.
 */

/** KST 로 읽는다 — 사람이 말하는 날짜와 맞춰 본다 */
function kst(d: Date): string {
  return new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 16).replace('T', ' ')
}

describe('시즌 경계', () => {
  /*
   * ⚠ ★2026-09-04 · 사장님이 시작을 다시 정하셨다★
   *   > «IPL은 전 기록 다 버리고 ★9월3일 오전 7시★ 를 기준으로 그 이후의 기록만 기록한다»
   *   ★옛 값 7/2 자정은 `SEASON_WINDOWS_V1` 에 남아 있다★ (지운 것이 아니다).
   */
  it('★시즌0 은 2026-09-03 07:00 에 시작한다 (7/2 가 아니다)★', () => {
    const s0 = SEASON_WINDOWS.find((w) => w.number === 0)
    expect(s0, '시즌0 창이 없다').toBeDefined()
    expect(kst(s0!.startedAt)).toBe('2026-09-03 07:00')
  })

  it('★옛 경계를 지우지 않았다★ — 되돌릴 값이 남아 있다 (`CLAUDE.md` 10-4)', () => {
    expect(kst(SEASON_WINDOWS_V1.season0StartedAt)).toBe('2026-07-02 00:00')
    expect(kst(SEASON_WINDOWS_V1.betaEndedAt)).toBe('2026-07-02 00:00')
  })

  it('★Beta 는 2026-03-05 에 시작한다 (1월이 아니다)★', () => {
    /* 손그림 x축이 6개월이라 3월로 바뀌었다. 1월로 되돌리면 여기서 깨진다 */
    const beta = SEASON_WINDOWS.find((w) => w.seasonType === 'beta')
    expect(beta, 'Beta 창이 없다').toBeDefined()
    expect(kst(beta!.startedAt)).toBe('2026-03-05 00:00')
  })

  it('시즌1 은 2026-10-01 에 시작한다', () => {
    const s1 = SEASON_WINDOWS.find((w) => w.number === 1)
    expect(kst(s1!.startedAt)).toBe('2026-10-01 00:00')
  })

  it('★창끼리 틈도 겹침도 없다★', () => {
    /*
     * 틈이 있으면 그 사이 경기가 ★어느 시즌에도 안 묶인다.★
     * 겹치면 ★먼저 걸리는 창이 이긴다★ — 조용히 틀린다. 둘 다 여기서 잡는다
     */
    for (let i = 1; i < SEASON_WINDOWS.length; i += 1) {
      const prev = SEASON_WINDOWS[i - 1]!
      const cur = SEASON_WINDOWS[i]!
      expect(prev.endedAt, `${prev.label} 의 끝이 없다`).not.toBeNull()
      expect(
        prev.endedAt!.getTime(),
        `${prev.label} 끝(${kst(prev.endedAt!)}) 과 ${cur.label} 시작(${kst(cur.startedAt)}) 이 안 맞는다`,
      ).toBe(cur.startedAt.getTime())
    }
  })

  it('번호가 겹치지 않는다 (@@unique([leagueId, number]))', () => {
    const nums = SEASON_WINDOWS.map((w) => w.number)
    expect(new Set(nums).size).toBe(nums.length)
  })

  it('★시즌0·시즌1 은 번호가 곧 이름이다★', () => {
    /* `officialSeasonLabel(n)` 이 `시즌 ${n}` 을 만든다. 번호를 비틀면 화면 이름이 틀어진다 */
    expect(SEASON_WINDOWS.find((w) => w.label === '시즌 0')!.number).toBe(0)
    expect(SEASON_WINDOWS.find((w) => w.label === '시즌 1')!.number).toBe(1)
  })

  it('경계의 그 순간이 어느 쪽에 드는가', () => {
    /* ★시즌0 이 시작하는 그 순간★ 은 시즌0 이다. Beta 의 끝이 아니다.
       날짜를 다시 적지 않는다 — 창에서 꺼내 쓰면 경계가 또 옮겨져도 이 검사는 살아 있다 */
    const boundary = SEASON_WINDOWS.find((w) => w.number === 0)!.startedAt
    expect(seasonWindowAt(boundary)?.number).toBe(0)
    /* 그 1분 전은 Beta */
    const before = new Date(boundary.getTime() - 60_000)
    expect(seasonWindowAt(before)?.seasonType).toBe('beta')
  })

  it('legacy 가 우리 기록 맨 처음(2024-05-24)보다 앞에서 시작한다', () => {
    const legacy = SEASON_WINDOWS.find((w) => w.seasonType === 'legacy')!
    expect(legacy.startedAt.getTime()).toBeLessThan(new Date('2024-05-24T00:00:00+09:00').getTime())
  })
})
