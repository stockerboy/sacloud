/**
 * 배틀로그 전수수집 **대조기** (D-218).
 *
 * ```
 * pnpm --filter @sacloud/worker nexon battlelog-check
 * pnpm --filter @sacloud/worker exec tsx src/dev/battlelogCheck.ts   ← CLI 없이도 돈다
 * ```
 *
 * **"수집 완료" 로그가 아니라 숫자 대조로 판정한다** (`CLAUDE.md` 3-A 6번).
 * 아무것도 쓰지 않는다. 읽기 전용이다.
 *
 * 세는 것:
 * ```
 * 받은 경기 / 안 받은 경기 · 작업목록 대비
 * 좌표가 들어온 라운드 수
 * 빈 응답(경기가 없거나 지워진 것) 수
 * 1티어 17명 · 개인랭킹 30명 각각 몇 경기가 확보됐나   ← 이게 진짜 성과 지표다
 * ```
 *
 * ── ⚠ 판정 기준이 바뀌었다 (2026-08-31 · D-218)
 *   예전에는 `양 팀 다 받음` / `한 팀만 받음` 으로 갈라 셌다. **그 구분 자체가 틀렸다.**
 *   같은 경기를 양쪽 클랜번호로 각각 불러 본 결과 두 응답의 사망사건 집합이
 *   `(라운드, 죽은사람, event_key)` 기준으로 완전히 일치했다 — 등장 인물 10명 전원.
 *   `event_type=kill` 이 상대 팀 사망을, `death` 가 우리 팀 사망을 담기 때문이다.
 *   즉 **한 건만 받아도 그 경기는 완전하다.** `한 팀만 받음 6,367건` 은 결손이 아니었다.
 *   그래서 지금은 `받음 / 안 받음` 두 갈래로만 센다.
 *
 *   옛 두 갈래 숫자는 지우지 않고 `legacy` 에 남겨 둔다 (`CLAUDE.md` 10-4).
 *   **판정에는 쓰지 않는다.**
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { prisma } from '@sacloud/db'
import { ACES, foldNick } from '../lib/aces.js'
import { eventsOf } from './battlelog.js'

const WORKLIST_DIR = join(process.cwd(), '..', '..', 'data', 'barracks', 'battlelog-worklist')

export interface BattleLogCheckResult {
  /** 매치목록이 아는 고유 경기 */
  matchesKnown: number
  /** **받음** — 배틀로그가 있는 경기. 한 건만 있어도 양 팀 10명이 다 들어 있다 (D-218) */
  matchesFetched: number
  /** **안 받음** — 매치목록은 아는데 배틀로그가 없는 경기 */
  matchesMissing: number
  /**
   * ⚠ **옛 구분** (D-218 이전 판). 판정에 쓰지 않는다 — 남겨 두는 것뿐이다 (`CLAUDE.md` 10-4).
   * `twoResponses` 는 양쪽 클랜번호로 두 번 받아 둔 경기, `oneResponse` 는 한 번만 받은 경기.
   * **둘 다 완전한 경기다.** 차이는 응답 행 수뿐이다.
   */
  legacy: { twoResponses: number; oneResponse: number }
  /** 클랜 단위 응답 행 수 */
  clanRows: number
  /** 좌표가 하나라도 있는 라운드 수 (경기×라운드) */
  roundsWithPoints: number
  /** 좌표가 붙은 이벤트 수 */
  points: number
  /** 빈 응답 — 이벤트 0건. 지워졌거나 애초에 없는 경기다 */
  emptyResponses: number
  /** 작업목록이 남긴 짝 (있으면) */
  worklistPairs: number | null
  worklistByPriority: { priority: number; label: string; pairs: number }[]
  /** 성과 지표 */
  aces: { name: string; found: boolean; clan: string | null; matches: number }[]
  top30: { name: string; clan: string | null; matches: number }[]
}

/** 좌표가 붙은 이벤트인가 — `kill_x`/`kill_y` 가 숫자면 그렇다 */
function hasPoint(event: Record<string, unknown>): boolean {
  return Number.isFinite(Number(event.kill_x)) && Number.isFinite(Number(event.kill_y))
}

