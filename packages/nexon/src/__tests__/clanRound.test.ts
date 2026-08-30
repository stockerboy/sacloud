/**
 * 클랜 지표 다섯 — 블루방어율 · 어택성공률 · 조직력 · 폭발력 · 게임템포
 * (`docs/SITE_SPEC_V2.md` 5-5절).
 *
 * 고정하려는 것
 *   1. **진영을 모르는 라운드는 분모에도 안 들어간다** (D-106)
 *   2. 진영은 `team_no` 가 아니라 **폭탄**이 말한다 (D-184)
 *   3. 조직력 30초는 **넘어야** 세고, 폭발력 2초는 **이하**면 이어진다
 *   4. 폭탄 설치는 라운드 단위로 접는다 — 두 줄로 와도 한 번이다
 *   5. 승패를 모르는 라운드도 설치·조직력·폭발력·템포에는 남는다
 *   6. 라운드 하나뿐이어도 무너지지 않고, 분모가 0 이면 비율은 **null 이다. 0 이 아니다**
 *   7. **소수싸움만 진영을 안 본다** — 폭탄이 없어 진영을 하나도 모르는 경기에서도 세어진다
 */
import { describe, expect, it } from 'vitest'
import {
  BURST_GAP_SECONDS,
  BURST_MIN_KILLS,
  ORGANIZED_SECONDS,
  burstCountOf,
  clanRoundTallyOf,
  outnumberedRound,
  per5,
  rateOf,
  roundClocksOf,
  tempoOf,
  type ClanRoundEvent,
} from '../clanRound'

/* -------------------------------------------------------------------------- */
/* 픽스처 — roundState.test.ts 의 관례를 그대로 쓴다                              */
/* -------------------------------------------------------------------------- */

interface Actor {
  usn: string
  /** `team_no` — 클랜 번호다. 진영이 아니다 (D-184) */
  team: string
}

/** 우리 클랜 5명 */
const A = (n: number): Actor => ({ usn: 'A' + n, team: '0' })
/** 상대 클랜 5명 */
const B = (n: number): Actor => ({ usn: 'B' + n, team: '1' })

/** 우리 팀의 `team_no` */
const US = '0'

/** 초 → `"MM:SS"` (경기 시작부터의 누적 시간) */
function clock(seconds: number): string {
  const mm = Math.floor(seconds / 60)
  const ss = seconds % 60
  return String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0')
}

/** 킬 줄 — 주체가 죽였고 상대가 죽었다 */
function kill(round: number, at: number, killer: Actor, dead: Actor): ClanRoundEvent {
  return {
    round: String(round),
    event_time: clock(at),
    event_type: 'kill',
    target_event_type: 'death',
    str_usn: killer.usn,
    team_no: killer.team,
    target_str_usn: dead.usn,
    target_team_no: dead.team,
  }
}

/** 같은 킬을 죽은 쪽에서 적은 줄 — 양쪽이 다 조회 클랜이면 이렇게 두 번 온다 */
function killed(round: number, at: number, dead: Actor, killer: Actor): ClanRoundEvent {
  return {
    round: String(round),
    event_time: clock(at),
    event_type: 'death',
    target_event_type: 'kill',
    str_usn: dead.usn,
    team_no: dead.team,
    target_str_usn: killer.usn,
    target_team_no: killer.team,
  }
}

/** 죽음이 아닌 줄 — 명단에는 올라가지만 라운드 복원에는 잡히면 안 된다 */
function meet(round: number, at: number, a: Actor, b: Actor): ClanRoundEvent {
  return {
    round: String(round),
    event_time: clock(at),
    event_type: 'hit',
    target_event_type: 'hit',
    str_usn: a.usn,
    team_no: a.team,
    target_str_usn: b.usn,
    target_team_no: b.team,
  }
}

/** 5대5 명단만 세워 두는 줄들 — 죽음은 한 건도 만들지 않는다 */
function fullRoster(): ClanRoundEvent[] {
  return [1, 2, 3, 4, 5].map((n) => meet(1, 0, A(n), B(n)))
}

/** 폭탄 줄 — 실측 응답처럼 행위자가 `target_*` 에 실린다 (roundSide.test.ts 와 같다) */
function bomb(round: number, at: number, team: string, action: 'install' | 'dismantle'): ClanRoundEvent {
  return {
    round: String(round),
    event_time: clock(at),
    event_type: '',
    weapon: '',
    team_no: '',
    target_weapon: action === 'install' ? 'c4-install' : 'c4-dismantle',
    target_team_no: team,
    target_event_type: 'bomb',
  }
}

