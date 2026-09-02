/**
 * 연속킬 재료 (D-260).
 *
 * 여기서 고정하는 것 —
 *   1. 간격 **2초 이하**가 이어진다. 2.0 은 이어지고 3초는 끊긴다
 *   2. 사슬은 **라운드를 넘지 않는다**
 *   3. 같은 죽음이 두 줄로 와도 **한 번만** 센다
 *   4. ★**라운드당 1 만 오른다** — `burstRounds` 는 「비율」이지 「횟수」가 아니다
 *   5. 옛 해석 (a)·(b) 의 재료도 그대로 쌓는다
 *
 * ⚠ **정정 (2026-09-02)** — 4번은 «분모는 **총 킬**이다» 였다.
 *   사용자가 **(c) 「연속킬을 한 번이라도 난 라운드 비율」**을 골랐다.
 *   옛 것은 안 지우고 그대로 시험한다 (`CLAUDE.md` 10-4).
 */
import { describe, expect, it } from 'vitest'
import {
  BURST_GAP_SECONDS_WIDE,
  BURST_MULTI_KILL_MIN,
  burstTalliesOf,
} from '../playerBurst'
import { BURST_GAP_SECONDS } from '../clanRound'
import type { RoundStateEvent } from '../roundState'

/** `A` 가 `victim` 을 `MM:SS` 에 잡았다 — 주체가 죽인 줄 */
const kill = (round: number, at: string, killer: string, victim: string): RoundStateEvent => ({
  round,
  event_time: at,
  event_type: 'kill',
  target_event_type: 'death',
  str_usn: killer,
  target_str_usn: victim,
})

/** 같은 킬을 **상대 클랜 응답 쪽**에서 본 줄 — 주체가 죽은 것으로 적힌다 */
const killMirrored = (
  round: number,
  at: string,
  killer: string,
  victim: string,
): RoundStateEvent => ({
  round,
  event_time: at,
  event_type: 'death',
  target_event_type: 'kill',
  str_usn: victim,
  target_str_usn: killer,
})

const tally = (events: RoundStateEvent[], usn = 'A') => burstTalliesOf(events).get(usn)

describe('연속킬 — 상수', () => {
  it('창은 `clanRound` 의 2초를 그대로 쓴다 (새로 만들지 않았다)', () => {
    expect(BURST_GAP_SECONDS).toBe(2)
  })

  it('예비 창과 「여러 명 잡은 라운드」 기준', () => {
    expect(BURST_GAP_SECONDS_WIDE).toBe(5)
    expect(BURST_MULTI_KILL_MIN).toBe(2)
  })
})

describe('연속킬 — 간격 경계값', () => {
  it('정확히 2.0초는 **이어진다** (이하)', () => {
    const result = tally([kill(1, '00:10', 'A', 'x'), kill(1, '00:12', 'A', 'y')])
    expect(result).toMatchObject({ kills: 2, chained: 1 })
  })

  it('3초는 끊긴다 — `event_time` 이 1초 해상도라 2.1초라는 값은 오지 않는다', () => {
    const result = tally([kill(1, '00:10', 'A', 'x'), kill(1, '00:13', 'A', 'y')])
    expect(result).toMatchObject({ kills: 2, chained: 0 })
  })

  it('같은 초에 둘을 잡으면 간격 0 이라 이어진다', () => {
    const result = tally([kill(1, '00:10', 'A', 'x'), kill(1, '00:10', 'A', 'y')])
    expect(result).toMatchObject({ kills: 2, chained: 1 })
  })

  it('셋이 이어지면 분자는 2 다 — 「사슬 수」가 아니라 「이어진 킬 수」', () => {
    const result = tally([
      kill(1, '00:10', 'A', 'x'),
      kill(1, '00:11', 'A', 'y'),
      kill(1, '00:13', 'A', 'z'),
    ])
    expect(result).toMatchObject({ kills: 3, chained: 2 })
  })

  it('첫 킬은 절대 분자에 들어가지 않는다 — 직전 킬이 없다', () => {
    expect(tally([kill(1, '00:10', 'A', 'x')])).toMatchObject({ kills: 1, chained: 0 })
  })
})

describe('연속킬 — 라운드 경계', () => {
  it('라운드가 바뀌면 사슬이 끊긴다 (`event_time` 은 경기 누적이다)', () => {
    /* 01:00 → 01:01 이지만 라운드가 다르다. 시각만 보면 이어져 보인다 */
    const result = tally([kill(1, '01:00', 'A', 'x'), kill(2, '01:01', 'A', 'y')])
    expect(result).toMatchObject({ kills: 2, chained: 0, killRounds: 2, multiKillRounds: 0 })
  })

  it('라운드를 못 읽는 줄은 분모에도 안 들어간다', () => {
    const result = tally([
      kill(1, '00:10', 'A', 'x'),
      { ...kill(1, '00:11', 'A', 'y'), round: null },
    ])
    expect(result).toMatchObject({ kills: 1, chained: 0 })
  })

  it('시각을 못 읽는 줄도 분모에서 뺀다', () => {
    const result = tally([
      kill(1, '00:10', 'A', 'x'),
      { ...kill(1, '00:11', 'A', 'y'), event_time: null },
    ])
    expect(result).toMatchObject({ kills: 1, chained: 0 })
  })
})