export async function checkBattleLogs(): Promise<BattleLogCheckResult> {
  /* ── 받은 것 ---------------------------------------------------------- */
  const grouped = await prisma.$queryRawUnsafe<{ cnt: number; matches: number }[]>(`
    select cnt::int as cnt, count(*)::int as matches
    from (
      select "matchKey", count(distinct "subject") as cnt
      from "BarracksBattleLogRaw" where "subjectKind" = 'clan' group by 1
    ) t group by 1 order by 1`)
  /* 응답 행이 하나인지 둘인지는 **완전성과 무관하다** (D-218). 옛 숫자로만 남긴다 */
  const both = grouped.filter((g) => g.cnt >= 2).reduce((s, g) => s + g.matches, 0)
  const one = grouped.filter((g) => g.cnt === 1).reduce((s, g) => s + g.matches, 0)

  const clanRows = await prisma.barracksBattleLogRaw.count({ where: { subjectKind: 'clan' } })
  const known = await prisma.$queryRawUnsafe<{ c: number }[]>(
    `select count(distinct "matchKey")::int as c from "BarracksClanMatchRaw"`,
  )

  /* ── 좌표·라운드 ------------------------------------------------------ */
  /* 원문을 다 펴 보면 무겁다. 커서로 나눠 읽고 숫자만 센다 */
  let cursor: string | undefined
  let points = 0
  let empty = 0
  const roundKeys = new Set<string>()
  for (;;) {
    const page = await prisma.barracksBattleLogRaw.findMany({
      where: { subjectKind: 'clan' },
      select: { id: true, matchKey: true, payload: true },
      orderBy: { id: 'asc' },
      take: 400,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    })
    if (page.length === 0) break
    for (const row of page) {
      const events = eventsOf(row.payload)
      if (events.length === 0) {
        empty += 1
        continue
      }
      for (const raw of events) {
        const event = raw as unknown as Record<string, unknown>
        if (!hasPoint(event)) continue
        points += 1
        roundKeys.add(`${row.matchKey}:${String(event.round ?? '?')}`)
      }
    }
    cursor = page[page.length - 1]!.id
  }

  /* ── 작업목록 대비 ---------------------------------------------------- */
  let worklistPairs: number | null = null
  let worklistByPriority: { priority: number; label: string; pairs: number }[] = []
  const indexFile = join(WORKLIST_DIR, 'index.json')
  if (existsSync(indexFile)) {
    const index = JSON.parse(readFileSync(indexFile, 'utf8')) as {
      totals?: { pairsEmitted?: number }
      byPriority?: { priority: number; label: string; pairs: number }[]
    }
    worklistPairs = index.totals?.pairsEmitted ?? null
    worklistByPriority = index.byPriority ?? []
  } else if (existsSync(WORKLIST_DIR)) {
    /* index 가 없으면 조각을 세어서라도 답한다 */
    worklistPairs = readdirSync(WORKLIST_DIR)
      .filter((f) => /^p\d-\d{3}\.json$/.test(f))
      .reduce((sum, f) => {
        const part = JSON.parse(readFileSync(join(WORKLIST_DIR, f), 'utf8')) as { pairs?: unknown[] }
        return sum + (part.pairs?.length ?? 0)
      }, 0)
  }

  /* ── 성과 지표: 1티어 · 개인랭킹 ------------------------------------- */
  /* 배틀로그가 있는 경기의 **클랜번호** → 우리 클랜 → 그 클랜 선수.
     선수 단위로 정확히 세려면 원문을 다 펴야 해서, 여기서는
     **그 선수의 클랜이 낀 경기 중 배틀로그를 받은 것**으로 센다.
     ⚠ 근사다 — 그 선수가 실제로 뛰었는지는 라운드 집계(`round-build`)가 판정한다 */
  const fetchedByClanNo = await prisma.$queryRawUnsafe<{ subject: string; c: number }[]>(`
    select "subject", count(distinct "matchKey")::int as c
    from "BarracksBattleLogRaw" where "subjectKind" = 'clan' group by 1`)
  const numbers = await prisma.barracksClanNumber.findMany({
    select: { clanNo: true, clanId: true },
  })
  const clanIdOfNo = new Map(numbers.map((n) => [n.clanNo, n.clanId]))
  const matchesByClanId = new Map<string, number>()
  for (const row of fetchedByClanNo) {
    const clanId = clanIdOfNo.get(row.subject)
    if (!clanId) continue
    matchesByClanId.set(clanId, (matchesByClanId.get(clanId) ?? 0) + row.c)
  }

  const players = await prisma.player.findMany({
    select: { id: true, name: true, clan: { select: { id: true, name: true } } },
  })
  const byFold = new Map<string, typeof players>()
  for (const p of players) {
    const key = foldNick(p.name)
    byFold.set(key, [...(byFold.get(key) ?? []), p])
  }

  const aces = ACES.map((ace) => {
    const exact = players.filter((p) => p.name === ace.name)
    const hits = exact.length > 0 ? exact : (byFold.get(foldNick(ace.name)) ?? [])
    const clan = hits.find((h) => h.clan)?.clan ?? null
    return {
      name: ace.name,
      found: hits.length > 0,
      clan: clan?.name ?? null,
      matches: clan ? (matchesByClanId.get(clan.id) ?? 0) : 0,
    }
  })

  const dpl = await prisma.league.findUnique({ where: { slug: 'supply' }, select: { id: true } })
  const top = dpl
    ? await prisma.leaguePlayer.findMany({
        where: { leagueId: dpl.id, placement: false },
        orderBy: { rating: 'desc' },
        take: 30,
        select: { player: { select: { name: true, clan: { select: { id: true, name: true } } } } },
      })
    : []
  const top30 = top.map((t) => ({
    name: t.player.name,
    clan: t.player.clan?.name ?? null,
    matches: t.player.clan ? (matchesByClanId.get(t.player.clan.id) ?? 0) : 0,
  }))

  const matchesKnown = known[0]?.c ?? 0
  const matchesFetched = both + one

  return {
    matchesKnown,
    matchesFetched,
    matchesMissing: Math.max(0, matchesKnown - matchesFetched),
    legacy: { twoResponses: both, oneResponse: one },
    clanRows,
    roundsWithPoints: roundKeys.size,
    points,
    emptyResponses: empty,
    worklistPairs,
    worklistByPriority,
    aces,
    top30,
  }
}
