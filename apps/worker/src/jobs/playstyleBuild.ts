/**
 * 플레이스타일 바 재료를 `PlayerPlaystyleProfile` 에 쌓는다 (사양 8절 · D-211).
 *
 * ```
 * 블루 = 수비   안전함   ↔  변칙적
 * 레드 = 공격   느린전개 ↔  빠른전개
 * ```
 *
 * 판정은 전부 `@sacloud/nexon` 의 순수 함수(`playstyle.ts`)가 하고,
 * 여기서는 DB 를 읽고 쓰기만 한다 — `roundBuild.ts` · `clanRoundBuild.ts` 와 같은 구조다.
 *
 * ```
 * pnpm --filter @sacloud/worker playstyle-build            # 미리보기
 * pnpm --filter @sacloud/worker playstyle-build --confirm  # 실제 저장
 * ```
 *
 * **`--confirm` 없이는 한 줄도 쓰지 않는다.** 멱등이다 — 같은 원문을 다시 돌려도
 * 행이 늘지 않고 값이 덮인다.
 *
 * ── 왜 클랜 응답만 쓰는가
 *   선수 단위 응답(`GetBattleLog`)에는 그 선수가 얽힌 이벤트만 온다 (D-184).
 *   그걸로는 라운드 첫 교전이 누구였는지도, 상대가 언제 죽었는지도 알 수 없다.
 *
 * ── 한 경기는 **응답 하나**로 읽는다
 *   두 응답을 합치면 같은 킬이 두 줄이 되고, 같은 죽음의 `event_time` 이 1초 어긋나
 *   들어오는 일이 있다 (`roundState.ts` 의 같은 문제). 킬은 반드시 양 팀이 얽히므로
 *   한 클랜 응답에 그 경기 킬이 사실상 전부 들어 있다 — **이벤트가 가장 많은 응답**을 고른다.
 *
 * ── 진영을 모르면 그 라운드는 **양쪽 어디에도** 넣지 않는다 (D-106)
 *   교대를 확인하지 못했거나 근거가 어긋난 경기는 통째로 뺀다.
 */
import { prisma } from '@sacloud/db'
import {
  addSideTally,
  clanByTeamNo,
  emptyTally,
  playstyleTallyOf,
  roundResultsOf,
  roundSidesOf,
  rosterOf,
  type PlaystyleEvent,
  type PlaystyleTally,
} from '@sacloud/nexon'

/* 버전은 `../lib/playstyleBuilderVersion` 한 곳에만 있다 — 화면도 그 파일을 읽는다 */
export { PLAYSTYLE_BUILDER_VERSION } from '../lib/playstyleBuilderVersion.js'
import { PLAYSTYLE_BUILDER_VERSION } from '../lib/playstyleBuilderVersion.js'

/** 클랜전은 5대5 다. `plimit` 이 다른 경기는 복원 대상이 아니다 */
const TEAM_SIZE = 5

/**
 * 원문을 한 번에 몇 줄씩 읽을까.
 *
 * 페이로드가 커서 전부 한 번에 읽으면 **커넥션이 끊긴다** (2026-08-31 실측:
 * 2,760줄을 한 번에 요청하니 `Server has closed the connection`). 조각내 읽는다.
 */
const CHUNK = 60

interface RawShape {
  battleLog?: PlaystyleEvent[]
  teamList?: { team_no?: unknown; clan_no?: unknown }[]
}

const rawOf = (payload: unknown): RawShape =>
  payload && typeof payload === 'object' ? (payload as RawShape) : {}

/**
 * `str_usn` → `user_nexon_sn`.
 *
 * **둘은 다른 값이다.** 라운드 복원은 `str_usn` 으로 사람을 가르지만(로그의 주인 키),
 * 우리 `Player.sourcePlayerId` 와 맞물리는 것은 `user_nexon_sn` 이다.
 * 이걸 안 바꾸고 저장하면 프로필은 만들어지는데 **선수와 한 명도 안 이어진다**
 * (2026-08-31 실측: 4,169명 전원 미연결). `roundBuild.ts` 의 `accountMapOf` 와 같은 일이다.
 */
