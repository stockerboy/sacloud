/**
 * 신원 감시 판정 로직 테스트 (D-220).
 *
 * DB·API 를 쓰지 않는다 — 순수 함수만 본다. 그래서 빠르고, D-187 의 5초 타임아웃과 무관하다.
 */
import { describe, expect, it } from 'vitest'
import {
  diffIdentity,
  nextWatchAt,
  nextWatchTier,
  sweepSeconds,
  WATCH_INTERVAL_MINUTES,
} from '../lib/identityWatch.js'

describe('diffIdentity — 무엇이 달라졌나', () => {
  it('처음 보는 계정은 `first` 다', () => {
    expect(diffIdentity(null, { userName: '리릭', clanName: '엘리게이터' })).toBe('first')
  })

  it('닉만 바뀌면 `nickname`', () => {
    expect(
      diffIdentity({ userName: '리릭', clanName: '엘리게이터' }, { userName: '차코', clanName: '엘리게이터' }),
    ).toBe('nickname')
  })

  it('클랜만 바뀌면 `clan`', () => {
    expect(
      diffIdentity({ userName: '리릭', clanName: '엘리게이터' }, { userName: '리릭', clanName: '베리타스' }),
    ).toBe('clan')
  })

  it('둘 다 바뀌면 `nickname+clan`', () => {
    expect(
      diffIdentity({ userName: '리릭', clanName: '엘리게이터' }, { userName: '차코', clanName: '베리타스' }),
    ).toBe('nickname+clan')
  })

  it('그대로면 null — 이력에 줄을 남기지 않는다', () => {
    expect(
      diffIdentity({ userName: '리릭', clanName: '엘리게이터' }, { userName: '리릭', clanName: '엘리게이터' }),
    ).toBeNull()
  })

  it('빈 문자열과 null 을 같게 본다 — 안 그러면 안 바뀐 줄이 계속 쌓인다', () => {
    expect(diffIdentity({ userName: '리릭', clanName: null }, { userName: '리릭', clanName: '' })).toBeNull()
    expect(diffIdentity({ userName: '리릭', clanName: '' }, { userName: '리릭', clanName: null })).toBeNull()
  })

  it('앞뒤 공백은 값의 차이가 아니다', () => {
    expect(
      diffIdentity({ userName: '리릭', clanName: '엘리게이터' }, { userName: ' 리릭 ', clanName: '엘리게이터' }),
    ).toBeNull()
  })

  it('무소속이 되면 `clan` 변경이다', () => {
    expect(
      diffIdentity({ userName: '리릭', clanName: '엘리게이터' }, { userName: '리릭', clanName: null }),
    ).toBe('clan')
  })

  it('클랜에 새로 들어가도 `clan` 변경이다 — 가입 감지가 이 줄이다', () => {
    expect(
      diffIdentity({ userName: '리릭', clanName: null }, { userName: '리릭', clanName: '베리타스' }),
    ).toBe('clan')
  })
})

describe('nextWatchTier — 다음에 언제 볼 것인가', () => {
  const now = new Date('2026-08-31T12:00:00Z')

  it('이번에 바뀌었으면 hot — 연쇄 변경을 놓치지 않는다', () => {
    expect(nextWatchTier('nickname', null, now)).toBe('hot')
    expect(nextWatchTier('clan', null, now)).toBe('hot')
    expect(nextWatchTier('nickname+clan', null, now)).toBe('hot')
  })

  it('한 번도 안 바뀌었으면 cold', () => {
    expect(nextWatchTier(null, null, now)).toBe('cold')
    expect(nextWatchTier('first', null, now)).toBe('cold')
  })

  it('한 시간 안에 바뀐 적 있으면 hot', () => {
    expect(nextWatchTier(null, new Date('2026-08-31T11:30:00Z'), now)).toBe('hot')
  })

  it('하루 안에 바뀐 적 있으면 warm', () => {
    expect(nextWatchTier(null, new Date('2026-08-31T00:00:00Z'), now)).toBe('warm')
  })

  it('하루가 지났으면 cold', () => {
    expect(nextWatchTier(null, new Date('2026-08-29T12:00:00Z'), now)).toBe('cold')
  })
})

