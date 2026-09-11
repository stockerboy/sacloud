/**
 * 「그 경기에서 뛴 팀」을 **소속 근거에서만** 빼는 규칙 (2026-09-07 · 1순위 오염 차단).
 *
 * 여기서 지키는 것은 넷이다.
 *   1. 신뢰 행이 있으면 **그중 최신**이 소속이다 — 사이에 낀 「뛴 팀」 행이 밀어내지 못한다
 *   2. 신뢰 근거가 하나도 없으면 **`null`** 이다 — 「뛴 팀」으로 지어내지 않는다
 *   3. `SACLOUD_AFFILIATION_TRUST=off` 면 **옛 동작 그대로**다
 *   4. 「뛴 팀」 행도 **판수·승패·킬데스·rating 집계에는 그대로 들어간다** (행을 버리지 않는다)
 */
import { describe, expect, it, afterEach } from 'vitest'
import {
  accumulatePlayerRollups,
  type PlayerRollupRow,
} from './supplyRollup'
import {
  clanSourceTrusted,
  isTeamOnlyClanSource,
  affiliationTrustEnabled,
} from './affiliationTrust'

const MIRROR = 'supply-mirror'
const BARRACKS = 'barracks-battlelog'

/** 실제 배선과 **같은 방식**으로 행을 만든다 — 신뢰 판정은 출처에서 나온다 */
function row(
  day: number,
  source: string,
  clanSlug: string | null,
  extra: Partial<PlayerRollupRow> = {},
): PlayerRollupRow {
  return {
    playerId: 'P1',
    won: true,
    kill: 10,
    death: 5,
    assist: 1,
    headshot: 2,
    sourceRating: 3000 + day,
    clanSlug,
    clanTrusted: clanSourceTrusted(source),
    matchId: `M${String(day).padStart(3, '0')}`,
    startAt: new Date(Date.UTC(2026, 8, day)),
    ...extra,
  }
}

function rollupOf(rows: PlayerRollupRow[]) {
  return accumulatePlayerRollups(rows).get('P1')!
}

const RESET = process.env.SACLOUD_AFFILIATION_TRUST
afterEach(() => {
  if (RESET === undefined) delete process.env.SACLOUD_AFFILIATION_TRUST
  else process.env.SACLOUD_AFFILIATION_TRUST = RESET
})

describe('출처 판정', () => {
  it('barracks-battlelog 만 「뛴 팀」 출처다', () => {
    expect(isTeamOnlyClanSource(BARRACKS)).toBe(true)
    expect(isTeamOnlyClanSource(MIRROR)).toBe(false)
    expect(isTeamOnlyClanSource('nexon-detail')).toBe(false)
    expect(isTeamOnlyClanSource('supply-lineup')).toBe(false)
  })

  it('모르는 출처와 null 은 막지 않는다 — 모르는 것을 아는 척하지 않는다', () => {
    expect(isTeamOnlyClanSource(null)).toBe(false)
    expect(isTeamOnlyClanSource('앞으로-생길-출처')).toBe(false)
  })
})

