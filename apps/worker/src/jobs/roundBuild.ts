/**
 * 라운드 복원 집계를 `PlayerRoundProfile` 에 쌓는다 (D-194).
 *
 * 육각형 세 축(세이브 · 매치의 사나이 · 소수싸움)과 우리 MVP 의 재료다.
 * 판정은 전부 `@sacloud/nexon` 의 순수 함수가 하고, 여기서는 DB 를 읽고 쓰기만 한다.
 *
 * ```
 * pnpm --filter @sacloud/worker nexon round-build            # 미리보기
 * pnpm --filter @sacloud/worker nexon round-build --confirm  # 실제 저장
 * ```
 *
 * **`--confirm` 없이는 한 줄도 쓰지 않는다.** 멱등이다 — 같은 원문을 다시 돌려도
 * 행이 늘지 않고 값이 덮인다.
 *
 * ── 왜 클랜 응답만 쓰는가
 *   선수 단위 응답(`GetBattleLog`)에는 그 선수가 얽힌 이벤트만 온다 (D-184).
 *   그걸로는 "몇 명 살아 있었나" 를 절대 복원할 수 없다.
 *
 * ── 승패는 **조회 클랜 기준**이다
 *   `win_flag` 는 그 응답을 받은 클랜 기준이라, 두 클랜의 응답을 섞어서 읽으면 안 된다.
 *   그래서 승패는 **응답 하나씩** 읽어 팀 번호에 붙이고, 두 응답이 어긋나면
 *   그 라운드를 버린다 (D-106 · 다수결하지 않는다).
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { prisma } from '@sacloud/db'
import {
  clanByTeamNo,
  duelTallyOf,
  killsOf,
  oneAttackTallyOf,
  weaponByPlayerOf,
  type ZoneCells,
  isRestorable,
  lastRoundTopKiller,
  rosterOf,
  roundResultsOf,
  roundTallyOf,
  secondsOf,
  type RoundStateEvent,
} from '@sacloud/nexon'

/* 버전은 `../lib/roundBuilderVersion` 한 곳에만 있다 — 화면도 그 파일을 읽는다 */
export { ROUND_BUILDER_VERSION } from '../lib/roundBuilderVersion.js'
import { ROUND_BUILDER_VERSION } from '../lib/roundBuilderVersion.js'

/** 클랜전은 5대5 다. `plimit` 이 다른 경기는 복원 대상이 아니다 */
const TEAM_SIZE = 5

/** 매치의 사나이 판정 기준 — **20분 초과** (사양 4절 · 6절) */
const LONG_MATCH_SECONDS = 20 * 60

/**
 * 스나싸움 구역 (D-195 · 사양 4절 2번).
 *
 * 사용자가 좌표 산점도 위에 직접 칠한 것이다 (`data/barracks/sniper-lane.json`).
 * 뱃지 전용이라 다른 구역과 겹쳐도 된다 (사양 2절).
 */
function sniperLane(): ZoneCells {
  const file = path.resolve(process.cwd(), '../../data/barracks/sniper-lane.json')
  return JSON.parse(readFileSync(file, 'utf8')) as ZoneCells
}

/**
 * 배틀로그만으로 잰 경기 길이 — **마지막 이벤트의 누적 시각**이다.
 *
 * `event_time` 은 경기 시작부터의 누적이므로(D-174) 마지막 킬의 시각이 곧 경기 길이의
 * **하한**이다. 마지막 킬 뒤에도 폭탄이 터지거나 시간이 흐르므로 실제보다 **짧게** 잡힌다.
 *
 * ── 왜 이게 필요한가
 *   플레이시간은 경기 정보(`Match.playTime`)에 있는데, 수집한 배틀로그 2,449경기 중
 *   우리 `Match` 표에 있는 것이 **344건뿐**이다(86%가 미러에 없는 경기다).
 *   그것만 쓰면 20분 초과가 40건이라 매치의 사나이가 사실상 아무에게도 안 붙는다.
 *
 *   그래서 **경기 정보가 있으면 그 값을 쓰고, 없으면 이 하한을 쓴다.**
 *   하한이라 20분을 넘겼는데 못 넘긴 것으로 볼 수는 있어도, 그 반대는 없다 —
 *   틀리는 방향이 "적게 세는" 쪽이다 (D-106 과 같은 원칙).
 */
