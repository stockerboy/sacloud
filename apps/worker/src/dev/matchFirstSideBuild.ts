/**
 * 경기마다 **전반 공수**를 판정해 `Match.firstHalfAttackSide` 에 채운다 (D-207).
 *
 * ```
 * pnpm --filter @sacloud/worker exec tsx src/dev/matchFirstSideBuild.ts            # 미리보기
 * pnpm --filter @sacloud/worker exec tsx src/dev/matchFirstSideBuild.ts --confirm  # 실제 저장
 * ```
 * 원문이 많으면 힙이 모자란다 — `NODE_OPTIONS=--max-old-space-size=8192` 를 붙인다.
 *
 * ── 왜 필요한가
 *   화면의 `선레드`/`선블루` 는 지금까지 우리 red/blue **슬롯 이름**으로 적혀 있었다.
 *   그 슬롯은 수집 시 `team_id` 오름차순으로 정한 내부 자리일 뿐이고
 *   (`../lib/projectionRule.ts` 의 `assignSides()` — 문서에도 "의미는 `[미확인]`"),
 *   폭탄 근거로 대조하니 `red` 슬롯이 전반 **수비**인 경기가 압도적이었다.
 *   즉 표기가 사실상 통째로 뒤집혀 있었다.
 *
 *   ```
 *   선레드 = 레드진영(공격)을 먼저 한 팀   (2026-08-30 사용자 확정)
 *   선블루 = 블루진영(수비)을 먼저 한 팀
 *   ```
 *
 * ── **슬롯은 뒤집지 않는다**
 *   `redLeagueClanId` / `blueLeagueClanId` 는 래더·집계·기록 전체가 쓰는 값이다.
 *   배정을 뒤집으면 과거 기록의 의미가 흔들린다. 여기서는 **표기의 근거만** 따로 담는다.
 *
 * ── 판정은 `@sacloud/nexon` 이 한다
 *   폭탄(C4 설치/해체)이 진영의 **방향**을, 라운드 5승 규칙이 **교대 지점**을 정한다
 *   (D-184 · D-208). `roundSidesOf` 가 사실의 원천이고 이 파일은 DB 를 읽고 쓰기만 한다 —
 *   `jobs/clanRoundBuild.ts` 와 같은 꼴이다.
 *   **`packages/nexon` 도 `assignSides()` 도 건드리지 않는다.**
 *
 * ── 1라운드를 아는 경기만 채운다
 *   1라운드는 정의상 전반이다. `roundSidesOf` 가 방향을 고르지 못한 경기는 그 자리가
 *   비어 있고, 그런 경기는 **비워 둔다.** `team_no` 순서를 후퇴값으로 쓰지 않는다 —
 *   반례가 실재한다 (D-106).
 *
 * ── 두 클랜의 응답이 어긋나면 비운다
 *   한 경기에 양 팀의 응답이 둘 다 있으면 판정도 둘이다. 서로 다른 답을 내면
 *   다수결하지 않고 그 경기를 통째로 비운다.
 *
 * 멱등이다 — 같은 원문을 다시 돌려도 값이 덮일 뿐 행이 늘지 않는다.
 */
import { prisma } from '@sacloud/db'
import { clanByTeamNo, roundResultsOf, roundSidesOf, type RoundSideEvent } from '@sacloud/nexon'

/** 이 판정이 무엇에 근거했는지 — `Match.firstSideEvidence` 에 남는다 */
const EVIDENCE = 'barracks_bomb'

/** 원문(payload)을 한 번에 몇 줄씩 가져올지. 한 줄이 수 MB 라 크게 잡으면 연결이 끊긴다 */
const PAYLOAD_CHUNK = 200

/** `updateMany` 한 번에 넣을 경기 수. 한 줄씩 update 하면 왕복이 수천 번이 된다 */
const WRITE_CHUNK = 500

/**
 * 연결이 끊기면 다시 시도한다.
 *
 * 로컬 개발 DB 는 다른 잡이 같이 돌면 **실제로 죽었다 살아난다** (실측: `P1017`
 * `Server has closed the connection` · `the database system is not yet accepting
 * connections`). 이 잡은 멱등이므로 다시 붙어 이어서 쓰면 된다.
 * **읽기·쓰기 결과를 바꾸지 않는다** — 재시도일 뿐이다.
 */
async function withRetry<T>(label: string, run: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await run()
    } catch (error) {
      const code = (error as { code?: string }).code
      const recoverable = code === 'P1017' || code === 'P1001' || code === undefined
      if (!recoverable || attempt >= 12) throw error
      console.info(`[재시도 ${attempt}] ${label} — DB 연결이 끊겼다. 10초 후 다시 시도한다`)
      await new Promise((resolve) => setTimeout(resolve, 10_000))
    }
  }
}

interface RawShape {
  battleLog?: RoundSideEvent[]
  teamList?: { team_no?: number | string | null; clan_no?: number | string | null }[]
}