function accountMapOf(events: readonly PlaystyleEvent[]): Map<string, string> {
  const map = new Map<string, string>()
  const put = (usn: unknown, sn: unknown) => {
    if (typeof usn !== 'string' || usn === '') return
    if (sn === null || sn === undefined || sn === '') return
    map.set(usn, String(sn))
  }
  for (const event of events as unknown as Record<string, unknown>[]) {
    put(event.str_usn, event.user_nexon_sn)
    put(event.target_str_usn, event.target_user_nexon_sn)
  }
  return map
}

export interface PlaystyleBuildResult {
  /** 클랜 단위 배틀로그 원문 줄 수 */
  rows: number
  /** 그중 고유 경기 수 */
  matches: number
  /** 응답의 `teamList` 로 그 클랜의 팀 번호를 못 찾아 뺀 경기 */
  unknownTeamNo: number
  /** 양 팀 5명씩이 확인되지 않아 뺀 경기 */
  notRestorable: number
  /** 진영 근거가 서로 어긋난 경기 — 아무것도 확정하지 않았다 */
  conflicts: number
  /** `str_usn` 을 계정 번호로 못 바꾼 (경기 × 사람) — 그 사람은 그 경기에서 빠진다 */
  unknownAccounts: number
  /** 교대를 못 봐서 뺀 경기 */
  unsided: number
  /** 실제로 집계에 들어간 경기 */
  used: number
  /** 만들어진 프로필 수 */
  profiles: number
  /** 그중 우리 `Player` 와 이어진 것 */
  linked: number
  /** 진영별로 실제로 센 라운드 수 */
  defenseRounds: number
  attackRounds: number
  written: boolean
}

