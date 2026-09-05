/**
 * ★★원문 한 줄 → 경기 하나★★ (2026-09-05 · Part 3 ①단계).
 *
 * ── 여기서 고정하는 것
 * ```
 * 1 ★맵으로 거르지 않는다★ — 듀오든 제3보급창고든 그대로 통과시킨다 (값으로만 들고 나간다)
 * 2 시각은 ★경기키★ 에서 읽는다 (`match_time_date` 는 못 믿는다)
 * 3 ★없는 것을 지어내지 않는다★ — 못 읽으면 사유와 함께 실패
 * 4 ★무승부를 승리로 바꾸지 않는다★
 * 5 `lib/iplProject.ts` 의 시각 규칙과 ★같은 답★ 을 낸다 (둘이 갈라지면 깨진다)
 * ```
 *
 * ── ★1번이 이 파일의 이유다★
 *   옛 투영은 `제3보급창고` 를 박아 두고 그 밖의 맵을 버렸다. IPL 은 그 맵만 쓰니
 *   맞는 규칙이었지만 ★그 코드로 열산을 돌리면 열산 경기가 통째로 사라진다.★
 *   사장님: «특정 맵을 공통 필터로 박지 마라»
 *   ★실측(2026-09-05): 원문에 「듀오」 맵 경기가 실제로 들어 있다.★
 */
import { describe, expect, it } from 'vitest'
import { matchKeyToDate, normalizeBarracksMatch } from '../lib/matchNormalize.js'
import { matchKeyToDate as oldMatchKeyToDate } from '../lib/iplProject.js'

/** 실측 원문에서 우리가 보는 칸만 뽑은 것 (2026-09-05 · 운영) */
const REAL = {
  match_key: '260904184353124001',
  map_name: '듀오',
  plimit: 2,
  red_clan_name: 'Lucy_ClaN',
  blue_clan_name: 'recent.wct-',
  red_win_cnt: 10,
  blue_win_cnt: 5,
  match_type: 'C',
  is_clan: false,
}

const ok = (over: Record<string, unknown> = {}) => normalizeBarracksMatch({ ...REAL, ...over })

describe('정규화 — 읽을 수 있는 것만 읽는다', () => {
  it('실측 원문 한 줄을 그대로 옮긴다', () => {
    const r = ok()
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.match.matchKey).toBe('260904184353124001')
    expect(r.match.redClanName).toBe('Lucy_ClaN')
    expect(r.match.blueClanName).toBe('recent.wct-')
    expect(r.match.redWins).toBe(10)
    expect(r.match.blueWins).toBe(5)
    expect(r.match.winnerSide).toBe('red')
  })

  it('★맵으로 거르지 않는다★ — 듀오도 그대로 나온다', () => {
    const duo = ok({ map_name: '듀오' })
    expect(duo.ok).toBe(true)
    if (duo.ok) expect(duo.match.mapName).toBe('듀오')

    const supply = ok({ map_name: '제3보급창고' })
    expect(supply.ok).toBe(true)
    if (supply.ok) expect(supply.match.mapName).toBe('제3보급창고')

    /* ★맵을 아예 몰라도 통과한다★ — 무엇을 인정할지는 리그가 정한다 */
    const none = ok({ map_name: null })
    expect(none.ok).toBe(true)
    if (none.ok) expect(none.match.mapName).toBeNull()
  })

  it('한 팀 인원을 값으로 들고 나온다 — 여기서 5vs5 를 강요하지 않는다', () => {
    const two = ok({ plimit: 2 })
    expect(two.ok && two.match.playerLimit).toBe(2)
    const five = ok({ plimit: 5 })
    expect(five.ok && five.match.playerLimit).toBe(5)
    const unknown = ok({ plimit: null })
    expect(unknown.ok && unknown.match.playerLimit).toBeNull()
  })

  it('★시각은 경기키에서 읽는다★ (KST → UTC)', () => {
    const r = ok({ match_key: '260904184353124001' })
    expect(r.ok).toBe(true)
    /* 2026-09-04 18:43:53 KST = 09:43:53 UTC */
    if (r.ok) expect(r.match.startAt.toISOString()).toBe('2026-09-04T09:43:53.000Z')
  })

  it('★`match_time_date` 를 안 본다★ — 못 믿는 값이다', () => {
    const r = ok({ match_time_date: '0001-01-01T00:00:00' } as Record<string, unknown>)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.match.startAt.getUTCFullYear()).toBe(2026)
  })
})

describe('못 읽으면 사유와 함께 멈춘다 — 지어내지 않는다', () => {
  const cases: Array<[string, Record<string, unknown>, string]> = [
    ['경기키가 없다', { match_key: null }, 'bad_key'],
    ['경기키가 18자리가 아니다', { match_key: '12345' }, 'bad_key'],
    ['경기키에 글자가 섞였다', { match_key: '26090418435312400X' }, 'bad_key'],
    ['없는 날짜다 (2월 31일)', { match_key: '260231184353124001' }, 'bad_time'],
    ['red 클랜명이 비었다', { red_clan_name: '  ' }, 'no_clan_name'],
    ['blue 클랜명이 없다', { blue_clan_name: null }, 'no_clan_name'],
    ['양 팀이 같은 클랜이다', { blue_clan_name: 'Lucy_ClaN' }, 'same_clan'],
    ['승수가 없다', { red_win_cnt: null }, 'bad_score'],
    ['승수가 숫자가 아니다', { blue_win_cnt: '다섯' }, 'bad_score'],
    ['무승부다', { red_win_cnt: 5, blue_win_cnt: 5 }, 'draw'],
  ]

  for (const [label, over, code] of cases) {
    it(`${label} → ${code}`, () => {
      const r = ok(over)
      expect(r.ok).toBe(false)
      if (r.ok) return
      expect(r.code).toBe(code)
      /* ★사람이 읽는 사유가 반드시 있어야 한다★ — 숫자만 세면 나중에 원인을 모른다 */
      expect(r.reason.length).toBeGreaterThan(0)
    })
  }
})

describe('★옛 시각 규칙과 갈라지지 않는다★', () => {
  const keys = [
    '260904184353124001',
    '260903070000124001',
    '250101000000124001',
    '261231235959124001',
    '260231184353124001', // 없는 날짜
    '12345', // 짧다
  ]

  it('두 함수가 같은 답을 낸다', () => {
    for (const k of keys) {
      const a = matchKeyToDate(k)
      const b = oldMatchKeyToDate(k)
      expect(a?.toISOString() ?? null, `키 ${k}`).toBe(b?.toISOString() ?? null)
    }
  })
})