/**
 * 진영을 확정시키는 최소 근거 — 우리 팀(`0`)이 1라운드 수비, 2라운드부터 공격.
 *
 * `roundSidesOf` 는 교대가 한 번뿐이라는 성질로 앞뒤를 채우므로,
 * 이 두 줄만 있으면 1라운드는 수비 · 2라운드 이후는 전부 공격이 된다.
 *
 * ⚠ **폭탄 줄도 그 라운드의 이벤트다.** 설치 시각이 그 라운드의 첫 이벤트보다 이르면
 * 라운드 시작(근사)이 그쪽으로 당겨진다 — 그래서 시각을 받는다.
 */
function sideEvidence(installAt = 90): ClanRoundEvent[] {
  return [bomb(1, 30, US, 'dismantle'), bomb(2, installAt, US, 'install')]
}

/** 지정한 라운드만 이겼다고 답하는 `wonRound` */
const wonOnly =
  (...rounds: number[]) =>
  (round: number): boolean =>
    rounds.includes(round)

/** 승패를 모른다 */
const wonUnknown = (): null => null

/** 기본 입력 — 우리 팀 `0` · 5대5 */
function tallyOf(events: ClanRoundEvent[], wonRound: (round: number) => boolean | null) {
  return clanRoundTallyOf({ events, teamNo: US, teamSize: 5, wonRound })
}

/* -------------------------------------------------------------------------- */
/* roundClocksOf                                                               */
/* -------------------------------------------------------------------------- */

describe('roundClocksOf — 라운드의 처음과 끝', () => {
  it('입력 순서가 아니라 **가장 이른 시각**이 시작이다', () => {
    const events = [kill(1, 50, A(1), B(1)), kill(1, 10, B(2), A(2)), kill(1, 30, A(3), B(3))]
    expect(roundClocksOf(events).get(1)).toEqual({ first: 10, last: 50 })
  })

  it('폭탄 줄도 그 라운드의 이벤트로 센다 — 죽음만 보지 않는다', () => {
    const events = [kill(1, 50, A(1), B(1)), bomb(1, 5, US, 'install')]
    expect(roundClocksOf(events).get(1)).toEqual({ first: 5, last: 50 })
  })

  it('시각을 못 읽는 줄은 버린다 — **0초로 밀어 넣지 않는다**', () => {
    const events = [{ ...kill(1, 50, A(1), B(1)), event_time: 'abc' }, kill(1, 30, A(2), B(2))]
    expect(roundClocksOf(events).get(1)).toEqual({ first: 30, last: 30 })
  })

  it('라운드는 1부터다 — null · 빈 문자열 · 0 인 줄은 버린다', () => {
    const events = [
      { ...kill(1, 10, A(1), B(1)), round: null },
      { ...kill(1, 20, A(1), B(2)), round: '' },
      { ...kill(1, 30, A(1), B(3)), round: '0' },
    ]
    expect(roundClocksOf(events).size).toBe(0)
  })
})

/* -------------------------------------------------------------------------- */
/* burstCountOf — 폭발력의 알맹이                                                */
/* -------------------------------------------------------------------------- */

describe('burstCountOf — 2초 이하 간격 3연속', () => {
  it('사양 원문 예시 `00:41 → 00:42 → 00:44` 는 **한 번**이다', () => {
    expect(burstCountOf([41, 42, 44])).toBe(1)
  })

  it('간격이 정확히 2초면 **이어진다** — "2초 이하" 다', () => {
    expect(burstCountOf([10, 12, 14])).toBe(1)
  })

  it('간격이 3초면 끊긴다', () => {
    expect(burstCountOf([10, 13, 15])).toBe(0)
  })

  it('둘만 이어지면 세지 않는다 — 3명 이상이어야 한다', () => {
    expect(burstCountOf([10, 11])).toBe(0)
  })

  it('다섯이 이어져도 **한 번**이다 — 조합의 수가 아니라 횟수다', () => {
    expect(burstCountOf([10, 11, 12, 13, 14])).toBe(1)
  })

  it('끊겼다가 다시 이어지면 두 번이다', () => {
    expect(burstCountOf([10, 11, 12, 40, 41, 42])).toBe(2)
  })

  it('마지막에 이어진 것도 빠뜨리지 않는다', () => {
    expect(burstCountOf([10, 30, 31, 32])).toBe(1)
  })

  it('같은 초에 죽어도 간격 0 이라 이어진다', () => {
    expect(burstCountOf([10, 10, 10])).toBe(1)
  })

  it('표본이 모자라면 0 이다', () => {
    expect(burstCountOf([])).toBe(0)
    expect(burstCountOf([10])).toBe(0)
  })

  it('상수는 사양 그대로다 — 2초 · 3명', () => {
    expect(BURST_GAP_SECONDS).toBe(2)
    expect(BURST_MIN_KILLS).toBe(3)
  })
})