describe('소속 근거 고르기', () => {
  it('① barracks 행이 최신이어도 소속은 직전 신뢰 행의 값이다', () => {
    const r = rollupOf([row(1, MIRROR, 'clanA'), row(2, BARRACKS, 'clanB')])
    expect(r.clanSlug).toBe('clanA')
    expect(r.clanTeamOnlyRows).toBe(1)
    expect(r.newestTrusted).toBe(false)
  })

  it('② barracks 행밖에 없으면 null 이다 — 「뛴 팀」으로 채우지 않는다', () => {
    const r = rollupOf([row(1, BARRACKS, 'clanB'), row(2, BARRACKS, 'clanC')])
    expect(r.clanSlug).toBeNull()
    expect(r.clanFrom).toBeNull()
    expect(r.clanTeamOnlyRows).toBe(2)
  })

  it('④ trusted A → barracks B → trusted C 면 최종은 C 다', () => {
    const r = rollupOf([
      row(1, MIRROR, 'clanA'),
      row(2, BARRACKS, 'clanB'),
      row(3, MIRROR, 'clanC'),
    ])
    expect(r.clanSlug).toBe('clanC')
    /* 최신 행이 신뢰 출처라 되돌아간 것이 아니다 — fallback 으로 세면 안 된다 */
    expect(r.newestTrusted).toBe(true)
    expect(r.clanTeamOnlyRows).toBe(1)
  })

  it('⑤ trusted A → barracks B → barracks C 면 최종은 A 다', () => {
    const r = rollupOf([
      row(1, MIRROR, 'clanA'),
      row(2, BARRACKS, 'clanB'),
      row(3, BARRACKS, 'clanC'),
    ])
    expect(r.clanSlug).toBe('clanA')
    expect(r.newestTrusted).toBe(false)
    expect(r.clanTeamOnlyRows).toBe(2)
  })

  it('입력 순서가 뒤섞여도 같은 답이다 (최신 판정은 startAt·matchId 로 고정)', () => {
    const rows = [
      row(3, BARRACKS, 'clanC'),
      row(1, MIRROR, 'clanA'),
      row(2, BARRACKS, 'clanB'),
    ]
    expect(rollupOf(rows).clanSlug).toBe('clanA')
  })

  it('신뢰 행의 `null`(무소속)은 그대로 살아 있다 — 근거 제외와 뜻이 다르다', () => {
    const r = rollupOf([row(1, MIRROR, 'clanA'), row(2, MIRROR, null)])
    expect(r.clanSlug).toBeNull()
    expect(r.clanFrom).not.toBeNull() // 「모른다」가 아니라 「무소속이다」
  })
})

describe('③ 되돌리기 스위치', () => {
  it('SACLOUD_AFFILIATION_TRUST=off 면 옛 동작 — 최신 barracks 가 이긴다', () => {
    process.env.SACLOUD_AFFILIATION_TRUST = 'off'
    expect(affiliationTrustEnabled()).toBe(false)
    const r = rollupOf([row(1, MIRROR, 'clanA'), row(2, BARRACKS, 'clanB')])
    expect(r.clanSlug).toBe('clanB')
    expect(r.clanTeamOnlyRows).toBe(0)
  })

  it('스위치를 되돌리면 새 동작으로 돌아온다', () => {
    delete process.env.SACLOUD_AFFILIATION_TRUST
    expect(affiliationTrustEnabled()).toBe(true)
    expect(rollupOf([row(1, MIRROR, 'clanA'), row(2, BARRACKS, 'clanB')]).clanSlug).toBe('clanA')
  })
})

describe('⑥ 행을 버리지 않는다', () => {
  it('barracks 행도 판수·승패·킬데스·rating 집계에 그대로 들어간다', () => {
    const withBarracks = rollupOf([
      row(1, MIRROR, 'clanA'),
      row(2, BARRACKS, 'clanB', { won: false, kill: 4, death: 7, assist: 3, headshot: 1 }),
    ])
    expect(withBarracks.games).toBe(2)
    expect(withBarracks.win).toBe(1)
    expect(withBarracks.lose).toBe(1)
    expect(withBarracks.kill).toBe(14)
    expect(withBarracks.death).toBe(12)
    expect(withBarracks.assist).toBe(4)
    expect(withBarracks.headshot).toBe(3)
    expect(withBarracks.knownStatGames).toBe(2)
    /* `sourceRating` 도 최신 행 기준 그대로다 — 소속 근거와 무관하다 */
    expect(withBarracks.rating).toBe(3002)
  })

  it('스위치를 꺼도 집계 숫자는 똑같다 — 바뀌는 것은 소속 하나뿐이다', () => {
    const rows = [
      row(1, MIRROR, 'clanA'),
      row(2, BARRACKS, 'clanB', { won: false, kill: 4, death: 7 }),
    ]
    const on = rollupOf(rows)
    process.env.SACLOUD_AFFILIATION_TRUST = 'off'
    const off = rollupOf(rows.map((r) => ({ ...r, clanTrusted: clanSourceTrusted(
      r.matchId === 'M002' ? BARRACKS : MIRROR,
    ) })))
    expect(off.games).toBe(on.games)
    expect(off.win).toBe(on.win)
    expect(off.lose).toBe(on.lose)
    expect(off.kill).toBe(on.kill)
    expect(off.death).toBe(on.death)
    expect(off.rating).toBe(on.rating)
    expect(off.clanSlug).not.toBe(on.clanSlug) // 소속만 달라진다
  })
})
