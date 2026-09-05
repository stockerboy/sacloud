/**
 * ★★한 실제 경기 = 활성 Match 정확히 1개 (코드 1차 방어)★★
 * (2026-09-05 · Part 3 ③단계).
 *
 * ── 여기서 고정하는 것
 * ```
 * 1 기준시각 이후 · 처음 보는 경기      → 만든다
 * 2 기준시각 이후 · 이미 있는 경기      → ★안 만든다★ (고장이 아니다)
 * 3 기준시각 ★이전★                   → 이 규칙 밖 (과거는 동결)
 * 4 ★숨긴 줄은 「있다」로 안 센다★      → 재분류가 가능해야 한다
 * 5 DB 가 튕긴 것이 「중복」인지 가린다   → 그 한 건만 넘기고 잡은 안 죽인다
 * 6 ★모르는 유니크 위반은 안 삼킨다★
 * ```
 *
 * ── ★왜 두 겹인가★
 *   1차만 두면 ★찾기와 만들기 사이의 틈★ 으로 두 판이 같이 들어간다.
 *   2차만 두면 ★평범한 재실행이 예외로 터진다.★ 둘 다 있어야 조용하고 안전하다.
 */
import { describe, expect, it } from 'vitest'
import { CANONICAL_FROM, decideCanonical, isDuplicateMatchError } from '../lib/canonicalMatch.js'
import { MIRROR_FREEZE_FROM } from '@sacloud/db/ops'

const KEY = '260904184353124001'
const AFTER = new Date(CANONICAL_FROM.getTime() + 60 * 60 * 1000)
const BEFORE = new Date(CANONICAL_FROM.getTime() - 1)

describe('기준시각', () => {
  it('★동결 기준시각과 같은 값이다★ — 두 곳에 다른 날짜가 있으면 안 된다', () => {
    expect(CANONICAL_FROM.toISOString()).toBe(MIRROR_FREEZE_FROM.toISOString())
    expect(CANONICAL_FROM.toISOString()).toBe('2026-09-02T22:00:00.000Z')
  })
})

describe('만들까 말까', () => {
  it('① 처음 보는 경기 → 만든다', () => {
    const d = decideCanonical(AFTER, KEY, new Map())
    expect(d.action).toBe('create')
  })

  it('② 이미 있는 경기 → 안 만든다 (고장이 아니다)', () => {
    const d = decideCanonical(AFTER, KEY, new Map([[KEY, 'M-1']]))
    expect(d.action).toBe('exists')
    if (d.action === 'exists') expect(d.existingMatchId).toBe('M-1')
  })

  it('③ 기준시각 ★직전★ → 이 규칙 밖 (과거는 동결)', () => {
    const d = decideCanonical(BEFORE, KEY, new Map())
    expect(d.action).toBe('out_of_scope')
    if (d.action === 'out_of_scope') expect(d.reason).toContain('동결')
  })

  it('★기준시각 정각은 규칙 안이다★ — 「이후」는 정각을 포함한다', () => {
    const d = decideCanonical(new Date(CANONICAL_FROM.getTime()), KEY, new Map())
    expect(d.action).toBe('create')
  })

  it('④ ★숨긴 줄은 「있다」로 안 센다★ — 재분류가 가능해야 한다', () => {
    /* 부르는 쪽이 ★살아 있는 줄만★ 담아 넘긴다. 숨긴 줄이 빠져 있으면 새로 만들 수 있다 */
    const liveOnly = new Map<string, string>() // 숨겨서 비었다
    expect(decideCanonical(AFTER, KEY, liveOnly).action).toBe('create')
  })
})

describe('DB 가 튕겼을 때 — 중복인지 가린다', () => {
  it('⑤ 새 자물쇠가 걸린 것은 중복이다', () => {
    expect(
      isDuplicateMatchError(
        new Error('Unique constraint failed on the constraint: `Match_new_sourceMatchId_key`'),
      ),
    ).toBe(true)
  })

  it('⑤ 옛 제약(leagueId·origin·sourceMatchId)도 중복이다', () => {
    expect(
      isDuplicateMatchError(
        new Error('Unique constraint failed on the fields: (`leagueId`,`origin`,`sourceMatchId`)'),
      ),
    ).toBe(true)
  })

  it('⑤ Prisma 코드로 와도 알아본다', () => {
    expect(
      isDuplicateMatchError(new Error('P2002 Unique constraint failed on the fields: (`sourceMatchId`)')),
    ).toBe(true)
  })

  it('⑥ ★모르는 유니크 위반은 안 삼킨다★', () => {
    expect(
      isDuplicateMatchError(new Error('Unique constraint failed on the fields: (`nexonOuid`)')),
    ).toBe(false)
  })

  it('⑥ 유니크와 무관한 오류도 안 삼킨다', () => {
    expect(isDuplicateMatchError(new Error("Can't reach database server"))).toBe(false)
    expect(isDuplicateMatchError(new Error('Foreign key constraint failed'))).toBe(false)
    expect(isDuplicateMatchError('그냥 글자')).toBe(false)
  })
})
