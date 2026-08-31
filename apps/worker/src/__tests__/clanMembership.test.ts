/**
 * D-219 `열산의심` 판정 테스트.
 *
 * 이 판정이 틀리면 **멀쩡한 경기에 딱지가 붙고 래더가 0 이 된다.** 그래서 촘촘히 본다.
 * 특히 세 가지를 지킨다.
 *   ① 관측 전 시점은 **모른다**고 해야 한다 (지어내면 근거 없는 딱지가 된다)
 *   ② 재료가 모자라면 `열산의심` 이 아니라 `판정보류` 다
 *   ③ 한쪽만 2명 이상이어도 `정상` 이다 (양쪽 다 모자랄 때만 의심)
 *
 * DB·API 를 쓰지 않는다 (D-187 의 5초 타임아웃과 무관하다).
 */
import { describe, expect, it } from 'vitest'
import {
  buildIntervals,
  clanAt,
  judgeSanplySuspect,
  SANPLY_MIN_OWN_MEMBERS,
  type ClanObservation,
  type Participant,
} from '../lib/clanMembership.js'

const d = (iso: string) => new Date(iso)

describe('buildIntervals — 관측을 구간으로 접는다', () => {
  it('관측이 없으면 구간도 없다', () => {
    expect(buildIntervals([])).toEqual([])
  })

  it('한 번 관측하면 열린 구간 하나다', () => {
    const obs: ClanObservation[] = [{ clanName: '엘리게이터', observedAt: d('2026-08-31T10:00:00Z') }]
    const iv = buildIntervals(obs)
    expect(iv).toHaveLength(1)
    expect(iv[0]!.clanName).toBe('엘리게이터')
    expect(iv[0]!.to).toBeNull()
  })

  it('같은 클랜이 이어지면 구간을 쪼개지 않는다 — 폴링이 잦아도 깨끗해야 한다', () => {
    const obs: ClanObservation[] = [
      { clanName: '엘리게이터', observedAt: d('2026-08-31T10:00:00Z') },
      { clanName: '엘리게이터', observedAt: d('2026-08-31T10:02:00Z') },
      { clanName: '엘리게이터', observedAt: d('2026-08-31T10:04:00Z') },
    ]
    expect(buildIntervals(obs)).toHaveLength(1)
  })

  it('클랜이 바뀌면 앞 구간이 닫히고 새 구간이 열린다', () => {
    const obs: ClanObservation[] = [
      { clanName: '엘리게이터', observedAt: d('2026-08-31T10:00:00Z') },
      { clanName: '베리타스', observedAt: d('2026-08-31T12:00:00Z') },
    ]
    const iv = buildIntervals(obs)
    expect(iv).toHaveLength(2)
    expect(iv[0]!.to?.toISOString()).toBe('2026-08-31T12:00:00.000Z')
    expect(iv[1]!.clanName).toBe('베리타스')
    expect(iv[1]!.to).toBeNull()
  })

  it('순서가 뒤섞여 들어와도 시간순으로 접는다', () => {
    const obs: ClanObservation[] = [
      { clanName: '베리타스', observedAt: d('2026-08-31T12:00:00Z') },
      { clanName: '엘리게이터', observedAt: d('2026-08-31T10:00:00Z') },
    ]
    const iv = buildIntervals(obs)
    expect(iv.map((x) => x.clanName)).toEqual(['엘리게이터', '베리타스'])
  })

  it('무소속(null)도 하나의 구간이다 — 탈퇴가 기록돼야 한다', () => {
    const obs: ClanObservation[] = [
      { clanName: '엘리게이터', observedAt: d('2026-08-31T10:00:00Z') },
      { clanName: null, observedAt: d('2026-08-31T11:00:00Z') },
      { clanName: '베리타스', observedAt: d('2026-08-31T12:00:00Z') },
    ]
    expect(buildIntervals(obs).map((x) => x.clanName)).toEqual(['엘리게이터', null, '베리타스'])
  })
})

describe('clanAt — 그 시각의 소속을 되짚는다', () => {
  const obs: ClanObservation[] = [
    { clanName: '엘리게이터', observedAt: d('2026-08-31T10:00:00Z') },
    { clanName: '베리타스', observedAt: d('2026-08-31T12:00:00Z') },
  ]
  const iv = buildIntervals(obs)

  it('관측이 하나도 없으면 모른다', () => {
    expect(clanAt([], d('2026-08-31T11:00:00Z'))).toEqual({ clanName: null, certainty: 'unknown' })
  })

  it('첫 관측보다 앞이면 **모른다** — 여기서 지어내면 안 된다', () => {
    const r = clanAt(iv, d('2026-08-01T00:00:00Z'))
    expect(r.certainty).toBe('unknown')
    expect(r.clanName).toBeNull()
  })

  it('닫힌 구간 안이면 그 클랜이고 `observed` 다', () => {
    expect(clanAt(iv, d('2026-08-31T11:00:00Z'))).toEqual({
      clanName: '엘리게이터',
      certainty: 'observed',
    })
  })

  it('구간 시작 시각 그 자체도 그 구간에 든다', () => {
    expect(clanAt(iv, d('2026-08-31T10:00:00Z')).clanName).toBe('엘리게이터')
  })

  it('마지막 관측 이후는 `after_last` — 약한 근거임을 표시한다', () => {
    const r = clanAt(iv, d('2026-09-01T00:00:00Z'))
    expect(r.clanName).toBe('베리타스')
    expect(r.certainty).toBe('after_last')
  })
})

/* ------------------------------------------------------------------ D-219 --- */

