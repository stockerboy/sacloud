/**
 * 칭호 인증 판정 로직 테스트 (사양 4장 · D-228 제안).
 *
 * DB·API 를 쓰지 않는다 — 순수 함수만 본다. 그래서 빠르고, D-187 의 5초 타임아웃과 무관하다.
 *
 * **이 파일이 지키는 것은 하나다** — 「아무것도 안 한 계정이 통과하는 길」이 없다.
 */
import { describe, expect, it } from 'vitest'
import {
  CHALLENGE_TTL_MINUTES,
  MAX_ATTEMPTS,
  canManualCheck,
  effectiveStatus,
  isOpen,
  issueChallenge,
  nextCheckAt,
  nextCheckSeconds,
  normalizeTitle,
  pickTitle,
  sameTitle,
  verifyObservation,
  type ChallengeView,
} from '../lib/titleChallenge.js'

const T0 = new Date('2026-09-01T02:00:00.000Z')
const POOL = ['신병', '이등병', '일등병', '상등병'] as const

/** 열려 있는 기본 도전 하나 */
function openChallenge(over: Partial<ChallengeView> = {}): ChallengeView {
  return {
    ouid: 'ouid-aaa',
    baselineTitle: '신병',
    expectedTitle: '상등병',
    status: 'pending',
    issuedAt: T0,
    expiresAt: new Date(T0.getTime() + CHALLENGE_TTL_MINUTES * 60_000),
    attempts: 0,
    ...over,
  }
}

/** T0 로부터 n분 뒤 */
function at(minutes: number): Date {
  return new Date(T0.getTime() + minutes * 60_000)
}

describe('normalizeTitle — 빈 값과 미착용을 같게 본다', () => {
  it('빈 문자열·공백·null·undefined 는 전부 null 이다', () => {
    expect(normalizeTitle('')).toBeNull()
    expect(normalizeTitle('   ')).toBeNull()
    expect(normalizeTitle(null)).toBeNull()
    expect(normalizeTitle(undefined)).toBeNull()
  })

  it('앞뒤 공백을 떼고 NFC 로 모은다', () => {
    expect(normalizeTitle('  상등병  ')).toBe('상등병')
    /* 조합형(NFD)으로 들어와도 완성형과 같아진다 */
    expect(normalizeTitle('상등병'.normalize('NFD'))).toBe('상등병')
  })

  it('대소문자는 접지 않는다 — 서로 다른 칭호를 같게 만들지 않는다', () => {
    expect(sameTitle('Ace', 'ace')).toBe(false)
  })
})

describe('issueChallenge — 현재 칭호를 절대 지정하지 않는다', () => {
  it('현재 칭호는 후보에서 빠진다', () => {
    /* 후보가 둘뿐이고 그중 하나가 현재 칭호면, 남는 하나가 반드시 나온다 */
    const res = issueChallenge({
      ouid: 'ouid-aaa',
      currentTitle: '신병',
      pool: ['신병', '상등병'],
      hasOpenChallenge: false,
      now: T0,
    })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.challenge.expectedTitle).toBe('상등병')
    expect(res.challenge.baselineTitle).toBe('신병')
  })

  it('현재 칭호를 빼고 나면 후보가 없을 때 발급하지 않는다', () => {
    const res = issueChallenge({
      ouid: 'ouid-aaa',
      currentTitle: '신병',
      pool: ['신병'],
      hasOpenChallenge: false,
      now: T0,
    })
    expect(res).toEqual({ ok: false, reason: 'pool-exhausted' })
  })

  it('후보 목록이 비면 발급하지 않는다 — 지어내지 않는다', () => {
    const res = issueChallenge({
      ouid: 'ouid-aaa',
      currentTitle: null,
      pool: [],
      hasOpenChallenge: false,
      now: T0,
    })
    expect(res).toEqual({ ok: false, reason: 'no-pool' })
  })

  it('`ouid` 당 열린 도전은 하나뿐이다', () => {
    const res = issueChallenge({
      ouid: 'ouid-aaa',
      currentTitle: null,
      pool: [...POOL],
      hasOpenChallenge: true,
      now: T0,
    })
    expect(res).toEqual({ ok: false, reason: 'already-open' })
  })

  it('만료 시각은 발급 시각 + TTL 이다', () => {
    const res = issueChallenge({
      ouid: 'ouid-aaa',
      currentTitle: null,
      pool: [...POOL],
      hasOpenChallenge: false,
      now: T0,
    })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.challenge.expiresAt.getTime() - T0.getTime()).toBe(CHALLENGE_TTL_MINUTES * 60_000)
  })

  it('미착용(null)이면 후보를 하나도 빼지 않는다', () => {
    const picked = new Set<string>()
    for (let s = 0; s < 200; s += 1) {
      const res = issueChallenge({
        ouid: `ouid-${s}`,
        currentTitle: null,
        pool: [...POOL],
        hasOpenChallenge: false,
        now: T0,
      })
      if (res.ok) picked.add(res.challenge.expectedTitle)
    }
    expect(picked.size).toBe(POOL.length)
  })
})