/* -------------------------------------------------------------------------- */
/* 진영을 모르면 아무것도 세지 않는다                                             */
/* -------------------------------------------------------------------------- */

describe('clanRoundTallyOf — 진영을 모르는 라운드', () => {
  it('라운드를 하나도 못 읽으면 **null 이다. 0 이 아니다**', () => {
    expect(tallyOf([], wonOnly(1))).toBeNull()
    expect(tallyOf([{ ...kill(1, 10, A(1), B(1)), round: null }], wonOnly(1))).toBeNull()
  })

  it('폭탄이 한 번도 안 터진 경기는 **진영을 하나도 모른다** — 분모가 전부 0 이다', () => {
    const events = [...fullRoster(), kill(1, 10, A(1), B(1)), kill(2, 20, A(1), B(2))]
    const tally = tallyOf(events, wonOnly(1, 2))
    expect(tally?.rounds).toBe(2)
    expect(tally?.sidedRounds).toBe(0)
    expect(tally?.defenseRounds).toBe(0)
    expect(tally?.attackRounds).toBe(0)
    expect(tally?.attackSideRounds).toBe(0)
    expect(tally?.roundSpans).toEqual([])
  })

  it('교대 구간 안쪽처럼 **비어 있는 라운드**는 분모에 들어가지 않는다', () => {
    /* 1라운드 수비 · 4라운드 공격 → 2·3 라운드는 어디서 바뀌었는지 모른다 */
    const events = [
      ...fullRoster(),
      bomb(1, 30, US, 'dismantle'),
      bomb(4, 200, US, 'install'),
      kill(2, 100, A(1), B(1)),
      kill(3, 150, A(1), B(2)),
    ]
    const tally = tallyOf(events, wonOnly(1, 2, 3, 4))
    expect(tally?.rounds).toBe(4)
    /* 1(수비) · 4(공격) 만 안다 */
    expect(tally?.sidedRounds).toBe(2)
    expect(tally?.defenseRounds).toBe(1)
    expect(tally?.attackSideRounds).toBe(1)
  })

  it('교대를 못 보면 `switchRound` 가 null 이다 — **그 경기는 지표에 쓰면 안 된다**', () => {
    /*
      설치 근거만 있으면 아는 라운드가 "우리가 심은 공격 라운드" 뿐이다.
      그 라운드는 정의상 설치 성공률 100% 이고 승률도 높다 — 표본이 근거와 같아진다.
      실측(2026-08-30)에서 이 편향이 그대로 나왔다: 전체로 재면 설치가 5라운드중 4.0번,
      교대를 본 경기만 재면 2.1번이었다.
    */
    const events = [...fullRoster(), bomb(2, 90, US, 'install'), kill(2, 100, A(1), B(1))]
    const tally = tallyOf(events, wonOnly(2))
    expect(tally?.switchRound).toBeNull()
    expect(tally?.attackSideRounds).toBe(1)
    expect(tally?.plantRounds).toBe(1)
  })

  it('교대를 보면 `switchRound` 가 그 라운드다 — 그때만 진영이 라운드 전체에 채워진다', () => {
    const events = [
      ...fullRoster(),
      ...sideEvidence(),
      kill(1, 10, A(1), B(1)),
      kill(2, 100, A(1), B(2)),
      kill(3, 200, A(1), B(3)),
    ]
    const tally = tallyOf(events, wonUnknown)
    expect(tally?.switchRound).toBe(2)
    /* 3라운드는 폭탄이 없는데도 공격으로 채워진다 */
    expect(tally?.sidedRounds).toBe(3)
    expect(tally?.attackSideRounds).toBe(2)
  })

  it('근거가 어긋나면 아무것도 확정하지 않는다 — conflict 를 그대로 알린다', () => {
    const events = [
      ...fullRoster(),
      bomb(1, 30, US, 'install'),
      bomb(1, 40, US, 'dismantle'),
      kill(1, 50, A(1), B(1)),
    ]
    const tally = tallyOf(events, wonOnly(1))
    expect(tally?.sideConflict).toBe(true)
    expect(tally?.sidedRounds).toBe(0)
  })

  it('`team_no` 를 진영으로 읽지 않는다 — 상대 팀 폭탄은 우리 진영을 뒤집는다', () => {
    /* 상대(`1`)가 1라운드에 심었다 = 그 라운드 우리는 **수비**다 */
    const events = [...fullRoster(), bomb(1, 30, '1', 'install'), kill(1, 50, B(1), A(1))]
    const tally = clanRoundTallyOf({ events, teamNo: US, teamSize: 5, wonRound: wonOnly() })
    /* 우리 팀 근거가 없으므로 우리 진영은 모른다 — 상대 것을 우리 것으로 읽지 않는다 */
    expect(tally?.sidedRounds).toBe(0)
  })
})

