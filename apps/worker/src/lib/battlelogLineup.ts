/**
 * 배틀로그 원문 → **경기 라인업 판정** (순수 함수).
 *
 * ── 왜 이 파일이 생겼나
 *   IPL 경기 24,662건이 화면에 있는데 **누가 뛰었는지가 하나도 없었다**
 *   (`MatchPlayerStat` 0건 · `LeaguePlayer` 0명). 매치목록 원문(`GetClanMatchList`)의
 *   칸 44개에 **선수 칸이 0개**라서 만들 재료가 없었기 때문이다 (D-219 · `lib/iplProject.ts`).
 *
 *   라인업의 유일한 출처는 **클랜 단위 배틀로그**(`GetBattleLogClan`)다.
 *   그런데 저장소에는 배틀로그를 `MatchPlayerStat` 으로 바꾸는 코드가 **없었다** —
 *   `roundBuild`(라운드) · `playstyleBuild`(플레이스타일) · `battlelog`(포지션)는
 *   각자 프로필만 만들고 참가 기록은 만들지 않는다. 이 파일이 그 빈칸이다.
 *
 * ── 한 번 호출로 양 팀 10명이 다 온다 (D-218 실측)
 *   `event_type='kill'` 행이 **상대 팀**의 사망을, `event_type='death'` 행이 **우리 팀**의
 *   사망을 담는다. 그래서 클랜 하나만 조회해도 10명의 킬·데스·무기가 전부 실려 온다.
 *
 * ── 데스는 **죽음 줄에서** 센다 (2026-09-01)
 *   킬에서 역산하면 죽인 사람이 없는 죽음을 놓친다. 3rd.supply 대조로 확정했다 —
 *   **킬 + 낙사(`f_death`) = 100.00% 일치**, 자살(`g_death`)은 데스로 세지 않는다.
 *   근거 숫자는 `@sacloud/nexon` 의 `deathsOf` 머리말에 있다.
 *
 * ── 무엇을 채우고 무엇을 비우나
 *   ```
 *   채운다   참가자(str_usn) · 닉 · kill · death · weapon · side
 *   비운다   assist · damage · headshot · dropout · mvp   ← 배틀로그에 그 칸이 없다
 *   ```
 *   **없는 값을 0으로 지어내지 않는다** (`CLAUDE.md` 3장 7번 · 3-A 8번).
 *
 * ── 10명이 다 확인된 경기만 넣는다 (D-106 · `roundState.ts` 의 `isRestorable` 과 같은 기준)
 *   킬도 데스도 없는 선수는 이벤트에 아예 안 나온다. 그런 경기를 9명으로 넣으면
 *   그 경기의 승률·평균킬 분모가 조용히 틀어진다. **모자라면 통째로 건너뛰고 세어 보고한다.**
 *
 * 이 파일은 DB 도 네트워크도 모른다. 판정만 한다.
 */
import {
  COUNTED_DEATH_KINDS,
  deathsOf,
  killsOf,
  rosterOf,
  weaponByPlayerOf,
  type DeathEvent,
  type RoundStateEvent,
  type Weapon,
} from '@sacloud/nexon'

/** 클랜전은 5대5 다. 다른 인원수 경기는 이 판정의 대상이 아니다 */
export const LINEUP_TEAM_SIZE = 5

/**
 * 이벤트 한 줄에서 우리가 보는 칸.
 *
 * `RoundStateEvent`(팀 번호)와 `DeathEvent`(무기·좌표·`event_key`·숫자 계정값)를 합친 것에
 * **닉네임 칸**을 더했다. 닉은 두 모듈 다 안 보지만 우리는 `Player.name` 을 만들어야 해서 필요하다.
 *
 * ⚠ `DuelEvent` 가 아니라 `DeathEvent` 를 상속한다 — 데스를 죽음 줄에서 세면서
 * `event_key`(중복 제거 키)와 `user_nexon_sn`(상대 팀 자살·낙사의 유일한 신원)이 필요해졌다.
 * 처음에는 `DuelEvent` 였는데 **단위 테스트가 그 구멍을 잡았다.**
 */
export interface LineupEvent extends RoundStateEvent, DeathEvent {
  user_nick?: string | null
  target_user_nick?: string | null
}

/** 응답의 `teamList` 한 줄 — 팀 번호와 클랜 번호의 짝 */
export interface LineupTeamEntry {
  team_no?: string | number | null
  clan_no?: string | number | null
}

/** 라인업을 못 만드는 이유. **세어서 보고한다. 조용히 버리지 않는다** */
export type LineupSkipReason =
  /** 이벤트가 한 줄도 없다 (빈 응답) */
  | 'no_events'
  /** 팀이 정확히 둘이 아니다 */
  | 'team_count'
  /** 양 팀이 5명씩 확인되지 않았다 — 이벤트에 안 나온 선수가 있다 */
  | 'roster_incomplete'
  /** `teamList` 가 두 팀을 다 알려 주지 않는다 */
  | 'no_team_list'
  /** 팀 번호와 이벤트의 팀 번호가 어긋난다 */
  | 'team_no_mismatch'
  /** 클랜 번호를 우리 클랜으로 잇지 못했다 (`ipl-clan-number` 를 먼저 돌려야 한다) */
  | 'clan_unmapped'
  /** 이은 클랜이 그 경기의 양 진영과 맞지 않는다 */
  | 'side_mismatch'

