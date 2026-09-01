/**
 * 클랜 육각형 **V2** — 여섯 축의 분자/분모 (`docs/CLAN_HEXAGON_V2_SPEC.md` · D-217).
 *
 * 고정하려는 것
 *   1. **한 응답으로 양쪽 클랜이 다 나온다.** 뒤집어 계산해도 같은 값이다
 *   2. 진영을 모르는 라운드는 **분모에서도 빠진다** (D-106) — 지어내지 않는다
 *   3. 분모가 0 이면 비율은 **`null` 이다. 0% 가 아니다** (D-106)
 *   4. ④ 는 상대 3명 제거에 **도달하지 못한 라운드를 분모에서 뺀다** (④-2)
 *      그리고 재는 값은 **하한**이다 — 라운드 시작 시각이 관측되지 않는다
 *   5. 상대 무기를 모르는 경기는 **①⑤⑥ 을 아예 세지 않는다** — 0 이 아니라 `null`
 *   6. ⑥ 은 좌표가 있는 **두 구역**만으로 세고, 이름 없는 자리의 킬 수를 함께 낸다 (⑥-1)
 *   7. ① 은 `비교` 해석을 고르지 않는다 — `aSide` · `bLong` · `redRounds` 를 따로 낸다 (①-1)
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  A_ATTACK_ZONE_LABELS,
  B_LONG_ZONE_LABEL,
  clanHexV2Of,
  lastFoeDeathVerdict,
  zoneCellsOfLabels,
  type ClanHexEvent,
  type ClanHexZones,
  type LabeledZoneFile,
} from '../clanHexV2'
import { clanRoundTallyOf, rateOf } from '../clanRound'
import type { RoundDeath } from '../roundState'
import type { ZoneCells } from '../duel'

/* -------------------------------------------------------------------------- */
/* 픽스처 — clanRound.test.ts 의 관례를 그대로 쓴다                               */
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

const US = '0'
const THEM = '1'

/** 킬로그의 무기 키 (D-114 · `duel.ts`) */
type Gun = 'riple' | 'sniper'

interface Spot {
  x: number
  y: number
}

/** 초 → `"MM:SS"` (경기 시작부터의 누적 시간) */
function clock(seconds: number): string {
  const mm = Math.floor(seconds / 60)
  const ss = seconds % 60
  return String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0')
}

/**
 * 킬 줄 — 주체가 죽였고 상대가 죽었다.
 *
 * 좌표는 **행위 기준**이다. `kill_*` 은 언제나 죽인 사람의 자리다 (`playstyle.ts`).
 */
function kill(
  round: number,
  at: number,
  killer: Actor,
  dead: Actor,
  gun: Gun = 'riple',
  spot?: Spot,
  deathSpot?: Spot,
): ClanHexEvent {
  return {
    round: String(round),
    event_time: clock(at),
    event_type: 'kill',
    target_event_type: 'death',
    str_usn: killer.usn,
    team_no: killer.team,
    weapon: gun,
    target_str_usn: dead.usn,
    target_team_no: dead.team,
    kill_x: spot?.x ?? null,
    kill_y: spot?.y ?? null,
    death_x: deathSpot?.x ?? null,
    death_y: deathSpot?.y ?? null,
  }
}

/**
 * 같은 킬을 **죽은 쪽에서** 적은 줄 — 상대 무기가 `target_weapon` 에 실린다.
 *
 * 우리 선수가 죽은 줄이 곧 **상대 무기의 출처**다. 클랜 응답에는 이 줄이 함께 온다.
 */
function killed(
  round: number,
  at: number,
  dead: Actor,
  killer: Actor,
  gun: Gun = 'riple',
  spot?: Spot,
): ClanHexEvent {
  return {
    round: String(round),
    event_time: clock(at),
    event_type: 'death',
    target_event_type: 'kill',
    str_usn: dead.usn,
    team_no: dead.team,
    target_str_usn: killer.usn,
    target_team_no: killer.team,
    target_weapon: gun,
    kill_x: spot?.x ?? null,
    kill_y: spot?.y ?? null,
  }
}