/* -------------------------------------------------------------------------- */
/* 1 블루방어율                                                                 */
/* -------------------------------------------------------------------------- */

describe('블루방어율 — 수비 라운드 중 내준 비율', () => {
  /** 1~3 라운드 수비 · 4 라운드부터 공격 */
  function halves(): ClanRoundEvent[] {
    return [
      ...fullRoster(),
      bomb(3, 100, US, 'dismantle'),
      bomb(4, 150, US, 'install'),
      kill(1, 10, A(1), B(1)),
      kill(2, 50, B(1), A(1)),
      kill(3, 90, B(1), A(2)),
      kill(4, 140, A(1), B(2)),
    ]
  }

  it('진 수비 라운드만 "허용" 으로 센다', () => {
    const tally = tallyOf(halves(), wonOnly(1, 4))
    expect(tally?.defenseRounds).toBe(3)
    expect(tally?.defenseConceded).toBe(2)
  })

  it('사양 표기 그대로 **5라운드중 몇 라운드**로 환산된다', () => {
    const tally = tallyOf(halves(), wonOnly(1, 4))
    expect(per5(tally?.defenseConceded ?? 0, tally?.defenseRounds ?? 0)).toBeCloseTo(3.3333, 3)
  })

  it('승패를 모르는 라운드는 **분모에도 안 들어간다** — 이긴 쪽으로도 진 쪽으로도 안 민다', () => {
    const tally = tallyOf(halves(), wonUnknown)
    expect(tally?.defenseRounds).toBe(0)
    expect(tally?.defenseConceded).toBe(0)
    expect(per5(0, 0)).toBeNull()
  })

  it('수비 라운드가 하나뿐이어도 잰다', () => {
    const events = [...fullRoster(), ...sideEvidence(), kill(1, 20, B(1), A(1))]
    const tally = tallyOf(events, wonOnly(2))
    expect(tally?.defenseRounds).toBe(1)
    expect(tally?.defenseConceded).toBe(1)
    expect(per5(1, 1)).toBe(5)
  })
})

/* -------------------------------------------------------------------------- */
/* 2 어택성공률                                                                 */
/* -------------------------------------------------------------------------- */

describe('어택성공률 — 공격 라운드 중 딴 비율 + 폭탄 설치', () => {
  /** 1라운드 수비 · 2~4 라운드 공격. 2·4 라운드에 설치 성공 */
  function attacks(): ClanRoundEvent[] {
    return [
      ...fullRoster(),
      bomb(1, 30, US, 'dismantle'),
      bomb(2, 90, US, 'install'),
      bomb(4, 230, US, 'install'),
      kill(1, 20, B(1), A(1)),
      kill(2, 80, A(1), B(1)),
      kill(3, 150, B(2), A(2)),
      kill(4, 220, A(1), B(2)),
    ]
  }

  it('딴 공격 라운드만 분자다', () => {
    const tally = tallyOf(attacks(), wonOnly(2, 4))
    expect(tally?.attackRounds).toBe(3)
    expect(tally?.attackWon).toBe(2)
  })

  it('설치는 **라운드 수 기준**이다 — 분모는 승패를 몰라도 되는 공격 라운드다', () => {
    const tally = tallyOf(attacks(), wonUnknown)
    expect(tally?.attackRounds).toBe(0)
    expect(tally?.attackSideRounds).toBe(3)
    expect(tally?.plantRounds).toBe(2)
    expect(per5(2, 3)).toBeCloseTo(3.3333, 3)
  })

  it('같은 설치가 두 줄로 와도 **한 번**이다 — 양 클랜 응답을 합치면 그렇게 온다', () => {
    const events = [
      ...attacks(),
      /* 같은 설치가 `weapon`/`team_no` 쪽에 실려 한 번 더 온다 */
      { round: '2', event_time: clock(90), weapon: 'c4-install', team_no: US, target_team_no: '1' },
    ]
    const tally = tallyOf(events, wonUnknown)
    expect(tally?.plantRounds).toBe(2)
  })

  it('상대가 심은 것은 우리 설치가 아니다', () => {
    const events = [...attacks(), bomb(3, 160, '1', 'install')]
    const tally = tallyOf(events, wonUnknown)
    expect(tally?.plantRounds).toBe(2)
  })

  it('공격 라운드가 없으면 분모가 0 이고 비율은 **null 이다**', () => {
    /* 폭탄 근거가 해체 하나뿐이면 교대를 못 봐서 그 라운드만 수비로 안다 */
    const events = [...fullRoster(), bomb(1, 30, US, 'dismantle'), kill(1, 40, B(1), A(1))]
    const tally = tallyOf(events, wonOnly())
    expect(tally?.attackSideRounds).toBe(0)
    expect(per5(tally?.attackWon ?? 0, tally?.attackRounds ?? 0)).toBeNull()
  })
})