describe('nextWatchAt — 주기가 실제로 붙는다', () => {
  const now = new Date('2026-08-31T12:00:00Z')

  it('hot 은 2분 뒤', () => {
    expect(nextWatchAt('hot', now).toISOString()).toBe('2026-08-31T12:02:00.000Z')
  })

  it('cold 는 60분 뒤', () => {
    expect(nextWatchAt('cold', now).toISOString()).toBe('2026-08-31T13:00:00.000Z')
  })

  it('등급이 짧을수록 주기가 짧다', () => {
    expect(WATCH_INTERVAL_MINUTES.hot).toBeLessThan(WATCH_INTERVAL_MINUTES.warm)
    expect(WATCH_INTERVAL_MINUTES.warm).toBeLessThan(WATCH_INTERVAL_MINUTES.cold)
  })
})

describe('sweepSeconds — "얼마나 빠른가" 를 숫자로 답한다', () => {
  it('204명을 초당 2회로 돌면 102초다', () => {
    expect(sweepSeconds(204, 2)).toBe(102)
  })

  it('1,300명을 초당 2회로 돌면 650초 = 약 11분이다', () => {
    expect(sweepSeconds(1300, 2)).toBe(650)
  })

  it('속도를 올리면 그만큼 짧아진다', () => {
    expect(sweepSeconds(1300, 10)).toBe(130)
  })

  it('0 이하면 무한대다 — 0 으로 나누지 않는다', () => {
    expect(sweepSeconds(100, 0)).toBe(Number.POSITIVE_INFINITY)
  })
})

/**
 * 칭호까지 보는 확장 (2026-09-01 · 칭호 인증 `docs/TITLE_VERIFICATION_SPEC.md`).
 *
 * `title_name` 은 `user/basic` 응답에 원래부터 들어 있었는데 **파싱만 되고 버려지고 있었다.**
 * 같은 응답에서 꺼내 쓰는 것이라 넥슨 호출은 한 건도 늘지 않는다.
 */
describe('diffIdentity — 칭호', () => {
  it('칭호만 바뀌면 `title`', () => {
    expect(
      diffIdentity(
        { userName: '리릭', clanName: '엘리게이터', titleName: '신병' },
        { userName: '리릭', clanName: '엘리게이터', titleName: '상등병' },
      ),
    ).toBe('title')
  })

  it('셋 다 바뀌면 nickname → clan → title 순서로 이어 붙인다', () => {
    expect(
      diffIdentity(
        { userName: '리릭', clanName: '엘리게이터', titleName: '신병' },
        { userName: '차코', clanName: '베리타스', titleName: '상등병' },
      ),
    ).toBe('nickname+clan+title')
  })

  it('닉과 칭호만 바뀌면 `nickname+title`', () => {
    expect(
      diffIdentity(
        { userName: '리릭', clanName: '엘리게이터', titleName: '신병' },
        { userName: '차코', clanName: '엘리게이터', titleName: '상등병' },
      ),
    ).toBe('nickname+title')
  })

  it('칭호를 벗어도(빈 문자열 ↔ null) 바뀐 것으로 보지 않는다', () => {
    expect(
      diffIdentity(
        { userName: '리릭', clanName: '엘리게이터', titleName: '' },
        { userName: '리릭', clanName: '엘리게이터', titleName: null },
      ),
    ).toBeNull()
  })

  it('⚠ 한쪽만 칭호를 넘기면 칭호를 비교하지 않는다 — 옛 호출자를 깨지 않는다', () => {
    /* 넘기지 않는 것은 "칭호가 없다"가 아니라 "아직 안 보는 호출자"다.
       이걸 변경으로 읽으면 이력에 바뀌지 않았는데 바뀐 줄이 계속 쌓인다 */
    expect(
      diffIdentity(
        { userName: '리릭', clanName: '엘리게이터' },
        { userName: '리릭', clanName: '엘리게이터', titleName: '상등병' },
      ),
    ).toBeNull()
  })

  it('기존 두 칸만 쓰는 호출자는 그대로 동작한다', () => {
    expect(
      diffIdentity({ userName: '리릭', clanName: '엘리게이터' }, { userName: '차코', clanName: '엘리게이터' }),
    ).toBe('nickname')
  })
})

describe('nextWatchTier — 칭호 변경도 hot 이다', () => {
  const now = new Date('2026-09-01T02:00:00.000Z')

  it('칭호가 바뀌면 hot — 인증 도전을 기다리는 계정을 놓치지 않는다', () => {
    expect(nextWatchTier('title', null, now)).toBe('hot')
  })

  it('조합 변경도 hot', () => {
    expect(nextWatchTier('nickname+clan+title', null, now)).toBe('hot')
  })

  it('`first` 는 변경이 아니다', () => {
    expect(nextWatchTier('first', null, now)).toBe('cold')
  })
})