/** 그 경기에 뛴 사람 하나 */
export interface LineupPlayer {
  /** 병영수첩 계정 고유값. `BarracksClanMember.strUsn` 과 같은 값이다 */
  usn: string
  /** 숫자 계정값. 모르면 null */
  nexonSn: string | null
  /** 관측된 닉. 모르면 null — **지어내지 않는다** */
  nickname: string | null
  /** 응답이 준 팀 번호 (진영이 아니다 · D-184) */
  teamNo: string
  side: 'red' | 'blue'
  kill: number
  death: number
  /** 0 = 라이플 · 1 = 스나이퍼. 킬이 없거나 반반이면 null (D-106) */
  weapon: Weapon | null
}

export interface LineupPlanInput {
  events: readonly LineupEvent[]
  teamList: readonly LineupTeamEntry[]
  /** 클랜 번호 → 우리 `Clan.id`. 모르면 null */
  resolveClanNo: (clanNo: string) => string | null
  /** 그 경기의 레드 진영 클랜 (`Clan.id`) */
  redClanId: string
  /** 그 경기의 블루 진영 클랜 (`Clan.id`) */
  blueClanId: string
  /** 한 팀 인원. 기본 5 */
  teamSize?: number
  /**
   * 데스를 어디서 세나.
   *
   * ```
   * 'events'  죽음 줄에서 직접 센다 (킬 + 낙사).  ← 기본. 3rd.supply 와 100.00% 일치
   * 'kills'   킬에서 역산한다.                    ← **옛 방식.** 99.46% 였다
   * ```
   * 옛 방식을 지우지 않았다 (`CLAUDE.md` 10-4). 두 방식을 다시 견줄 때 쓴다.
   */
  deathSource?: 'events' | 'kills'
}

export type LineupPlan =
  | { ok: true; players: LineupPlayer[] }
  | { ok: false; reason: LineupSkipReason }

const str = (value: unknown): string | null => {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  return text === '' ? null : text
}

/**
 * 계정마다 닉·숫자값을 모은다 — **마지막에 본 값**을 쓴다.
 *
 * 한 경기 안에서 닉이 바뀌지는 않지만, 주체 줄과 상대 줄에 같은 사람이 다 나오므로
 * 둘 다 훑어야 킬이 없는 선수의 닉도 잡힌다.
 */
export function accountsOf(
  events: readonly LineupEvent[],
): Map<string, { nickname: string | null; nexonSn: string | null }> {
  const out = new Map<string, { nickname: string | null; nexonSn: string | null }>()
  const put = (usn: unknown, nick: unknown, sn: unknown) => {
    const key = str(usn)
    if (key === null) return
    const seen = out.get(key) ?? { nickname: null, nexonSn: null }
    /* 값이 있는 줄만 덮는다. 빈 칸으로 아는 값을 지우지 않는다 */
    const nickname = str(nick)
    const nexonSn = str(sn)
    out.set(key, {
      nickname: nickname ?? seen.nickname,
      nexonSn: nexonSn ?? seen.nexonSn,
    })
  }
  for (const event of events) {
    put(event.str_usn, event.user_nick, event.user_nexon_sn)
    put(event.target_str_usn, event.target_user_nick, event.target_user_nexon_sn)
  }
  return out
}

/**
 * `teamList` 를 팀번호 → 클랜번호 표로 바꾼다.
 *
 * 같은 팀 번호가 두 클랜을 가리키면 **그 줄을 버린다** — 다수결하지 않는다 (D-106).
 */
export function teamClanMapOf(teamList: readonly LineupTeamEntry[]): Map<string, string> {
  const seen = new Map<string, Set<string>>()
  for (const entry of teamList) {
    const teamNo = str(entry.team_no)
    const clanNo = str(entry.clan_no)
    if (teamNo === null || clanNo === null) continue
    if (!seen.has(teamNo)) seen.set(teamNo, new Set())
    seen.get(teamNo)?.add(clanNo)
  }
  const out = new Map<string, string>()
  for (const [teamNo, clanNos] of seen) {
    if (clanNos.size !== 1) continue
    out.set(teamNo, [...clanNos][0] as string)
  }
  return out
}

/**
 * 배틀로그 한 경기분 → 라인업 계획. 못 하면 **왜 못 하는지**를 돌려준다.
 *
 * 순서가 곧 우선순위다 — 명단이 안 차면 진영을 볼 필요가 없다.
 */