/* -------------------------------------------------------------------------- */
/* 3 조직력                                                                     */
/* -------------------------------------------------------------------------- */

describe('조직력 — 공격 라운드 시작 후 30초 넘게 아무도 안 죽음', () => {
  /** 2라운드(공격)에서 우리 첫 죽음이 `firstDeathAt` 인 경기. 라운드 첫 이벤트는 100초 */
  function organized(firstDeathAt: number): ClanRoundEvent[] {
    return [
      ...fullRoster(),
      ...sideEvidence(100),
      /* 2라운드 첫 이벤트 = 100초 (우리가 상대를 잡았다) */
      kill(2, 100, A(1), B(1)),
      kill(2, firstDeathAt, B(2), A(1)),
    ]
  }

  it('30초를 **넘겨야** 센다 — 정확히 30초는 세지 않는다', () => {
    /* 100초 시작 · 130초 첫 죽음 = 정확히 30초 */
    expect(tallyOf(organized(130), wonUnknown)?.organizedHeld).toBe(0)
    /* 1초만 더 버티면 센다 */
    expect(tallyOf(organized(131), wonUnknown)?.organizedHeld).toBe(1)
    expect(ORGANIZED_SECONDS).toBe(30)
  })

  it('분모는 잰 공격 라운드 수다 — 못 버틴 라운드도 분모에는 남는다', () => {
    const tally = tallyOf(organized(110), wonUnknown)
    expect(tally?.organizedRounds).toBe(1)
    expect(tally?.organizedHeld).toBe(0)
  })

  it('버틴 시간을 그대로 남긴다 — 기준을 바꿔도 다시 수집하지 않게', () => {
    expect(tallyOf(organized(110), wonUnknown)?.holdSeconds).toEqual([10])
    expect(tallyOf(organized(131), wonUnknown)?.holdSeconds).toEqual([31])
  })

  it('라운드 첫 이벤트가 이미 우리 죽음이면 0 이다 — **원리적으로 못 잰다**', () => {
    /* 넥슨이 라운드 시작 시각을 안 준다. 첫 이벤트 이전을 볼 방법이 없다 */
    const events = [
      ...fullRoster(),
      ...sideEvidence(200),
      kill(2, 100, B(1), A(1)),
      kill(2, 160, A(2), B(2)),
    ]
    const tally = tallyOf(events, wonUnknown)
    expect(tally?.holdSeconds).toEqual([0])
    expect(tally?.organizedHeld).toBe(0)
  })

  it('아무도 안 죽었으면 **관측 구간 전체**로 잰다', () => {
    const events = [
      ...fullRoster(),
      ...sideEvidence(100),
      kill(2, 100, A(1), B(1)),
      kill(2, 140, A(1), B(2)),
    ]
    expect(tallyOf(events, wonUnknown)?.organizedHeld).toBe(1)
  })

  it('우리 팀 죽음만 본다 — 상대가 아무리 죽어도 조직력은 안 끊긴다', () => {
    const events = [
      ...fullRoster(),
      ...sideEvidence(100),
      kill(2, 100, A(1), B(1)),
      kill(2, 105, A(1), B(2)),
      kill(2, 110, A(1), B(3)),
      kill(2, 135, B(4), A(1)),
    ]
    expect(tallyOf(events, wonUnknown)?.organizedHeld).toBe(1)
  })

  it('수비 라운드는 조직력에 들어가지 않는다 — 사양이 **레드**라고 못 박았다', () => {
    const events = [
      ...fullRoster(),
      ...sideEvidence(200),
      /* 1라운드(수비)에서 100초를 버텨도 안 센다 */
      kill(1, 0, A(1), B(1)),
      kill(1, 100, B(1), A(1)),
      kill(2, 200, A(1), B(2)),
      kill(2, 205, B(2), A(1)),
    ]
    const tally = tallyOf(events, wonUnknown)
    expect(tally?.organizedRounds).toBe(1)
    expect(tally?.organizedHeld).toBe(0)
  })

  it('5대5가 확인 안 되면 **분모를 0 으로 둔다** — 빠진 죽음이 없는 조직력을 만든다', () => {
    /* 한 팀이 4명뿐이다 */
    const roster = [1, 2, 3, 4].map((n) => meet(1, 0, A(n), B(n))).concat(meet(1, 0, A(1), B(5)))
    const events = [...roster, ...sideEvidence(), kill(2, 100, A(1), B(1)), kill(2, 200, A(1), B(2))]
    const tally = tallyOf(events, wonUnknown)
    expect(tally?.organizedRounds).toBe(0)
    expect(tally?.organizedHeld).toBe(0)
    /* 나머지 지표는 그대로 잰다 — 빠진 이벤트가 값을 낮추는 쪽으로만 틀린다 */
    expect(tally?.attackSideRounds).toBe(1)
  })

  it('같은 죽음이 두 줄로 와도 판정이 흔들리지 않는다', () => {
    const events = [
      ...fullRoster(),
      ...sideEvidence(100),
      kill(2, 100, A(1), B(1)),
      killed(2, 100, B(1), A(1)),
      kill(2, 140, B(2), A(1)),
      killed(2, 140, A(1), B(2)),
    ]
    expect(tallyOf(events, wonUnknown)?.organizedHeld).toBe(1)
  })
})