function lastEventSeconds(events: readonly RoundStateEvent[]): number | null {
  let max: number | null = null
  for (const event of events) {
    const at = secondsOf(event.event_time)
    if (at === null) continue
    if (max === null || at > max) max = at
  }
  return max
}

interface ClanRow {
  matchKey: string
  subject: string
  payload: unknown
}

interface Accum {
  matches: number
  alone: number
  aloneWon: number
  outnumbered: number
  outnumberedWon: number
  matchMan: number
  longMatches: number
  snipeDuels: number
  snipeDuelWins: number
  workKills: number
  workRifleKills: number
  oneAttackKills: number
  oneAttackSameKills: number
}

const zero = (): Accum => ({
  matches: 0,
  alone: 0,
  aloneWon: 0,
  outnumbered: 0,
  outnumberedWon: 0,
  matchMan: 0,
  longMatches: 0,
  snipeDuels: 0,
  snipeDuelWins: 0,
  workKills: 0,
  workRifleKills: 0,
  oneAttackKills: 0,
  oneAttackSameKills: 0,
})

interface RawShape {
  battleLog?: RoundStateEvent[]
  teamList?: { team_no?: string | null; clan_no?: string | null }[]
}

const rawOf = (payload: unknown): RawShape => {
  if (typeof payload !== 'object' || payload === null) return {}
  const holder = payload as { raw?: unknown }
  const raw = typeof holder.raw === 'object' && holder.raw !== null ? holder.raw : payload
  return raw as RawShape
}

/**
 * `str_usn` → `user_nexon_sn`.
 *
 * 판정은 `str_usn` 으로 하고 저장은 계정 번호로 한다.
 * **계정 번호가 사람의 키다** — 닉네임은 바뀐다 (D-036 · D-114 와 같은 규칙).
 */
function accountMapOf(events: readonly Record<string, unknown>[]): Map<string, string> {
  const map = new Map<string, string>()
  const put = (usn: unknown, sn: unknown) => {
    if (typeof usn !== 'string' || usn === '') return
    if (sn === null || sn === undefined || sn === '') return
    map.set(usn, String(sn))
  }
  for (const event of events) {
    put(event.str_usn, event.user_nexon_sn)
    put(event.target_str_usn, event.target_user_nexon_sn)
  }
  return map
}

export interface RoundBuildResult {
  /** 클랜 응답이 있는 고유 경기 */
  matches: number
  /** 그중 양 팀 5명이 확인돼 복원한 경기 */
  restored: number
  /** 20분 초과라 매치의 사나이를 잰 경기 */
  longMatches: number
  /** 그중 동률이 아니라 실제로 한 명을 뽑은 경기 */
  matchManDecided: number
  /** 계정 번호를 못 찾아 버린 선수-경기 */
  unknownAccounts: number
  /** 만들어진 프로필 수 */
  profiles: number
  /** 그중 우리 Player 와 이어진 것 */
  linked: number
  /** 그 경기에서 **스나를 든 것으로 확인된** 선수-경기 수 */
  sniperEntries: number
  /** 포지션까지 알아 원어택을 잰 선수-경기 수 */
  oneAttackEntries: number
  written: boolean
}