/** 판정 재료를 짧게 만드는 도우미 */
const p = (side: 'red' | 'blue', clan: string | null, certainty: 'observed' | 'unknown' = 'observed'): Participant => ({
  side,
  clanAt: { clanName: clan, certainty },
})

describe('judgeSanplySuspect — D-219 열산의심', () => {
  const RED = '엘리게이터'
  const BLUE = '베리타스'

  it('문턱은 2명이다 (사용자가 정했다)', () => {
    expect(SANPLY_MIN_OWN_MEMBERS).toBe(2)
  })

  it('양쪽 다 자기 클랜원 2명 미만이면 열산의심', () => {
    const r = judgeSanplySuspect({
      redClanName: RED,
      blueClanName: BLUE,
      participants: [
        p('red', RED), p('red', '딴클랜'), p('red', null), p('red', '딴클랜2'), p('red', null),
        p('blue', BLUE), p('blue', '딴클랜'), p('blue', null), p('blue', '딴클랜2'), p('blue', null),
      ],
    })
    expect(r.verdict).toBe('열산의심')
    if (r.verdict === '열산의심') {
      expect(r.redOwn).toBe(1)
      expect(r.blueOwn).toBe(1)
    }
  })

  it('한쪽만 2명 이상이어도 정상이다 — 양쪽 다 모자랄 때만 의심한다', () => {
    const r = judgeSanplySuspect({
      redClanName: RED,
      blueClanName: BLUE,
      participants: [
        p('red', RED), p('red', RED), p('red', null), p('red', null), p('red', null),
        p('blue', BLUE), p('blue', '딴클랜'), p('blue', null), p('blue', null), p('blue', null),
      ],
    })
    expect(r.verdict).toBe('정상')
  })

  it('양쪽 다 2명 이상이면 당연히 정상', () => {
    const r = judgeSanplySuspect({
      redClanName: RED,
      blueClanName: BLUE,
      participants: [
        p('red', RED), p('red', RED), p('red', RED), p('red', null), p('red', null),
        p('blue', BLUE), p('blue', BLUE), p('blue', null), p('blue', null), p('blue', null),
      ],
    })
    expect(r.verdict).toBe('정상')
  })

  it('소속을 아는 사람이 모자라면 **판정보류** — 의심이 아니다', () => {
    const r = judgeSanplySuspect({
      redClanName: RED,
      blueClanName: BLUE,
      participants: [
        p('red', RED), p('red', null, 'unknown'), p('red', null, 'unknown'),
        p('red', null, 'unknown'), p('red', null, 'unknown'),
        p('blue', BLUE), p('blue', null, 'unknown'), p('blue', null, 'unknown'),
        p('blue', null, 'unknown'), p('blue', null, 'unknown'),
      ],
    })
    expect(r.verdict).toBe('판정보류')
  })

  it('관측 이전 경기는 통째로 판정보류가 된다 — 과거를 의심으로 덮지 않는다', () => {
    const all = Array.from({ length: 10 }, (_, i) =>
      p(i < 5 ? 'red' : 'blue', null, 'unknown'),
    )
    const r = judgeSanplySuspect({ redClanName: RED, blueClanName: BLUE, participants: all })
    expect(r.verdict).toBe('판정보류')
  })

  it('한쪽만 재료가 모자라도 판정보류다 — 반쪽 근거로 판정하지 않는다', () => {
    const r = judgeSanplySuspect({
      redClanName: RED,
      blueClanName: BLUE,
      participants: [
        p('red', RED), p('red', RED), p('red', RED), p('red', RED), p('red', RED),
        p('blue', BLUE), p('blue', null, 'unknown'), p('blue', null, 'unknown'),
        p('blue', null, 'unknown'), p('blue', null, 'unknown'),
      ],
    })
    expect(r.verdict).toBe('판정보류')
  })

  it('`unknown` 인 사람은 자기 클랜원으로 세지 않는다', () => {
    const r = judgeSanplySuspect({
      redClanName: RED,
      blueClanName: BLUE,
      minKnownPerSide: 1,
      participants: [
        p('red', RED), p('red', RED, 'unknown'), p('red', RED, 'unknown'),
        p('blue', BLUE), p('blue', BLUE, 'unknown'), p('blue', BLUE, 'unknown'),
      ],
    })
    expect(r.verdict).toBe('열산의심')
    if (r.verdict === '열산의심') {
      expect(r.redOwn).toBe(1)
      expect(r.blueOwn).toBe(1)
    }
  })

  it('무소속(null)은 그 클랜원이 아니다', () => {
    const r = judgeSanplySuspect({
      redClanName: RED,
      blueClanName: BLUE,
      minKnownPerSide: 2,
      participants: [
        p('red', null), p('red', null), p('red', null),
        p('blue', null), p('blue', null), p('blue', null),
      ],
    })
    expect(r.verdict).toBe('열산의심')
  })

  it('minKnownPerSide 를 낮추면 더 많은 경기를 판정한다 — 기본은 보수적이다', () => {
    const participants = [
      p('red', RED), p('red', RED), p('red', null, 'unknown'),
      p('blue', BLUE), p('blue', BLUE), p('blue', null, 'unknown'),
    ]
    expect(judgeSanplySuspect({ redClanName: RED, blueClanName: BLUE, participants }).verdict).toBe(
      '판정보류',
    )
    expect(
      judgeSanplySuspect({ redClanName: RED, blueClanName: BLUE, participants, minKnownPerSide: 2 })
        .verdict,
    ).toBe('정상')
  })
})
