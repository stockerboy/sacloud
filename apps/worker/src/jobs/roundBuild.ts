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
import { prisma } from '@sacloud/db'
import {
  clanByTeamNo,
  isRestorable,
  lastRoundTopKiller,
  rosterOf,
  roundResultsOf,
  roundTallyOf,
  type RoundStateEvent,
} from '@sacloud/nexon'

/** 집계 규칙 버전. 규칙이 바뀌면 이 값을 올린다 — 옛 줄은 남는다 */
export const ROUND_BUILDER_VERSION = 'round-v1'

/** 클랜전은 5대5 다. `plimit` 이 다른 경기는 복원 대상이 아니다 */
const TEAM_SIZE = 5

/** 매치의 사나이 판정 기준 — **20분 초과** (사양 4절 · 6절) */
const LONG_MATCH_SECONDS = 20 * 60

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
}

const zero = (): Accum => ({
  matches: 0,
  alone: 0,
  aloneWon: 0,
  outnumbered: 0,
  outnumberedWon: 0,
  matchMan: 0,
  longMatches: 0,
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
    written: false,
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
      if (myTeam === undefined) continue

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

    const playTime = playTimes.get(matchKey) ?? null
    const isLong = playTime !== null && playTime > LONG_MATCH_SECONDS
    if (isLong) result.longMatches += 1
    const manOfMatch = isLong ? lastRoundTopKiller(events) : null
    if (manOfMatch !== null) result.matchManDecided += 1

    const accounts = accountMapOf(events as unknown as Record<string, unknown>[])

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

      const accum = totals.get(account) ?? zero()
      accum.matches += 1
      accum.alone += tally.alone
      accum.aloneWon += tally.aloneWon
      accum.outnumbered += tally.outnumbered
      accum.outnumberedWon += tally.outnumberedWon
      if (isLong) {
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