export async function buildRoundProfiles(input: { confirm: boolean }): Promise<RoundBuildResult> {
  const rows = (await prisma.barracksBattleLogRaw.findMany({
    where: { subjectKind: 'clan', status: 'ok' },
    select: { matchKey: true, subject: true, payload: true },
  })) as ClanRow[]

  /** matchKey → 그 경기의 응답들 */
  const byMatch = new Map<string, ClanRow[]>()
  for (const row of rows) {
    const list = byMatch.get(row.matchKey)
    if (list) list.push(row)
    else byMatch.set(row.matchKey, [row])
  }

  /* 플레이시간은 경기 정보에 있다. 한 번에 읽는다 */
  const playTimes = new Map<string, number | null>()
  const keys = [...byMatch.keys()]
  for (let i = 0; i < keys.length; i += 500) {
    const slice = keys.slice(i, i + 500)
    const matches = await prisma.match.findMany({
      where: { sourceMatchId: { in: slice } },
      select: { sourceMatchId: true, playTime: true },
    })
    for (const match of matches) {
      if (match.sourceMatchId) playTimes.set(match.sourceMatchId, match.playTime)
    }
  }

  const totals = new Map<string, Accum>()
  const result: RoundBuildResult = {
    matches: byMatch.size,
    restored: 0,
    longMatches: 0,
    matchManDecided: 0,
    unknownAccounts: 0,
    profiles: 0,
    linked: 0,
    sniperEntries: 0,
    oneAttackEntries: 0,
    written: false,
  }

  const zone = sniperLane()

  /* 포지션 자동 판정 결과 (D-196). `str_usn` → `2F`/`B`/`SHORT`.
     없는 선수는 그냥 없다 — 모르는 것을 채우지 않는다 */
  const positionByPlayer = new Map<string, string>()
  for (const row of await prisma.playerPositionProfile.findMany({
    where: { position: { not: null } },
    select: { userNexonSn: true, position: true },
  })) {
    if (row.position) positionByPlayer.set(row.userNexonSn, row.position)
  }

  for (const [matchKey, group] of byMatch) {
    const events: RoundStateEvent[] = []
    for (const row of group) events.push(...(rawOf(row.payload).battleLog ?? []))
    if (events.length === 0) continue

    const roster = rosterOf(events)
    if (!isRestorable(roster, TEAM_SIZE)) continue
    result.restored += 1

    /* 라운드 승패를 **팀 번호에 붙인다.** 응답마다 따로 읽고, 어긋나면 그 라운드를 버린다 */
    const wonByTeam = new Map<number, Map<string, boolean>>()
    const broken = new Set<number>()
    for (const row of group) {
      const raw = rawOf(row.payload)
      const subjectEvents = raw.battleLog ?? []
      const teamOfClan = clanByTeamNo(raw.teamList ?? [])
      let myTeam = [...teamOfClan.entries()].find(([, clan]) => clan === row.subject)?.[0]
      if (myTeam === undefined) {
        /* `teamList` 가 없는 응답도 있다. `str_usn`(로그의 주인)은 조회 클랜의 선수들이다 */
        const subjects = new Set(
          subjectEvents.map((event) => event.str_usn).filter((v): v is string => typeof v === 'string'),
        )
        const teams = new Set(
          [...subjects].map((usn) => roster.teamOf.get(usn)).filter((v): v is string => Boolean(v)),
        )
        if (teams.size === 1) myTeam = [...teams][0]
      }
      /* 명단에 없는 팀 번호면 버린다. 그대로 두면 `find` 가 **아무 팀이나** 골라
         그 팀에 `!won` 이 뒤집혀 박힌다 — 세이브·소수싸움 승패가 통째로 반대가 된다 */
      if (myTeam === undefined || !roster.teams.includes(myTeam)) continue

      const foe = roster.teams.find((team) => team !== myTeam)
      if (foe === undefined) continue

      for (const [round, won] of roundResultsOf(subjectEvents as never)) {
        if (won === null) continue
        const known = wonByTeam.get(round) ?? new Map<string, boolean>()
        const before = known.get(myTeam)
        if (before !== undefined && before !== won) {
          broken.add(round)
          continue
        }
        known.set(myTeam, won)
        known.set(foe, !won)
        wonByTeam.set(round, known)
      }
    }

    /* 경기 정보가 있으면 그 값이 정본이다. 없으면 배틀로그가 주는 하한을 쓴다 */
    const playTime = playTimes.get(matchKey) ?? lastEventSeconds(events)
    const isLong = playTime !== null && playTime > LONG_MATCH_SECONDS
    if (isLong) result.longMatches += 1
    const manOfMatch = isLong ? lastRoundTopKiller(events) : null
    if (manOfMatch !== null) result.matchManDecided += 1
    /* **동률이라 아무도 못 뽑은 경기는 분모에도 넣지 않는다.**
       넣으면 아무도 분자에 못 들어가는 경기가 분모만 늘려 비율이 통째로 낮아진다.
       실측상 20분 초과 322건 중 113건이 동률이다 — 분모의 35%다 */
    const countsForMatchMan = isLong && manOfMatch !== null

    const accounts = accountMapOf(events as unknown as Record<string, unknown>[])

    /* 스나싸움·작업 성공률 (D-195). 무기는 킬로그에서 되짚는다 —
       우리 DB 344경기를 정답으로 대조했을 때 정확도 99.9% 였다 */
    const kills = killsOf(events as never)
    const weaponByPlayer = weaponByPlayerOf(kills)

    for (const [usn, team] of roster.teamOf) {
      const account = accounts.get(usn)
      if (account === undefined) {
        result.unknownAccounts += 1
        continue
      }

      const tally = roundTallyOf({
        events,
        usn,
        teamSize: TEAM_SIZE,
        wonRound: (round) => {
          if (broken.has(round)) return null
          const won = wonByTeam.get(round)?.get(team)
          return won === undefined ? null : won
        },
      })
      if (!tally) continue

      const duel = duelTallyOf({ kills, weaponByPlayer, usn, zone })
      const oneAttack = oneAttackTallyOf({ kills, weaponByPlayer, positionByPlayer, usn })

      const accum = totals.get(account) ?? zero()
      accum.matches += 1
      if (duel) {
        result.sniperEntries += 1
        accum.snipeDuels += duel.snipeDuels
        accum.snipeDuelWins += duel.snipeDuelWins
        accum.workKills += duel.workKills
        accum.workRifleKills += duel.workRifleKills
      }
      if (oneAttack) {
        result.oneAttackEntries += 1
        accum.oneAttackKills += oneAttack.kills
        accum.oneAttackSameKills += oneAttack.sameKills
      }
      accum.alone += tally.alone
      accum.aloneWon += tally.aloneWon
      accum.outnumbered += tally.outnumbered
      accum.outnumberedWon += tally.outnumberedWon
      if (countsForMatchMan) {
        accum.longMatches += 1
        if (manOfMatch === usn) accum.matchMan += 1
      }
      totals.set(account, accum)
    }
  }

  result.profiles = totals.size

  /* 계정 번호 → 우리 Player. 못 찾으면 비워 두고 집계는 그대로 남긴다 (D-036) */
  const accountList = [...totals.keys()]
  const playerByAccount = new Map<string, string>()
  for (let i = 0; i < accountList.length; i += 500) {
    const slice = accountList.slice(i, i + 500)
    const players = await prisma.player.findMany({
      where: { sourcePlayerId: { in: slice } },
      select: { id: true, sourcePlayerId: true },
    })
    for (const player of players) {
      if (player.sourcePlayerId) playerByAccount.set(player.sourcePlayerId, player.id)
    }
  }
  result.linked = playerByAccount.size

  if (!input.confirm) return result

  for (const [account, accum] of totals) {
    const data = {
      playerId: playerByAccount.get(account) ?? null,
      matches: accum.matches,
      alone: accum.alone,
      aloneWon: accum.aloneWon,
      outnumbered: accum.outnumbered,
      outnumberedWon: accum.outnumberedWon,
      matchMan: accum.matchMan,
      longMatches: accum.longMatches,
      snipeDuels: accum.snipeDuels,
      snipeDuelWins: accum.snipeDuelWins,
      workKills: accum.workKills,
      workRifleKills: accum.workRifleKills,
      oneAttackKills: accum.oneAttackKills,
      oneAttackSameKills: accum.oneAttackSameKills,
      computedAt: new Date(),
    }
    await prisma.playerRoundProfile.upsert({
      where: {
        userNexonSn_builderVersion: {
          userNexonSn: account,
          builderVersion: ROUND_BUILDER_VERSION,
        },
      },
      update: data,
      create: { userNexonSn: account, builderVersion: ROUND_BUILDER_VERSION, ...data },
    })
  }
  result.written = true
  return result
}