describe('pickTitle — 결정적이다', () => {
  it('같은 입력이면 같은 결과다', () => {
    expect(pickTitle([...POOL], 'ouid-aaa', T0)).toBe(pickTitle([...POOL], 'ouid-aaa', T0))
  })

  it('항상 후보 안에서 고른다', () => {
    for (let s = 0; s < 500; s += 1) {
      expect(POOL).toContain(pickTitle([...POOL], `ouid-${s}`, T0))
    }
  })

  it('후보가 하나면 그것을 고른다', () => {
    expect(pickTitle(['상등병'], 'ouid-aaa', T0)).toBe('상등병')
  })
})

describe('effectiveStatus — 저장된 status 를 그대로 믿지 않는다', () => {
  it('유효기간이 지나면 pending 이라도 expired 다', () => {
    expect(effectiveStatus(openChallenge(), at(CHALLENGE_TTL_MINUTES + 1))).toBe('expired')
  })

  it('시도를 다 쓰면 exhausted 다', () => {
    expect(effectiveStatus(openChallenge({ attempts: MAX_ATTEMPTS }), at(1))).toBe('exhausted')
  })

  it('이미 통과한 도전은 시간이 지나도 verified 그대로다', () => {
    expect(effectiveStatus(openChallenge({ status: 'verified' }), at(999))).toBe('verified')
  })

  it('열려 있으면 pending 이다', () => {
    expect(isOpen(openChallenge(), at(1))).toBe(true)
  })
})

describe('verifyObservation — 통과 조건', () => {
  it('발급 이후에 지정 칭호로 바뀌면 통과한다', () => {
    expect(
      verifyObservation({
        challenge: openChallenge(),
        observedTitle: '상등병',
        observedAt: at(5),
      }),
    ).toBe('verified')
  })

  it('아직 baseline 그대로면 기다린다', () => {
    expect(
      verifyObservation({
        challenge: openChallenge(),
        observedTitle: '신병',
        observedAt: at(5),
      }),
    ).toBe('waiting')
  })

  it('엉뚱한 칭호로 바꾸면 wrong-title — 실패로 닫지 않는다', () => {
    expect(
      verifyObservation({
        challenge: openChallenge(),
        observedTitle: '일등병',
        observedAt: at(5),
      }),
    ).toBe('wrong-title')
  })

  it('칭호를 벗으면(null) 기다린다', () => {
    expect(
      verifyObservation({
        challenge: openChallenge(),
        observedTitle: null,
        observedAt: at(5),
      }),
    ).toBe('waiting')
  })

  it('앞뒤 공백이 붙어 와도 통과한다', () => {
    expect(
      verifyObservation({
        challenge: openChallenge(),
        observedTitle: '  상등병 ',
        observedAt: at(5),
      }),
    ).toBe('verified')
  })
})