export function planLineup(input: LineupPlanInput): LineupPlan {
  const teamSize = input.teamSize ?? LINEUP_TEAM_SIZE
  if (input.events.length === 0) return { ok: false, reason: 'no_events' }

  const roster = rosterOf(input.events)
  if (roster.teams.length !== 2) return { ok: false, reason: 'team_count' }
  /* 10명이 다 확인되지 않으면 넣지 않는다. 9명짜리 경기가 분모를 조용히 깎는다 */
  if (!roster.teams.every((team) => roster.sizeOf.get(team) === teamSize)) {
    return { ok: false, reason: 'roster_incomplete' }
  }

  const teamClan = teamClanMapOf(input.teamList)
  if (teamClan.size !== 2) return { ok: false, reason: 'no_team_list' }
  /* `teamList` 의 팀 번호와 이벤트의 팀 번호가 같은 세계여야 한다 */
  if (!roster.teams.every((team) => teamClan.has(team))) {
    return { ok: false, reason: 'team_no_mismatch' }
  }

  /* 팀 번호 → 우리 클랜 */
  const clanOfTeam = new Map<string, string>()
  for (const team of roster.teams) {
    const clanNo = teamClan.get(team)
    if (clanNo === undefined) return { ok: false, reason: 'no_team_list' }
    const clanId = input.resolveClanNo(clanNo)
    if (clanId === null) return { ok: false, reason: 'clan_unmapped' }
    clanOfTeam.set(team, clanId)
  }

  /* 그 두 클랜이 정확히 이 경기의 양 진영이어야 한다. 하나라도 어긋나면 넣지 않는다 */
  const sideOfTeam = new Map<string, 'red' | 'blue'>()
  for (const [team, clanId] of clanOfTeam) {
    if (clanId === input.redClanId) sideOfTeam.set(team, 'red')
    else if (clanId === input.blueClanId) sideOfTeam.set(team, 'blue')
    else return { ok: false, reason: 'side_mismatch' }
  }
  if (new Set(sideOfTeam.values()).size !== 2) return { ok: false, reason: 'side_mismatch' }

  /* 킬과 무기는 킬 목록에서 나온다. **데스는 아니다** — 아래를 보라 */
  const kills = killsOf(input.events)
  const killCount = new Map<string, number>()
  for (const kill of kills) {
    killCount.set(kill.killer, (killCount.get(kill.killer) ?? 0) + 1)
  }
  const weaponOf = weaponByPlayerOf(kills)
  const accounts = accountsOf(input.events)

  /*
    ── 데스는 **죽음 줄에서 직접** 센다 (2026-09-01)

    킬에서 역산하면 **죽인 사람이 없는 죽음**을 통째로 놓친다. 3rd.supply 원본과
    맞대 보니 43,682건 중 237건에서 데스만 1 적었다(킬은 100% 일치).
    죽음 줄에서 세면 **43,680건이 일치한다(100.00%)** — 자세한 근거는 `deathsOf` 머리말.

    상대 팀의 자살·낙사 줄은 `target_str_usn` 이 비어 있고 숫자 계정값만 있다.
    그래서 숫자 → `str_usn` 되돌림표를 만들어 잇는다. **못 이으면 세지 않는다.**
  */
  const usnOfNexonSn = new Map<string, string>()
  for (const [usn, account] of accounts) {
    if (account.nexonSn !== null) usnOfNexonSn.set(account.nexonSn, usn)
  }
  const deathCount = new Map<string, number>()
  if ((input.deathSource ?? 'events') === 'events') {
    const counted = new Set<string>(COUNTED_DEATH_KINDS)
    for (const death of deathsOf(input.events)) {
      if (!counted.has(death.kind)) continue
      const usn =
        (death.victimUsn !== null && roster.teamOf.has(death.victimUsn) ? death.victimUsn : null) ??
        (death.victimNexonSn !== null ? (usnOfNexonSn.get(death.victimNexonSn) ?? null) : null)
      if (usn === null) continue
      deathCount.set(usn, (deathCount.get(usn) ?? 0) + 1)
    }
  } else {
    /* 옛 방식 — 킬에서 역산한다 (`CLAUDE.md` 10-4 로 남겨 둔 것) */
    for (const kill of kills) {
      deathCount.set(kill.victim, (deathCount.get(kill.victim) ?? 0) + 1)
    }
  }

  const players: LineupPlayer[] = []
  for (const [usn, team] of roster.teamOf) {
    const side = sideOfTeam.get(team)
    if (side === undefined) return { ok: false, reason: 'side_mismatch' }
    const account = accounts.get(usn)
    players.push({
      usn,
      nexonSn: account?.nexonSn ?? null,
      nickname: account?.nickname ?? null,
      teamNo: team,
      side,
      /* 0 은 **실제 값**이다 — 명단에 있는데 킬이 없으면 0킬이 맞다.
         모르는 것(assist·damage)과 다르다 */
      kill: killCount.get(usn) ?? 0,
      death: deathCount.get(usn) ?? 0,
      weapon: weaponOf.get(usn) ?? null,
    })
  }

  /* 부르는 쪽이 순서에 기대지 않게 고정해 둔다 (멱등한 로그·보고를 위해) */
  players.sort((a, b) => (a.side === b.side ? a.usn.localeCompare(b.usn) : a.side < b.side ? -1 : 1))
  return { ok: true, players }
}