/* -------------------------------------------------------------------------- */
/* 4 폭발력                                                                     */
/* -------------------------------------------------------------------------- */

describe('폭발력 — 공격 라운드의 연속 제거', () => {
  it('사양 원문 예시가 한 번으로 잡힌다', () => {
    const events = [
      ...fullRoster(),
      ...sideEvidence(),
      kill(2, 41, A(1), B(1)),
      kill(2, 42, A(2), B(2)),
      kill(2, 44, A(1), B(3)),
    ]
    const tally = tallyOf(events, wonUnknown)
    expect(tally?.bursts).toBe(1)
    expect(tally?.burstRounds).toBe(1)
  })

  it('우리 킬만 센다 — 우리 쪽이 줄줄이 죽은 것은 폭발력이 아니다', () => {
    const events = [
      ...fullRoster(),
      ...sideEvidence(),
      kill(2, 41, B(1), A(1)),
      kill(2, 42, B(2), A(2)),
      kill(2, 44, B(3), A(3)),
    ]
    expect(tallyOf(events, wonUnknown)?.bursts).toBe(0)
  })

  it('수비 라운드의 연속 제거는 세지 않는다 — 사양이 **레드**라고 못 박았다', () => {
    const events = [
      ...fullRoster(),
      ...sideEvidence(),
      kill(1, 11, A(1), B(1)),
      kill(1, 12, A(2), B(2)),
      kill(1, 13, A(1), B(3)),
      kill(2, 100, A(1), B(4)),
    ]
    const tally = tallyOf(events, wonUnknown)
    expect(tally?.bursts).toBe(0)
    expect(tally?.burstRounds).toBe(1)
  })

  it('라운드를 넘어가면 이어지지 않는다 — 시각은 경기 누적이라 붙어 보일 수 있다', () => {
    const events = [
      ...fullRoster(),
      bomb(1, 5, US, 'install'),
      kill(2, 100, A(1), B(1)),
      kill(2, 101, A(2), B(2)),
      kill(3, 102, A(1), B(3)),
    ]
    /* 설치가 1라운드뿐이라 교대를 못 봤고, 아는 것은 1라운드(공격)뿐이다 */
    const tally = tallyOf(events, wonUnknown)
    expect(tally?.bursts).toBe(0)
  })

  it('한 라운드에 두 번 터지면 두 번으로 센다', () => {
    const events = [
      ...fullRoster(),
      ...sideEvidence(),
      kill(2, 100, A(1), B(1)),
      kill(2, 101, A(1), B(2)),
      kill(2, 102, A(1), B(3)),
      kill(2, 150, A(2), B(4)),
      kill(2, 151, A(2), B(5)),
      kill(3, 200, A(2), B(1)),
    ]
    /* 3라운드에서 이어 붙지 않도록 2라운드 안에서만 본다 — 뒤 묶음은 둘뿐이라 안 센다 */
    expect(tallyOf(events, wonUnknown)?.bursts).toBe(1)
  })

  it('같은 죽음이 두 줄로 와도 두 번 세지 않는다', () => {
    const events = [
      ...fullRoster(),
      ...sideEvidence(),
      kill(2, 100, A(1), B(1)),
      killed(2, 100, B(1), A(1)),
      kill(2, 101, A(1), B(2)),
      killed(2, 101, B(2), A(1)),
    ]
    /* 접지 않으면 네 건이 되어 없던 폭발력이 생긴다 */
    expect(tallyOf(events, wonUnknown)?.bursts).toBe(0)
  })
})

/* -------------------------------------------------------------------------- */
/* 5 게임템포                                                                   */
/* -------------------------------------------------------------------------- */