describe('verifyObservation — 아무것도 안 한 계정이 통과하는 길이 없다', () => {
  it('⚠ 발급 **이전**의 관측으로는 통과하지 않는다', () => {
    /* 폴링이 캐시된 옛 응답을 늦게 들고 와도 통과하면 안 된다 */
    expect(
      verifyObservation({
        challenge: openChallenge(),
        observedTitle: '상등병',
        observedAt: new Date(T0.getTime() - 1000),
      }),
    ).toBe('waiting')
  })

  it('⚠ 만료된 도전은 정답 칭호를 관측해도 통과하지 않는다', () => {
    expect(
      verifyObservation({
        challenge: openChallenge(),
        observedTitle: '상등병',
        observedAt: at(CHALLENGE_TTL_MINUTES + 1),
      }),
    ).toBe('closed')
  })

  it('⚠ 시도를 다 쓴 도전은 정답을 관측해도 통과하지 않는다', () => {
    expect(
      verifyObservation({
        challenge: openChallenge({ attempts: MAX_ATTEMPTS }),
        observedTitle: '상등병',
        observedAt: at(1),
      }),
    ).toBe('closed')
  })

  it('⚠ 취소된 도전은 되살아나지 않는다', () => {
    expect(
      verifyObservation({
        challenge: openChallenge({ status: 'cancelled' }),
        observedTitle: '상등병',
        observedAt: at(1),
      }),
    ).toBe('closed')
  })

  it('⚠ baseline 과 expected 가 같은 도전은 애초에 발급되지 않는다', () => {
    /* 만약 발급됐다면 아무것도 안 하고 통과한다. `issueChallenge` 가 그 길을 막는다 */
    const res = issueChallenge({
      ouid: 'ouid-aaa',
      currentTitle: '상등병',
      pool: ['상등병'],
      hasOpenChallenge: false,
      now: T0,
    })
    expect(res.ok).toBe(false)
  })
})

describe('폴링 주기 — 처음엔 촘촘히, 나중엔 뜸하게', () => {
  it('단조 증가한다', () => {
    let prev = 0
    for (const attempts of [0, 4, 5, 11, 12, 23, 24, 100]) {
      const seconds = nextCheckSeconds(attempts)
      expect(seconds).toBeGreaterThanOrEqual(prev)
      prev = seconds
    }
  })

  it('⚠ 폴링만으로는 시도가 먼저 소진되지 않는다 — 만료가 먼저 온다', () => {
    let total = 0
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) total += nextCheckSeconds(i)
    /*
      이게 깨지면 무슨 일이 생기나 — 사람이 안내를 읽는 동안 폴링이 조용히
      시도를 다 써 버리고, 칭호를 바꿔도 `exhausted` 로 닫힌 뒤다.
      그래서 `MAX_ATTEMPTS` 는 **안전망**이고, 정상 종료는 만료여야 한다.
      사람이 「확인」을 손으로 누를 때만 그 여유분이 줄어든다.
    */
    expect(total).toBeGreaterThanOrEqual(CHALLENGE_TTL_MINUTES * 60)
  })

  it('nextCheckAt 은 now 에 그만큼을 더한다', () => {
    expect(nextCheckAt(0, T0).getTime() - T0.getTime()).toBe(15_000)
  })
})

describe('canManualCheck — 사람의 연타를 막는다', () => {
  it('처음이면 받아 준다', () => {
    expect(canManualCheck(null, T0)).toBe(true)
  })

  it('10초 안에 다시 누르면 막는다', () => {
    expect(canManualCheck(T0, new Date(T0.getTime() + 3_000))).toBe(false)
  })

  it('10초가 지나면 받아 준다', () => {
    expect(canManualCheck(T0, new Date(T0.getTime() + 10_000))).toBe(true)
  })
})