describe('연속킬 — 같은 죽음이 두 줄로 온다', () => {
  it('양 클랜 응답이 겹쳐도 한 번만 센다', () => {
    const result = tally([
      kill(1, '00:10', 'A', 'x'),
      killMirrored(1, '00:10', 'A', 'x'),
      kill(1, '00:12', 'A', 'y'),
    ])
    expect(result).toMatchObject({ kills: 2, chained: 1 })
  })

  it('두 응답의 시각이 1초 어긋나도 한 번만 센다 — 가장 이른 줄이 이긴다', () => {
    const result = tally([
      kill(1, '00:11', 'A', 'x'),
      killMirrored(1, '00:10', 'A', 'x'),
      kill(1, '00:12', 'A', 'y'),
    ])
    /* 00:10 이 남으므로 다음 킬(00:12)과의 간격은 2초 — 이어진다 */
    expect(result).toMatchObject({ kills: 2, chained: 1 })
  })
})

describe('연속킬 — 후자(「라운드당 2명」)도 함께 센다', () => {
  it('한 라운드 2킬이면 `multiKillRounds` 가 오른다', () => {
    const result = tally([
      kill(1, '00:10', 'A', 'x'),
      kill(1, '00:40', 'A', 'y'), // 30초 벌어져 전자로는 안 이어진다
      kill(2, '01:10', 'A', 'z'),
    ])
    expect(result).toMatchObject({
      kills: 3,
      chained: 0, // 전자: 0
      killRounds: 2,
      multiKillRounds: 1, // 후자: 1
    })
  })

  it('전자와 후자는 실제로 다른 값이다 — 둘을 구분할 수 있어야 한다', () => {
    const events = [
      kill(1, '00:10', 'A', 'x'),
      kill(1, '00:11', 'A', 'y'), // 이어짐
      kill(2, '01:00', 'A', 'z'),
      kill(2, '01:30', 'A', 'w'), // 안 이어짐. 그래도 「라운드당 2명」이다
    ]
    const result = tally(events)
    expect(result?.chained).toBe(1)
    expect(result?.multiKillRounds).toBe(2)
  })
})

describe('연속킬 — 넓은 창은 따로 센다 (재빌드 없이 바꾸려고)', () => {
  it('3초 간격은 2초 창에는 안 들어가고 5초 창에는 들어간다', () => {
    const result = tally([kill(1, '00:10', 'A', 'x'), kill(1, '00:13', 'A', 'y')])
    expect(result).toMatchObject({ chained: 0, chainedWide: 1 })
  })

  it('6초는 두 창 모두 끊긴다', () => {
    const result = tally([kill(1, '00:10', 'A', 'x'), kill(1, '00:16', 'A', 'y')])
    expect(result).toMatchObject({ chained: 0, chainedWide: 0 })
  })
})

describe('연속킬 — 선수를 섞지 않는다', () => {
  it('다른 사람의 킬은 내 사슬을 잇지 않는다', () => {
    const events = [
      kill(1, '00:10', 'A', 'x'),
      kill(1, '00:11', 'B', 'y'), // B 가 잡았다
      kill(1, '00:12', 'A', 'z'),
    ]
    const tallies = burstTalliesOf(events)
    /* A 의 두 킬은 00:10 · 00:12 라 간격 2초 — 이어진다 */
    expect(tallies.get('A')).toMatchObject({ kills: 2, chained: 1 })
    expect(tallies.get('B')).toMatchObject({ kills: 1, chained: 0 })
  })

  it('킬이 없는 사람은 지도에 아예 없다 — 0 으로 만들지 않는다 (D-106)', () => {
    const tallies = burstTalliesOf([kill(1, '00:10', 'A', 'x')])
    expect(tallies.has('x')).toBe(false)
  })
})

/**
 * ★사용자가 고른 정의 (c) — 「연속킬을 한 번이라도 낸 라운드 비율」★
 *
 * `burstRounds / killRounds` 다. 여기서 못 박는 것은 하나다 —
 * **한 라운드에 연쇄가 몇 번이든 `burstRounds` 는 1 만 오른다.**
 * 그것이 「비율」과 「횟수」를 가르는 자리이고, 틀려도 그림이 멀쩡해 보이는 종류의 버그다.
 */