/** 원문은 `{ raw: {...} }` 로 감싸 저장된 것과 그대로 저장된 것이 섞여 있다 */
const rawOf = (payload: unknown): RawShape => {
  if (typeof payload !== 'object' || payload === null) return {}
  const holder = payload as { raw?: unknown }
  const raw = typeof holder.raw === 'object' && holder.raw !== null ? holder.raw : payload
  return raw as RawShape
}

export interface MatchFirstSideBuildResult {
  /** 클랜 단위 배틀로그 원문 줄 수 */
  rows: number
  /** 그중 클랜 번호를 우리 클랜에 못 이은 줄 (`nexon clan-number` 가 잇는다) */
  unlinkedClanNo: number
  /** 그 경기가 우리 `Match` 에 없어 뺀 줄 */
  noMatch: number
  /** 응답의 `teamList` 로 그 클랜의 팀 번호를 못 찾아 뺀 줄 */
  unknownTeamNo: number
  /** 라운드 이벤트를 하나도 못 읽어 뺀 줄 */
  unreadable: number
  /** 근거가 서로 어긋나 아무것도 확정하지 않은 줄 */
  conflict: number
  /** 방향을 못 골라 1라운드 진영을 모르는 줄 */
  noFirstRound: number
  /** 두 클랜의 응답이 서로 다른 답을 내 비운 경기 */
  disagreed: number
  /** 값을 정한 `Match` 행 수 */
  decided: number
  /** 그중 red 슬롯이 전반 공격이었던 경기 / blue 슬롯이었던 경기 */
  redSlotAttacked: number
  blueSlotAttacked: number
  /** 실제로 값이 바뀐 행 수 */
  updated: number
  written: boolean
}