/** 폭탄 줄 — 실측 응답처럼 행위자가 `target_*` 에 실린다 */
function bomb(
  round: number,
  at: number,
  team: string,
  action: 'install' | 'dismantle',
): ClanHexEvent {
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

/* -------------------------------------------------------------------------- */
/* 구역 — 로직 시험용 가짜다. 실제 파일은 맨 아래에서 따로 본다                     */
/* -------------------------------------------------------------------------- */

const zone = (cells: string[]): ZoneCells => ({ cell: 10, cells })

/** `A쪽` 이라고 **가정한** 칸. 실제 범위는 미확인이다 (①-2) */
const A_SIDE = zone(['40,30'])
/** `B롱`(비롱) 이라고 가정한 칸 */
const B_LONG = zone(['15,20'])
/** ⑥ 이 인정하는 구역 — `A쪽` 과 같은 칸으로 둔다 (`컨뒤`·`A설대` 자리) */
const ATTACK = zone(['40,30'])

const ZONES: ClanHexZones = {
  aSide: A_SIDE,
  bLong: B_LONG,
  attack: ATTACK,
  attackLabels: A_ATTACK_ZONE_LABELS,
}

/** `A쪽`/`컨뒤` 안 (셀 `40,30`) */
const IN_A: Spot = { x: 405, y: 300 }
/** `B롱` 안 (셀 `15,20`) */
const IN_B: Spot = { x: 155, y: 205 }

/* -------------------------------------------------------------------------- */
/* 기본 경기 — 4라운드 · 우리(0) 1라운드 수비, 2~4라운드 공격                       */
/* -------------------------------------------------------------------------- */

/**
 * ```
 * R1 수비  10 A1 죽음(B1 스나)      12 A2 죽음(B2 라플)     30 우리가 해체
 * R2 공격  90 우리가 설치  100 B1(스나) 죽음  102 B2 죽음  104 B3 죽음   → 승
 * R3 공격  200 B4 죽음  202 B5 죽음  205 A5 죽음(B3 라플)                 → 패
 * R4 공격  300 B2 죽음  305 B3 죽음  310 B1(스나) 죽음 — **A4 가 컨뒤에 서서**   → 승
 * ```
 *
 * · B1 은 자기 킬이 스나뿐이라 **상대 스나로 확정**된다
 * · A2 · A5 는 킬이 하나도 없어 **무기를 모른다** — ⑤ 가 그 라운드를 버리는 근거다
 * · 자리는 **잡은 쪽과 죽은 쪽을 따로** 넣었다 (①-3 · ⑥-2)
 *     R2 A1 이 B롱에서 잡고, B1 도 B롱에서 죽었다
 *     R4 A4 는 컨뒤에서 잡았는데, B1 은 B롱에서 죽었다
 */
function baseMatch(): ClanHexEvent[] {
  return [
    /* R1 — 우리 수비 */
    killed(1, 10, A(1), B(1), 'sniper'),
    killed(1, 12, A(2), B(2), 'riple'),
    bomb(1, 30, US, 'dismantle'),
    /* R2 — 우리 공격 */
    bomb(2, 90, US, 'install'),
    kill(2, 100, A(1), B(1), 'riple', IN_B, IN_B),
    kill(2, 102, A(1), B(2), 'riple'),
    kill(2, 104, A(3), B(3), 'sniper'),
    /* R3 — 우리 공격 */
    kill(3, 200, A(1), B(4), 'riple'),
    kill(3, 202, A(1), B(5), 'riple'),
    killed(3, 205, A(5), B(3), 'riple'),
    /* R4 — 우리 공격 */
    kill(4, 300, A(1), B(2), 'riple'),
    kill(4, 305, A(1), B(3), 'riple'),
    kill(4, 310, A(4), B(1), 'riple', IN_A, IN_B),
  ]
}

/** 우리(0) 가 2·4라운드를 땄다 */
const ourWins = (round: number): boolean | null => round === 2 || round === 4
/** 상대(1) 기준 — 뒤집은 것이다 */
const theirWins = (round: number): boolean | null => !ourWins(round)

function run(
  events: ClanHexEvent[],
  teamNo = US,
  wonRound: (round: number) => boolean | null = ourWins,
  zones: ClanHexZones = ZONES,
) {
  const match = clanHexV2Of({ events, teamNo, wonRound, zones })
  if (match === null) throw new Error('경기를 못 읽었다')
  return match
}

/* -------------------------------------------------------------------------- */
/* 1. 한 응답으로 양쪽이 나온다                                                   */
/* -------------------------------------------------------------------------- */

describe('한 응답 → 양쪽 클랜', () => {
  const match = run(baseMatch())

  it('`byTeam` 에 두 팀이 다 담긴다', () => {
    expect([...match.byTeam.keys()].sort()).toEqual([US, THEM])
    expect(match.foeTeamNo).toBe(THEM)
  })

  it('진영이 서로 반대다 — 폭파미션은 한 라운드에 공격이 한 팀뿐이다 (D-208)', () => {
    /* 우리는 2·3·4 라운드가 레드, 상대는 1라운드만 레드다 */
    expect(match.byTeam.get(US)?.redRounds).toBe(3)
    expect(match.byTeam.get(THEM)?.redRounds).toBe(1)
    expect(match.byTeam.get(US)?.sidedRounds).toBe(4)
    expect(match.byTeam.get(THEM)?.sidedRounds).toBe(4)
  })

  it('**뒤집어 계산해도 같다** — 상대 응답으로 잰 것과 값이 어긋나지 않는다', () => {
    const flipped = run(baseMatch(), THEM, theirWins)
    expect(flipped.byTeam.get(THEM)).toEqual(match.byTeam.get(THEM))
    expect(flipped.byTeam.get(US)).toEqual(match.byTeam.get(US))
  })

  it('`wonRound` 를 안 주면 `win_flag` 로 읽는다', () => {
    const events = baseMatch().map((event) => ({
      ...event,
      win_flag: ourWins(Number(event.round)) ? 'win' : 'lose',
    }))
    const auto = clanHexV2Of({ events, teamNo: US, zones: ZONES })
    expect(auto?.byTeam.get(US)).toEqual(match.byTeam.get(US))
  })
})

/* -------------------------------------------------------------------------- */
/* 2. ① 스나싸움 — 해석을 고르지 않는다                                           */
/* -------------------------------------------------------------------------- */

describe('① 스나싸움 — 재료만 낸다 (①-1)', () => {
  const tally = run(baseMatch()).byTeam.get(US)?.sniperFight

  it('레드 라운드에서 잡은 상대 스나를 센다 — R2 의 B1, R4 의 B1', () => {
    expect(tally?.redRounds).toBe(3)
    expect(tally?.foeSniperKills).toBe(2)
    expect(tally?.killsWithPosition).toEqual({ byKiller: 2, byVictim: 2 })
  })

  it('자리를 `A쪽` · `B롱` 으로 나눠 담는다. **합치거나 비율을 내지 않는다**', () => {
    /* 잡은 쪽 자리: R2 B롱 · R4 컨뒤 | 죽은 쪽 자리: 둘 다 B롱 */
    expect(tally?.aSideKills).toEqual({ byKiller: 1, byVictim: 0 })
    expect(tally?.bLongKills).toEqual({ byKiller: 1, byVictim: 2 })
    expect(tally?.unzonedKills).toEqual({ byKiller: 0, byVictim: 0 })
  })

  it('**자리를 죽인 쪽·죽은 쪽 둘 다로 판정한다** — 원문이 어느 쪽인지 안 말했다 (①-3)', () => {
    /* 같은 두 킬인데 기준을 바꾸면 값이 달라진다. 한쪽만 내면 다른 해석을 못 만든다 */
    expect(tally?.aSideKills?.byKiller).not.toBe(tally?.aSideKills?.byVictim)
  })

  it('레드가 아닌 라운드의 킬은 세지 않는다', () => {
    /* R1(수비)에 우리가 B1 을 잡아도 ① 에는 안 들어간다 */
    const events = [...baseMatch(), kill(1, 20, A(1), B(1), 'riple', IN_A)]
    expect(run(events).byTeam.get(US)?.sniperFight?.foeSniperKills).toBe(2)
  })

  it('구역을 안 주면 자리 칸이 **`null` 이다. 0 이 아니다**', () => {
    const bare = run(baseMatch(), US, ourWins, {}).byTeam.get(US)?.sniperFight
    expect(bare?.foeSniperKills).toBe(2)
    expect(bare?.aSideKills).toBeNull()
    expect(bare?.bLongKills).toBeNull()
    expect(bare?.unzonedKills).toBeNull()
    /* 자리를 안 나눴을 뿐, 좌표가 있었다는 사실은 남는다 */
    expect(bare?.killsWithPosition).toEqual({ byKiller: 2, byVictim: 2 })
  })

  it('한쪽 구역만 주면 `unzonedKills` 는 `null` 이다 — 나머지를 모르기 때문이다', () => {
    const half = run(baseMatch(), US, ourWins, { bLong: B_LONG }).byTeam.get(US)?.sniperFight
    expect(half?.bLongKills).toEqual({ byKiller: 1, byVictim: 2 })
    expect(half?.aSideKills).toBeNull()
    expect(half?.unzonedKills).toBeNull()
  })
})

/* -------------------------------------------------------------------------- */
/* 3. ② 소수싸움 · ③ 세이브                                                      */
/* -------------------------------------------------------------------------- */

describe('② 소수싸움 — 기존 클랜 정의 그대로 (D-202)', () => {
  it('숫자가 밀린 라운드만 분모다. **진영을 보지 않는다**', () => {
    const us = run(baseMatch()).byTeam.get(US)?.outnumbered
    /* R1 에서 우리가 4 대 5 로 밀렸고 그 라운드를 졌다 */
    expect(us).toEqual({ rounds: 1, won: 0 })
  })

  it('상대도 같은 자로 잰다 — R2·R3·R4 에서 밀렸고 R3 만 이겼다', () => {
    expect(run(baseMatch()).byTeam.get(THEM)?.outnumbered).toEqual({ rounds: 3, won: 1 })
  })

  it('**기존 구현(D-202)과 값이 같다** — 정의를 몰래 바꾸지 않았다', () => {
    const old = clanRoundTallyOf({
      events: baseMatch(),
      teamNo: US,
      teamSize: 5,
      wonRound: ourWins,
    })
    const mine = run(baseMatch()).byTeam.get(US)?.outnumbered
    expect(mine).toEqual({ rounds: old?.outnumberedRounds, won: old?.outnumberedWon })
  })
})

describe('③ 세이브 — 1대1 도 세이브다 (사용자 원문)', () => {
  /** 우리 넷이 죽고 하나 남은 라운드. 상대는 넷이 죽어 **1대1** 이 된다 */
  function saveMatch(won: boolean): ClanHexEvent[] {
    return [
      killed(1, 10, A(1), B(1), 'sniper'),
      killed(1, 12, A(2), B(1), 'sniper'),
      killed(1, 14, A(3), B(2), 'riple'),
      killed(1, 16, A(4), B(2), 'riple'),
      kill(1, 20, A(5), B(3), 'riple'),
      kill(1, 22, A(5), B(4), 'riple'),
      kill(1, 24, A(5), B(5), 'riple'),
      kill(1, 26, A(5), B(2), 'riple'),
      /* 두 번째 라운드는 명단을 채우지 않는다 — 위에서 이미 10명이 다 나왔다 */
      { ...kill(2, 60, A(5), B(1), 'riple'), win_flag: won ? 'win' : 'lose' },
    ]
  }

  it('우리가 1명까지 몰렸으면 **1대1이든 1대2든** 분모에 넣는다', () => {
    const tally = run(saveMatch(true), US, (round) => round === 1).byTeam.get(US)?.save
    expect(tally).toEqual({ rounds: 1, won: 1 })
  })

  it('그 라운드를 졌으면 분자에 안 넣는다 — 분모에는 남는다', () => {
    const tally = run(saveMatch(false), US, () => false).byTeam.get(US)?.save
    expect(tally).toEqual({ rounds: 1, won: 0 })
  })

  it('승패를 모르는 라운드는 **분모에도 안 넣는다** (D-106)', () => {
    const tally = run(saveMatch(true), US, () => null).byTeam.get(US)?.save
    expect(tally).toEqual({ rounds: 0, won: 0 })
  })

  it('1명까지 안 몰린 라운드는 세지 않는다', () => {
    expect(run(baseMatch()).byTeam.get(US)?.save).toEqual({ rounds: 0, won: 0 })
  })
})

/* -------------------------------------------------------------------------- */
/* 4. ④ 게임템포 — 하한값이다                                                    */
/* -------------------------------------------------------------------------- */

describe('④ 게임템포 — 상대 3명 제거까지 (하한값)', () => {
  const tally = run(baseMatch()).byTeam.get(US)?.tempo

  it('`라운드 첫 이벤트 → 상대 3번째 사망` 이다. 라운드 시작은 관측되지 않는다', () => {
    /* R2: 첫 이벤트 90(설치) → 3번째 사망 104 = 14초
       R4: 첫 이벤트 300 → 3번째 사망 310 = 10초 */
    expect(tally?.redClearThreeSecondsLowerBound).toEqual([14, 10])
    expect(tally?.redClearThreeSecondsLowerBoundSum).toBe(24)
  })

  it('**3명을 못 지운 라운드는 분모에서 뺀다** (④-2 미확인)', () => {
    /* R3 는 상대가 둘만 죽었다 */
    expect(tally?.redRounds).toBe(3)
    expect(tally?.redClearThreeRounds).toBe(2)
    expect(tally?.redRoundsWithoutThreeClears).toBe(1)
  })

  it('분모가 0 이면 비율은 **`null` 이다. 0 이 아니다** (D-106)', () => {
    const them = run(baseMatch()).byTeam.get(THEM)?.tempo
    expect(them?.redClearThreeRounds).toBe(0)
    expect(rateOf(them?.redClearThreeSecondsLowerBoundSum ?? 0, them?.redClearThreeRounds ?? 0))
      .toBeNull()
  })
})

/* -------------------------------------------------------------------------- */
/* 5. ⑤ B어택성공                                                               */
/* -------------------------------------------------------------------------- */

describe('⑤ B어택성공 — 상대 스나가 마지막에 죽었나', () => {
  const tally = run(baseMatch()).byTeam.get(US)?.lastSniper

  it('이긴 레드 라운드 중 상대 스나가 마지막인 라운드를 센다 — R4 만 해당', () => {
    expect(tally?.redWonRounds).toBe(2)
    expect(tally?.redWonSniperLast).toBe(1)
  })

  it('진영을 안 본 판도 함께 낸다 — 이름의 `B` 가 B사이트인지 모른다 (⑤-1)', () => {
    expect(tally?.wonRounds).toBe(2)
    expect(tally?.wonSniperLast).toBe(1)
  })

  it('마지막에 죽은 상대의 무기를 모르면 **분모에서 뺀다**', () => {
    /* 상대(1) 쪽에서 보면 마지막에 죽은 A2 · A5 의 무기를 모른다 */
    const them = run(baseMatch()).byTeam.get(THEM)?.lastSniper
    expect(them?.unknownLastWeaponRounds).toBe(2)
    expect(them?.redWonRounds).toBe(0)
    expect(them?.wonRounds).toBe(0)
  })

  it('같은 초에 둘이 죽고 하나만 스나면 **순서를 못 가린다** — 버린다', () => {
    const deaths: RoundDeath[] = [
      { usn: 'B2', team: '1', at: 50 },
      { usn: 'B1', team: '1', at: 50 },
    ]
    const weapons = new Map<string, 0 | 1>([
      ['B1', 1],
      ['B2', 0],
    ])
    expect(lastFoeDeathVerdict(deaths, weapons)).toBe('ambiguous')
  })

  it('같은 초라도 **둘 다 스나면** 순서와 무관하다 — 판정한다', () => {
    const deaths: RoundDeath[] = [
      { usn: 'B2', team: '1', at: 50 },
      { usn: 'B1', team: '1', at: 50 },
    ]
    const weapons = new Map<string, 0 | 1>([
      ['B1', 1],
      ['B2', 1],
    ])
    expect(lastFoeDeathVerdict(deaths, weapons)).toBe('sniper')
  })

  it('상대가 아무도 안 죽은 이긴 라운드는 따로 센다 (⑤-2 미확인)', () => {
    expect(lastFoeDeathVerdict([], new Map())).toBe('noDeath')
  })
})

/* -------------------------------------------------------------------------- */
/* 6. ⑥ A어택성공                                                               */
/* -------------------------------------------------------------------------- */

describe('⑥ A어택성공 — 구역에서 잡고 라운드를 따야 성공이다', () => {
  const tally = run(baseMatch()).byTeam.get(US)?.attackZone

  it('구역에서 잡고 **이긴** 라운드만 분자다', () => {
    /* R4 에서 A4 가 컨뒤에 서서 잡았고 그 라운드를 땄다.
       죽은 쪽 자리로 보면 B1 은 두 번 다 B롱에서 죽었으므로 성공이 0 이다 */
    expect(tally?.redWonZoneSniperRounds).toEqual({ byKiller: 1, byVictim: 0 })
    expect(tally?.redRounds).toBe(3)
    expect(tally?.redWonRounds).toBe(2)
  })

  it('잡았는데 라운드를 못 따면 성공이 아니다 — 사용자가 직접 못 박았다', () => {
    /* R3(패)에서 구역 안 스나 킬을 하나 더 넣는다 */
    const events = [...baseMatch(), kill(3, 210, A(4), B(1), 'riple', IN_A, IN_A)]
    const lost = run(events).byTeam.get(US)?.attackZone
    expect(lost?.redWonZoneSniperRounds).toEqual({ byKiller: 1, byVictim: 0 })
    expect(lost?.redLostZoneSniperRounds).toEqual({ byKiller: 1, byVictim: 1 })
  })

  /* ⚠ 제목을 고쳤다 (2026-09-01) — `녹뒤`·`머리` 는 이제 **이름 있는 구역**이다.
     검사 자체는 그대로 유효하다: 이름 없는 자리에서 난 킬을 따로 세는지 본다 */
  it('**이름 없는 자리에서 난 킬을 함께 센다** (⑥-1)', () => {
    expect(tally?.sniperKillsWithPosition).toEqual({ byKiller: 2, byVictim: 2 })
    expect(tally?.sniperKillsInNamedZone).toEqual({ byKiller: 1, byVictim: 0 })
    expect(tally?.sniperKillsOutsideNamedZone).toEqual({ byKiller: 1, byVictim: 2 })
  })

  it('판정에 쓴 구역 이름을 값과 함께 남긴다 — **넷이 다 있다** (2026-09-01)', () => {
    expect(tally?.zoneLabels).toEqual(A_ATTACK_ZONE_LABELS)
  })

  it('구역을 안 주면 축이 통째로 `null` 이다', () => {
    expect(run(baseMatch(), US, ourWins, {}).byTeam.get(US)?.attackZone).toBeNull()
  })
})

/* -------------------------------------------------------------------------- */
/* 7. 모르면 비운다 (D-106)                                                      */
/* -------------------------------------------------------------------------- */

describe('진영을 모르는 라운드는 **분모에서 빠진다**', () => {
  /** 폭탄이 한 줄도 없다 — 진영을 알 길이 없다 (D-208: `team_no` 를 후퇴값으로 쓰지 않는다) */
  const noBomb = baseMatch().filter((event) => event.target_weapon?.startsWith('c4-') !== true)
  const match = run(noBomb)

  it('레드 라운드가 0 이 되고, 진영 기반 축의 분모가 비어 있다', () => {
    const us = match.byTeam.get(US)
    expect(us?.sidedRounds).toBe(0)
    expect(us?.redRounds).toBe(0)
    expect(us?.sniperFight?.redRounds).toBe(0)
    expect(us?.sniperFight?.foeSniperKills).toBe(0)
    expect(us?.tempo?.redClearThreeRounds).toBe(0)
    expect(us?.lastSniper?.redWonRounds).toBe(0)
    expect(us?.attackZone?.redRounds).toBe(0)
  })

  it('분모가 0 이면 비율은 `null` 이다 — **0% 로 찍지 않는다**', () => {
    const us = match.byTeam.get(US)
    expect(
      rateOf(us?.attackZone?.redWonZoneSniperRounds.byKiller ?? 0, us?.attackZone?.redWonRounds ?? 0),
    ).toBeNull()
    expect(rateOf(us?.lastSniper?.redWonSniperLast ?? 0, us?.lastSniper?.redWonRounds ?? 0))
      .toBeNull()
  })

  it('② ③ 은 **진영을 보지 않으므로** 그대로 세어진다', () => {
    expect(match.byTeam.get(US)?.outnumbered).toEqual({ rounds: 1, won: 0 })
    expect(match.byTeam.get(US)?.save).toEqual({ rounds: 0, won: 0 })
  })

  it('진영을 못 봤다는 사실이 값과 함께 나온다', () => {
    expect(match.switchRound).toBeNull()
  })
})

describe('상대 무기를 모르는 경기는 ①⑤⑥ 을 **세지 않는다**', () => {
  /**
   * 우리가 죽은 줄에서 **무기 칸만** 비운다.
   *
   * 상대 무기는 `death` 행의 `target_weapon` 에서 온다. 그 칸이 비면 상대 선수의
   * 무기를 되짚을 길이 없다 — 줄 자체는 그대로라 명단(5대5)과 라운드 복원은 살아 있다.
   */
  const events = baseMatch().map((event) =>
    event.event_type === 'death' ? { ...event, target_weapon: '' } : event,
  )
  const match = run(events)

  it('상대 스나를 한 명도 못 짚으면 ①⑤⑥ 이 `null` 이다. **0 이 아니다**', () => {
    const us = match.byTeam.get(US)
    expect(us?.foeSnipers).toBe(0)
    expect(us?.sniperFight).toBeNull()
    expect(us?.lastSniper).toBeNull()
    expect(us?.attackZone).toBeNull()
  })

  it('② ③ ④ 는 무기를 안 보므로 그대로 나온다', () => {
    const us = match.byTeam.get(US)
    expect(us?.outnumbered).not.toBeNull()
    expect(us?.save).not.toBeNull()
    expect(us?.tempo?.redClearThreeRounds).toBe(2)
  })
})

describe('5대5가 확인되지 않은 경기는 사람 수를 보는 축을 세지 않는다', () => {
  /** A5 가 한 번도 안 나온다 — 우리 팀이 4명으로 보인다 */
  const events = baseMatch().filter((event) => event.str_usn !== 'A5')
  const match = run(events)

  it('②③④⑤ 가 `null` 이다 — 빠진 이벤트는 "안 죽었다" 로 보인다', () => {
    const us = match.byTeam.get(US)
    expect(match.restorable).toBe(false)
    expect(us?.outnumbered).toBeNull()
    expect(us?.save).toBeNull()
    expect(us?.tempo).toBeNull()
    expect(us?.lastSniper).toBeNull()
  })

  it('①⑥ 은 킬을 세는 축이라 남는다 — 빠진 이벤트는 값을 **낮추는** 쪽으로만 틀린다', () => {
    expect(match.byTeam.get(US)?.sniperFight?.foeSniperKills).toBe(2)
    expect(match.byTeam.get(US)?.attackZone?.redWonZoneSniperRounds).toEqual({
      byKiller: 1,
      byVictim: 0,
    })
  })
})

describe('읽을 라운드가 없으면 `null` 이다 — 0 을 돌려주지 않는다', () => {
  it('빈 입력', () => {
    expect(clanHexV2Of({ events: [], teamNo: US })).toBeNull()
  })

  it('라운드를 못 읽는 줄만 있는 입력', () => {
    const events = [{ ...kill(1, 10, A(1), B(1)), round: null }]
    expect(clanHexV2Of({ events, teamNo: US })).toBeNull()
  })
})

/* -------------------------------------------------------------------------- */
/* 8. 구역 파일 — **넷 중 둘만 있다**                                             */
/* -------------------------------------------------------------------------- */

describe('구역 파일 (`data/barracks/style-zones.json`)', () => {
  const file = JSON.parse(
    readFileSync(new URL('../../../../data/barracks/style-zones.json', import.meta.url), 'utf8'),
  ) as LabeledZoneFile & { labels: Record<string, string> }

  it('⑥ 이 쓰는 `컨뒤` · `A설대` 는 좌표가 있다', () => {
    const cells = zoneCellsOfLabels(file, A_ATTACK_ZONE_LABELS)
    expect(cells.cell).toBe(file.cell)
    expect(cells.cells.length).toBeGreaterThan(0)
    expect(file.labels['CONDWI']).toBe('컨뒤')
    expect(file.labels['SEOLDAE']).toBe('A설대')
  })

  it('`B롱` 은 파일의 `비롱` 이다', () => {
    expect(file.labels[B_LONG_ZONE_LABEL]).toBe('비롱')
    expect(zoneCellsOfLabels(file, [B_LONG_ZONE_LABEL]).cells.length).toBeGreaterThan(0)
  })

  /*
   * ⚠ **뒤집힌 시험 (2026-09-01)** — 원래는 «`녹뒤`·`머리` 는 어느 라벨에도 없다» 였다.
   *
   * 그때는 맞았다. 사용자가 넷 중 둘만 칠해 뒀었다 (⑥-1). 그런데 그날 사용자가
   * **실제 킬 좌표 568,138건 위에 직접 칠했고**(`design/zone-paint.html`) 넷이 다 찼다.
   *
   *   머리  x 33~35 · y 26~27   6칸
   *   녹뒤  x 36~38 · y 26~27   6칸
   *
   * 옛 시험을 지우지 않고 뒤집어 둔다 (`CLAUDE.md` 10-4). 이 시험이 빨개지면
   * **좌표가 사라진 것**이므로 `data/barracks/style-zones.json` 부터 봐라.
   */
  it('**`녹뒤` · `머리` 도 이제 라벨에 있다** — 사용자가 직접 칠했다 (⑥-1 해소)', () => {
    const names = Object.values(file.labels)
    expect(names).toContain('녹뒤')
    expect(names).toContain('머리')
    expect(zoneCellsOfLabels(file, ['NOKDWI']).cells.length).toBeGreaterThan(0)
    expect(zoneCellsOfLabels(file, ['MERI']).cells.length).toBeGreaterThan(0)
  })

  it('**정말 없는** 라벨을 주면 0칸이다 — 조용히 다른 구역을 집지 않는다', () => {
    expect(zoneCellsOfLabels(file, ['NO_SUCH_ZONE_XYZ']).cells).toEqual([])
  })

  it('네 구역이 서로 겹치지 않는다 — 한 칸이 두 이름을 갖지 않는다', () => {
    const four = ['CONDWI', 'SEOLDAE', 'NOKDWI', 'MERI']
    const seen = new Set<string>()
    for (const label of four) {
      /* `cells` 는 `"x,y"` 문자열 배열이다. 객체가 아니다 — 처음에 `cell.x` 로 읽어
         전부 `undefined,undefined` 가 되는 바람에 이 시험이 거짓으로 빨개졌었다 */
      for (const key of zoneCellsOfLabels(file, [label]).cells) {
        expect(seen.has(key)).toBe(false)
        seen.add(key)
      }
    }
  })
})