describe('연속킬 — (c) 라운드 비율 (사용자 확정 · 2026-09-02)', () => {
  it('★한 라운드에 연쇄가 둘이어도 `burstRounds` 는 1 이다★', () => {
    /* 00:10 → 00:11 → 00:12 : 연쇄가 두 번(1→2, 2→3) 일어난다 */
    const result = tally([
      kill(1, '00:10', 'A', 'x'),
      kill(1, '00:11', 'A', 'y'),
      kill(1, '00:12', 'A', 'z'),
    ])
    /* 「이어진 킬 수」는 2 인데 */
    expect(result?.chained).toBe(2)
    /* 「몰아친 라운드 수」는 **1** 이다 */
    expect(result?.burstRounds).toBe(1)
    expect(result?.killRounds).toBe(1)
  })

  it('라운드가 다르면 각각 오른다', () => {
    const result = tally([
      kill(1, '00:10', 'A', 'x'),
      kill(1, '00:11', 'A', 'y'),
      kill(2, '01:30', 'A', 'z'),
      kill(2, '01:31', 'A', 'w'),
    ])
    expect(result?.burstRounds).toBe(2)
    expect(result?.killRounds).toBe(2)
  })

  it('연쇄가 없는 라운드는 `killRounds` 만 오른다 — 0 은 실제 관측이다 (D-106)', () => {
    const result = tally([
      kill(1, '00:10', 'A', 'x'),
      kill(1, '00:30', 'A', 'y'), // 20초 뒤 — 안 이어진다
      kill(2, '01:00', 'A', 'z'), // 라운드에 한 명만
    ])
    expect(result?.burstRounds).toBe(0)
    expect(result?.killRounds).toBe(2)
    expect(result?.kills).toBe(3)
  })

  it('라운드당 1킬만 내면 0 이다 — (c) 의 성질이고, 그대로 둔다', () => {
    const result = tally([
      kill(1, '00:10', 'A', 'x'),
      kill(2, '01:10', 'A', 'y'),
      kill(3, '02:10', 'A', 'z'),
    ])
    expect(result?.burstRounds).toBe(0)
    expect(result?.killRounds).toBe(3)
  })

  it('사슬은 라운드를 넘지 않는다 — `burstRounds` 도 마찬가지다', () => {
    /* 라운드 1 의 마지막과 라운드 2 의 첫 킬이 1초 차이지만 이어지면 안 된다 */
    const result = tally([kill(1, '00:59', 'A', 'x'), kill(2, '01:00', 'A', 'y')])
    expect(result?.burstRounds).toBe(0)
    expect(result?.chained).toBe(0)
    expect(result?.killRounds).toBe(2)
  })

  it('5초 창은 따로 센다 — 창을 바꿔도 재집계가 없게', () => {
    /* 3초 간격: 2초 창에는 안 들고 5초 창에는 든다 */
    const result = tally([kill(1, '00:10', 'A', 'x'), kill(1, '00:13', 'A', 'y')])
    expect(result?.burstRounds).toBe(0)
    expect(result?.burstRoundsWide).toBe(1)
  })

  /**
   * ⚠ `multiKillRounds` 를 `burstRounds` 대신 쓰면 안 된다.
   *
   * 그쪽은 **시간을 안 본다.** 라운드 처음과 끝에 하나씩 잡아도 오른다.
   * 운영 실측에서 두 지표의 순위상관이 **0.419** 였다 — 다른 지표다.
   */
  it('★`multiKillRounds` 는 대용이 아니다 — 시간을 안 본다★', () => {
    const result = tally([
      kill(1, '00:10', 'A', 'x'),
      kill(1, '01:40', 'A', 'y'), // 90초 뒤. 2킬이지만 몰아친 게 아니다
    ])
    expect(result?.multiKillRounds).toBe(1)
    expect(result?.burstRounds).toBe(0)
  })

  /* 옛 해석 (a) 는 지우지 않았다 — 되돌아갈 때 재집계가 없어야 한다 */
  it('옛 해석 (a) `chained / kills` 의 재료가 그대로 남아 있다', () => {
    const result = tally([
      kill(1, '00:10', 'A', 'x'),
      kill(1, '00:11', 'A', 'y'),
      kill(2, '01:30', 'A', 'z'),
    ])
    expect(result?.chained).toBe(1)
    expect(result?.kills).toBe(3)
    /* 같은 표본에서 (a) 와 (c) 가 **다른 값**이다 — 1/3 vs 1/2 */
    expect((result as { chained: number }).chained / (result as { kills: number }).kills).toBeCloseTo(1 / 3, 10)
    expect(
      (result as { burstRounds: number }).burstRounds /
        (result as { killRounds: number }).killRounds,
    ).toBeCloseTo(1 / 2, 10)
  })

  it('같은 죽음이 두 줄로 와도 라운드는 한 번만 센다', () => {
    const result = tally([
      kill(1, '00:10', 'A', 'x'),
      killMirrored(1, '00:10', 'A', 'x'), // 상대 응답에서 본 같은 킬
      kill(1, '00:11', 'A', 'y'),
    ])
    expect(result?.kills).toBe(2)
    expect(result?.burstRounds).toBe(1)
    expect(result?.killRounds).toBe(1)
  })
})