describe('게임템포 — 라운드 길이', () => {
  /** 2·3·4 라운드가 공격. 각 라운드 관측 구간 = 10 · 40 · 20 초 */
  function tempoMatch(): ClanRoundEvent[] {
    return [
      ...fullRoster(),
      ...sideEvidence(),
      kill(2, 90, A(1), B(1)),
      kill(2, 100, B(1), A(1)),
      kill(3, 200, A(1), B(2)),
      kill(3, 240, B(2), A(2)),
      kill(4, 300, A(1), B(3)),
      kill(4, 320, B(3), A(3)),
    ]
  }

  it('공격 라운드의 관측 구간만 담는다', () => {
    expect(tallyOf(tempoMatch(), wonUnknown)?.roundSpans).toEqual([10, 40, 20])
  })

  it('다음 라운드까지의 간격도 함께 준다 — 이벤트가 하나뿐인 라운드를 0 으로 보내지 않으려고', () => {
    /* 2→3 = 200-90 = 110 · 3→4 = 300-200 = 100 · 4는 다음이 없다 */
    expect(tallyOf(tempoMatch(), wonUnknown)?.roundGaps).toEqual([110, 100])
  })

  it('중앙값과 평균을 **둘 다** 돌려준다 — 어느 쪽을 쓸지는 화면이 정한다', () => {
    const summary = tempoOf([10, 40, 20])
    expect(summary).toEqual({ n: 3, median: 20, mean: 70 / 3 })
  })

  it('한 라운드가 늘어져도 중앙값은 끌려가지 않는다 — 평균은 끌려간다', () => {
    const summary = tempoOf([10, 20, 30, 40, 600])
    expect(summary?.median).toBe(30)
    expect(summary?.mean).toBe(140)
  })

  it('짝수 개면 가운데 둘의 평균이다', () => {
    expect(tempoOf([10, 20, 30, 40])?.median).toBe(25)
  })

  it('표본이 없으면 **null 이다. 0 이 아니다**', () => {
    expect(tempoOf([])).toBeNull()
  })

  it('이벤트가 하나뿐인 라운드도 버리지 않는다 — 버리면 빠른 라운드만 빠진다', () => {
    const events = [
      ...fullRoster(),
      ...sideEvidence(),
      kill(2, 90, A(1), B(1)),
      kill(3, 200, A(1), B(2)),
      kill(3, 240, B(2), A(2)),
    ]
    expect(tallyOf(events, wonUnknown)?.roundSpans).toEqual([0, 40])
  })

  it('라운드가 하나뿐이면 간격은 비고 구간만 남는다', () => {
    const events = [...fullRoster(), bomb(2, 90, US, 'install'), kill(2, 100, A(1), B(1))]
    const tally = tallyOf(events, wonUnknown)
    expect(tally?.roundSpans).toEqual([10])
    expect(tally?.roundGaps).toEqual([])
  })
})

/* -------------------------------------------------------------------------- */
/* 6 소수싸움 (클랜 단위)                                                        */
/* -------------------------------------------------------------------------- */

/** 죽음 한 건 — `outnumberedRound` 를 직접 부를 때 쓴다 */
function deathAt(usn: string, team: string, at: number) {
  return { usn, team, at }
}

describe('outnumberedRound — 숫자가 밀린 순간이 있었나', () => {
  const call = (deaths: { usn: string; team: string; at: number }[]) =>
    outnumberedRound({ deaths, ourTeam: '0', foeTeam: '1', teamSize: 5 })

  it('우리가 먼저 죽으면 그 순간 밀린 것이다', () => {
    expect(call([deathAt('A1', '0', 10)])).toBe(true)
  })

  it('한 명씩 주고받으면 밀린 적이 없다 — **false 다. null 이 아니다**', () => {
    expect(call([deathAt('B1', '1', 10), deathAt('A1', '0', 20)])).toBe(false)
  })

  it('죽음이 하나도 없으면 안 밀린 것이다', () => {
    expect(call([])).toBe(false)
  })

  it('회복해도 **밀린 순간이 있었으면** 센다', () => {
    /* 10초에 4:5 로 밀렸다가 20초에 4:3 이 된다 */
    expect(
      call([deathAt('A1', '0', 10), deathAt('B1', '1', 20), deathAt('B2', '1', 20)]),
    ).toBe(true)
  })

  it('같은 초에 한 명씩 죽으면 순서를 몰라 **라운드를 버린다** — null 이다', () => {
    expect(call([deathAt('A1', '0', 10), deathAt('B1', '1', 10)])).toBeNull()
  })

  it('같은 초 묶음 **끝에서** 이미 밀렸으면 순서와 무관하다 — true 다', () => {
    expect(
      call([deathAt('A1', '0', 10), deathAt('A2', '0', 10), deathAt('B1', '1', 10)]),
    ).toBe(true)
  })

  it('제3의 팀 번호가 섞이면 **null 이다** — 어느 쪽으로도 밀지 않는다', () => {
    expect(call([deathAt('C1', '2', 10)])).toBeNull()
  })

  it('인원보다 많이 죽으면 null 이다 — 응답이 어긋난 것이다', () => {
    /* 상대가 여섯 번 죽었다. 우리 쪽이 넘치는 경우는 그 전에 이미 밀려 `true` 로 끝난다 */
    const six = [1, 2, 3, 4, 5, 6].map((n) => deathAt('B' + n, '1', n * 10))
    expect(call(six)).toBeNull()
  })
})