export async function buildMatchFirstSide(input: {
  confirm: boolean
}): Promise<MatchFirstSideBuildResult> {
  const result: MatchFirstSideBuildResult = {
    rows: 0,
    unlinkedClanNo: 0,
    noMatch: 0,
    unknownTeamNo: 0,
    unreadable: 0,
    conflict: 0,
    noFirstRound: 0,
    disagreed: 0,
    decided: 0,
    redSlotAttacked: 0,
    blueSlotAttacked: 0,
    updated: 0,
    written: false,
  }

  /* 원문은 한 줄이 수 MB 다. 한 번에 다 읽으면 힙도 연결도 버티지 못한다
     (실측: 6,989행 일괄 조회에서 `Server has closed the connection`).
     **가벼운 목록을 먼저 읽고 payload 만 나눠 가져온다.** */
  const index = await withRetry('원문 목록', () =>
    prisma.barracksBattleLogRaw.findMany({
      where: { subjectKind: 'clan', status: 'ok' },
      select: { id: true, matchKey: true, subject: true },
    }),
  )
  result.rows = index.length

  /* 클랜번호 → 우리 클랜 (D-200) */
  const clanOfNumber = new Map<string, string>()
  for (const link of await prisma.barracksClanNumber.findMany({
    select: { clanNo: true, clanId: true },
  })) {
    clanOfNumber.set(link.clanNo, link.clanId)
  }

  /* 같은 물리 경기가 리그마다 다른 `Match` 행이다 (D-155) — 전부 채운다 */
  const keys = [...new Set(index.map((row) => row.matchKey))]
  const matches: {
    id: string
    firstHalfAttackSide: string | null
    sourceMatchId: string | null
    redClan: { clanId: string }
    blueClan: { clanId: string }
  }[] = []
  for (let i = 0; i < keys.length; i += 1000) {
    matches.push(
      ...(await withRetry('경기 조회', () =>
        prisma.match.findMany({
          where: { sourceMatchId: { in: keys.slice(i, i + 1000) } },
          select: {
            id: true,
            firstHalfAttackSide: true,
            sourceMatchId: true,
            /* 클랜 **신원**만 읽는다. 부리그·래더는 읽지 않는다 (CLAUDE.md 3-B 4번) */
            redClan: { select: { clanId: true } },
            blueClan: { select: { clanId: true } },
          },
        }),
      )),
    )
  }

  const byKey = new Map<string, typeof matches>()
  for (const match of matches) {
    if (!match.sourceMatchId) continue
    const list = byKey.get(match.sourceMatchId)
    if (list) list.push(match)
    else byKey.set(match.sourceMatchId, [match])
  }

  /* 원문을 읽을 필요가 있는 줄만 남긴다 — 못 이은 클랜번호와 우리 `Match` 에 없는 경기는
     payload 를 가져올 이유가 없다 */
  const todo: { id: string; matchKey: string; subject: string; clanId: string }[] = []
  for (const row of index) {
    const clanId = clanOfNumber.get(row.subject)
    if (clanId === undefined) {
      result.unlinkedClanNo += 1
      continue
    }
    if (!byKey.has(row.matchKey)) {
      result.noMatch += 1
      continue
    }
    todo.push({ ...row, clanId })
  }

  /** `Match.id` → 그 경기에서 나온 판정들. 둘 이상이면 어긋난 것이다 */
  const verdicts = new Map<string, Set<'red' | 'blue'>>()

  for (let i = 0; i < todo.length; i += PAYLOAD_CHUNK) {
    const slice = todo.slice(i, i + PAYLOAD_CHUNK)
    const payloads = new Map(
      (
        await withRetry('원문 조회', () =>
          prisma.barracksBattleLogRaw.findMany({
            where: { id: { in: slice.map((row) => row.id) } },
            select: { id: true, payload: true },
          }),
        )
      ).map((row) => [row.id, row.payload]),
    )

    for (const row of slice) {
      const group = byKey.get(row.matchKey) as typeof matches
      const raw = rawOf(payloads.get(row.id))
      const events = raw.battleLog ?? []
      if (events.length === 0) {
        result.unreadable += 1
        continue
      }

      /* `team_no` 는 클랜 번호가 아니라 팀 자리다 — 응답의 `teamList` 가 짝을 알려 준다 (D-184) */
      const clanByTeam = clanByTeamNo(raw.teamList ?? [])
      const teamNo = [...clanByTeam.entries()].find(([, no]) => no === row.subject)?.[0]
      if (teamNo === undefined) {
        result.unknownTeamNo += 1
        continue
      }

      let totalRounds = 0
      for (const event of events) {
        const round = Number(event.round)
        if (Number.isInteger(round) && round > totalRounds) totalRounds = round
      }
      if (totalRounds === 0) {
        result.unreadable += 1
        continue
      }

      /* 라운드 승패는 **이 응답을 받은 클랜 기준**이다 (D-184). 다른 클랜 응답과 섞지 않는다.
         이 값을 함께 넘기면 전반 종료(5승 규칙 · D-208)가 교대 지점을 좁혀 준다 —
         폭탄만으로는 방향을 못 고르던 경기가 여기서 갈린다 */
      const results = roundResultsOf(events as never)
      const sides = roundSidesOf(events, teamNo, totalRounds, (round) => results.get(round) ?? null)
      if (sides.conflict) {
        result.conflict += 1
        continue
      }
      /* 1라운드는 정의상 전반이다. 방향을 못 고른 경기는 여기가 비어 있다 */
      const firstRound = sides.side.get(1)
      if (firstRound === undefined) {
        result.noFirstRound += 1
        continue
      }

      for (const match of group) {
        /* 이 응답의 주인이 그 경기에서 앉은 **슬롯** */
        let slot: 'red' | 'blue' | null = null
        if (match.redClan.clanId === row.clanId) slot = 'red'
        else if (match.blueClan.clanId === row.clanId) slot = 'blue'
        if (slot === null) continue

        /* 이 클랜이 전반 공격이었으면 그 슬롯이 곧 공격 슬롯, 수비였으면 반대 슬롯이다 */
        const attackSlot: 'red' | 'blue' =
          firstRound === 'attack' ? slot : slot === 'red' ? 'blue' : 'red'
        const seen = verdicts.get(match.id) ?? new Set<'red' | 'blue'>()
        seen.add(attackSlot)
        verdicts.set(match.id, seen)
      }
    }
  }

  const byId = new Map(matches.map((match) => [match.id, match]))
  /** 실제로 쓸 값. 어긋난 경기는 여기 들어오지 않는다 */
  const changed: { red: string[]; blue: string[] } = { red: [], blue: [] }
  for (const [matchId, seen] of verdicts) {
    if (seen.size !== 1) {
      /* 두 클랜의 응답이 서로 다른 답을 냈다. 다수결하지 않는다 (D-106) */
      result.disagreed += 1
      continue
    }
    const side = seen.has('red') ? 'red' : 'blue'
    result.decided += 1
    if (side === 'red') result.redSlotAttacked += 1
    else result.blueSlotAttacked += 1
    /* 이미 같은 값이면 쓰지 않는다 — 멱등이면서 왕복도 줄인다 */
    if (byId.get(matchId)?.firstHalfAttackSide === side) continue
    changed[side].push(matchId)
  }
  result.updated = changed.red.length + changed.blue.length

  if (!input.confirm) return result

  for (const side of ['red', 'blue'] as const) {
    const ids = changed[side]
    for (let i = 0; i < ids.length; i += WRITE_CHUNK) {
      await withRetry('저장', () =>
        prisma.match.updateMany({
          where: { id: { in: ids.slice(i, i + WRITE_CHUNK) } },
          data: { firstHalfAttackSide: side, firstSideEvidence: EVIDENCE },
        }),
      )
    }
  }
  result.written = true
  return result
}

/* --------------------------------------------------------------- 실행 --- */

const isMain = process.argv[1]?.replace(/\\/g, '/').endsWith('matchFirstSideBuild.ts')
if (isMain) {
  const confirm = process.argv.includes('--confirm')
  buildMatchFirstSide({ confirm })
    .then(async (built) => {
      console.info(JSON.stringify(built, null, 2))
      if (!confirm) console.info('\n미리보기다. 저장하려면 --confirm 을 붙인다.')
      await prisma.$disconnect()
    })
    .catch(async (error) => {
      console.error(error)
      await prisma.$disconnect()
      process.exitCode = 1
    })
}