export async function buildPlayerPlaystyleProfiles(input: {
  confirm: boolean
}): Promise<PlaystyleBuildResult> {
  /* `matchKey` 순으로 읽어 같은 경기의 응답들이 붙어 오게 한다 */
  const ids = await prisma.barracksBattleLogRaw.findMany({
    where: { subjectKind: 'clan', status: 'ok' },
    select: { id: true },
    orderBy: [{ matchKey: 'asc' }, { id: 'asc' }],
  })

  const result: PlaystyleBuildResult = {
    rows: ids.length,
    matches: 0,
    unknownTeamNo: 0,
    notRestorable: 0,
    conflicts: 0,
    unknownAccounts: 0,
    unsided: 0,
    used: 0,
    profiles: 0,
    linked: 0,
    defenseRounds: 0,
    attackRounds: 0,
    written: false,
  }

  /** 경기키 → 이벤트가 가장 많은 응답 */
  const best = new Map<string, { subject: string; payload: unknown; size: number }>()
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK).map((row) => row.id)
    const rows = await prisma.barracksBattleLogRaw.findMany({
      where: { id: { in: slice } },
      select: { matchKey: true, subject: true, payload: true },
    })
    for (const row of rows) {
      const size = rawOf(row.payload).battleLog?.length ?? 0
      const seen = best.get(row.matchKey)
      if (seen === undefined || size > seen.size) {
        best.set(row.matchKey, { subject: row.subject, payload: row.payload, size })
      }
    }
  }
  result.matches = best.size

  /** 계정 번호 → 진영별 집계 */
  const totals = new Map<string, PlaystyleTally & { matches: number }>()
  const tallyOf = (usn: string) => {
    let entry = totals.get(usn)
    if (!entry) {
      entry = { ...emptyTally(), matches: 0 }
      totals.set(usn, entry)
    }
    return entry
  }

  for (const [, entry] of best) {
    const raw = rawOf(entry.payload)
    const events = raw.battleLog ?? []
    if (events.length === 0) continue

    /* `team_no` 는 클랜 번호지 진영이 아니다 (D-184). 응답이 짝을 알려 준다 */
    const clanByTeam = clanByTeamNo((raw.teamList ?? []) as never)
    const teamNo = [...clanByTeam.entries()].find(([, no]) => no === entry.subject)?.[0]
    if (teamNo === undefined) {
      result.unknownTeamNo += 1
      continue
    }

    /* 이벤트가 한 명분이라도 빠지면 "라운드 첫 교전" 판정이 틀어진다.
       양 팀 5명씩이 확인된 경기만 쓴다 (`roundState.ts` 의 `isRestorable` 과 같은 뜻) */
    const roster = rosterOf(events as never)
    if (roster.teams.length !== 2) {
      result.notRestorable += 1
      continue
    }
    if (!roster.teams.every((team) => roster.sizeOf.get(team) === TEAM_SIZE)) {
      result.notRestorable += 1
      continue
    }

    /* 라운드 승패는 **이 응답 기준**이다. 다른 클랜의 응답과 섞지 않는다 (D-184).
       5승 규칙(D-208)이 교대 지점을 좁히는 데 쓴다 */
    const results = roundResultsOf(events as never)
    const wonRound = (round: number): boolean | null => results.get(round) ?? null

    let totalRounds = 0
    for (const event of events) {
      const n = Number(String(event.round ?? '').trim())
      if (Number.isInteger(n) && n > totalRounds) totalRounds = n
    }
    if (totalRounds === 0) {
      result.notRestorable += 1
      continue
    }

    const sides = roundSidesOf(events as never, teamNo, totalRounds, wonRound)
    if (sides.conflict) {
      result.conflicts += 1
      continue
    }
    if (sides.switchRound === null) {
      result.unsided += 1
      continue
    }
    result.used += 1

    const perMatch = playstyleTallyOf({
      events,
      teamNo,
      teamOf: roster.teamOf,
      sideOf: sides.side,
    })

    /* 로그의 주인 키(`str_usn`)를 **계정 번호**로 바꿔서 쌓는다.
       바꾸지 않으면 우리 `Player` 와 한 명도 안 이어진다 */
    const accountOf = accountMapOf(events)

    for (const [usn, tally] of perMatch) {
      const account = accountOf.get(usn)
      if (account === undefined) {
        result.unknownAccounts += 1
        continue
      }
      const into = tallyOf(account)
      into.matches += 1
      addSideTally(into.defense, tally.defense)
      addSideTally(into.attack, tally.attack)
      result.defenseRounds += tally.defense.rounds
      result.attackRounds += tally.attack.rounds
    }
  }

  result.profiles = totals.size

  /* 계정 번호 → 우리 Player. 못 찾으면 비워 두고 집계는 그대로 남긴다 (D-036) */
  const accounts = [...totals.keys()]
  const playerByAccount = new Map<string, string>()
  for (let i = 0; i < accounts.length; i += 500) {
    const slice = accounts.slice(i, i + 500)
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
      defenseRounds: accum.defense.rounds,
      defenseOpening: accum.defense.opening,
      defenseDelaySum: accum.defense.delaySum,
      defenseDelayN: accum.defense.delayN,
      defensePosX: accum.defense.posX,
      defensePosY: accum.defense.posY,
      defensePosX2: accum.defense.posX2,
      defensePosY2: accum.defense.posY2,
      defensePosN: accum.defense.posN,
      attackRounds: accum.attack.rounds,
      attackOpening: accum.attack.opening,
      attackDelaySum: accum.attack.delaySum,
      attackDelayN: accum.attack.delayN,
      attackPosX: accum.attack.posX,
      attackPosY: accum.attack.posY,
      attackPosX2: accum.attack.posX2,
      attackPosY2: accum.attack.posY2,
      attackPosN: accum.attack.posN,
      computedAt: new Date(),
    }
    await prisma.playerPlaystyleProfile.upsert({
      where: {
        userNexonSn_builderVersion: {
          userNexonSn: account,
          builderVersion: PLAYSTYLE_BUILDER_VERSION,
        },
      },
      update: data,
      create: { userNexonSn: account, builderVersion: PLAYSTYLE_BUILDER_VERSION, ...data },
    })
  }
  result.written = true
  return result
}