describe('클랜 소수싸움 — 진영을 보지 않는다', () => {
  /** 3라운드에서 우리 A1 이 먼저 죽어 4:5 가 된다. **폭탄 근거가 없다** */
  function pushedMatch(): ClanRoundEvent[] {
    return [...fullRoster(), kill(3, 100, B(1), A(1))]
  }

  it('폭탄이 한 번도 안 터져 **진영을 하나도 몰라도** 센다 — 다른 다섯 축과 다른 점이다', () => {
    const tally = tallyOf(pushedMatch(), wonOnly(3))
    /* 진영을 아는 라운드가 하나도 없다 */
    expect(tally?.sidedRounds).toBe(0)
    expect(tally?.defenseRounds).toBe(0)
    expect(tally?.attackSideRounds).toBe(0)
    /* 그런데 소수싸움은 세어진다 */
    expect(tally?.outnumberedRounds).toBe(1)
    expect(tally?.outnumberedWon).toBe(1)
  })

  it('밀렸는데 졌으면 분모에만 남는다', () => {
    const tally = tallyOf(pushedMatch(), wonOnly(9))
    expect(tally?.outnumberedRounds).toBe(1)
    expect(tally?.outnumberedWon).toBe(0)
  })

  it('승패를 모르면 **분모에도 안 들어간다** (D-106)', () => {
    const tally = tallyOf(pushedMatch(), wonUnknown)
    expect(tally?.outnumberedRounds).toBe(0)
    expect(tally?.outnumberedWon).toBe(0)
  })

  it('안 밀린 라운드는 분모에 들어가지 않는다 — 분모는 "밀린 적이 있는 라운드" 다', () => {
    const events = [...fullRoster(), kill(3, 100, A(1), B(1))]
    expect(tallyOf(events, wonOnly(3))?.outnumberedRounds).toBe(0)
  })

  it('수비 라운드도 센다 — 소수싸움은 공격/수비를 가리지 않는다', () => {
    /* `sideEvidence` 로 1라운드는 수비다 */
    const events = [...fullRoster(), ...sideEvidence(), kill(1, 40, B(1), A(1))]
    const tally = tallyOf(events, wonOnly(1))
    expect(tally?.defenseRounds).toBe(1)
    expect(tally?.outnumberedRounds).toBe(1)
    expect(tally?.outnumberedWon).toBe(1)
  })

  it('5대5가 확인 안 되면 **분모를 0 으로 둔다** — 빠진 죽음이 밀린 라운드를 감춘다', () => {
    const events = [kill(3, 100, B(1), A(1))]
    expect(tallyOf(events, wonOnly(3))?.outnumberedRounds).toBe(0)
  })

  it('여러 라운드가 쌓인다 — 진영을 아는 축보다 표본이 두껍다', () => {
    const events = [
      ...fullRoster(),
      ...sideEvidence(),
      kill(3, 100, B(1), A(1)),
      kill(4, 200, B(2), A(2)),
      kill(5, 300, A(3), B(3)),
    ]
    const tally = tallyOf(events, wonOnly(3, 5))
    expect(tally?.outnumberedRounds).toBe(2)
    expect(tally?.outnumberedWon).toBe(1)
  })

  it('같은 초에 양쪽이 죽은 라운드는 통째로 빠진다', () => {
    const events = [
      ...fullRoster(),
      kill(3, 100, B(1), A(1)),
      kill(3, 100, A(2), B(1)),
    ]
    expect(tallyOf(events, wonOnly(3))?.outnumberedRounds).toBe(0)
  })
})

/* -------------------------------------------------------------------------- */
/* 비율 만들기                                                                  */
/* -------------------------------------------------------------------------- */

describe('per5 · rateOf — 분모가 0 이면 null', () => {
  it('사양 표기 "5라운드중 n라운드" 로 환산한다', () => {
    expect(per5(17, 50)).toBeCloseTo(1.7, 6)
    expect(per5(26, 50)).toBeCloseTo(2.6, 6)
  })

  it('분모가 0 이면 **null 이다. 0 이 아니다** — 못 잰 클랜이 최고 성적으로 보이면 안 된다', () => {
    expect(per5(0, 0)).toBeNull()
    expect(rateOf(0, 0)).toBeNull()
  })

  it('rateOf 는 그냥 비율이다', () => {
    expect(rateOf(1, 4)).toBe(0.25)
  })
})
