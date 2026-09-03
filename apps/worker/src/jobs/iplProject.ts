/**
 * IPL 원문 → `Match` **투영** (D-219 후속).
 *
 * ── 왜 필요했나
 *   `iplMatchImport` 는 원문 보존까지만 한다. 그래서 IPL 원문이 147,546 경기나 쌓여 있는데
 *   화면의 IPL 경기는 **0건**이고 클랜랭킹도 비어 있었다. 이 잡이 그 마지막 한 칸을 잇는다.
 *
 * ── 무엇을 만들고 무엇을 안 만드나
 *   ```
 *   만든다     Match (경기 · 양 팀 · 라운드 스코어로 정한 승패)
 *   안 만든다  MatchPlayerStat — 원문에 **참가자가 없다** (칸 44개에 선수 칸 0개)
 *   ```
 *   라인업은 배틀로그가 와야 채워진다. 없는 것을 지어내지 않는다 (`CLAUDE.md` 3장 7번).
 *
 * ── 안전
 *   · `--confirm` 없이는 한 줄도 쓰지 않는다. 기본은 미리보기다
 *   · 멱등하다 — `(origin, sourceMatchId)` 로 upsert 한다. 다시 돌려도 늘지 않는다
 *   · **양쪽이 다 IPL 등록 클랜일 때만** 넣는다. 한쪽만이면 IPL 경기가 아니다 (D-210 의 거울)
 *   · ★적재 창(`IPL_PROJECT_FROM` = 3/5)★ 보다 앞선 경기는 넣지 않는다
 *     ⚠ ★집계 창(`SEASON0_FROM` = 7/1)과 다른 값이다★ (2026-09-04 에 갈랐다).
 *       옛날엔 둘이 같아서 ★4~6월 경기가 통째로 안 들어왔다★ — 배틀로그는 받아 놓고도 화면에 없었다
 *   · 건너뛴 것은 **사유별로 세어 보고한다.** 조용히 버리지 않는다
 */
import { prisma } from '@sacloud/db'
import { log, warn } from '../lib/log.js'
import { allocateInternalMatchId } from '../lib/internalMatchId.js'
import { IPL_PROJECT_FROM, IPL_PROJECT_FROM_V1, SEASON0_FROM } from '../lib/season0Window.js'
import { deriveClanNames, type SideRow } from '../lib/iplClanNames.js'
import { IPL_ROSTER } from '@sacloud/db/ops'
import {
  IPL_LEAGUE_MAP_NAME,
  planProjection,
  type SkipReason,
} from '../lib/iplProject.js'

const IPL_SLUG = 'nolink'
/** 이 잡이 만든 경기를 나중에 가려낼 수 있게 남긴다 */
export const IPL_PROJECT_ORIGIN = 'nexon_barracks'

export interface IplProjectResult {
  uniqueMatches: number
  planned: number
  created: number
  updated: number
  skipped: Record<SkipReason, number>
  /** 이름을 못 이은 클랜 (많이 나온 순) */
  unknownClanNames: Array<{ name: string; count: number }>
}

const emptySkips = (): Record<SkipReason, number> => ({
  other_map: 0,
  bad_time: 0,
  before_season: 0,
  unknown_clan: 0,
  not_ipl_pair: 0,
  draw: 0,
  bad_score: 0,
})

/**
 * IPL 등록 클랜을 **이름으로** 찾을 수 있게 편다.
 *
 * 이름 하나로는 모자란다 — **클랜이 이름을 바꾼다.** 그래서 세 곳에서 이름을 모은다.
 * ```
 * ① 우리 DB 의 `Clan.name`
 * ② `IPL_ROSTER` 의 `name` 과 `given`(옛 표기)
 * ③ 원문에서 **덮기로 뽑은 이름들** — 개명 전 이름이 여기서 나온다
 * ```
 * ③이 없으면 `melody` 1,901건 · `pIacebo` 607건이 통째로 빠진다 (2026-08-31 실측).
 *
 * 같은 이름이 서로 다른 클랜을 가리키면 **둘 다 버린다.** 지어내지 않는다 (3-A 8번).
 */
async function buildClanIndex(leagueId: string) {
  const rows = await prisma.leagueClan.findMany({
    where: { leagueId },
    select: { id: true, division: true, clan: { select: { slug: true, name: true } } },
  })

  type Entry = { leagueClanId: string; division: number }
  const byName = new Map<string, Entry>()
  const conflicts = new Set<string>()

  const put = (name: string | null | undefined, entry: Entry) => {
    const key = name?.trim()
    if (!key) return
    const seen = byName.get(key)
    if (seen && seen.leagueClanId !== entry.leagueClanId) {
      conflicts.add(key)
      return
    }
    byName.set(key, entry)
  }

  /* ① 우리 DB 의 이름 · slug */
  const bySlug = new Map<string, Entry>()
  for (const r of rows) {
    const entry = { leagueClanId: r.id, division: r.division }
    put(r.clan.name, entry)
    bySlug.set(r.clan.slug, entry)
  }

  /* ② 명단의 지금 이름과 옛 표기 — slug 로 이어 붙인다 */
  const rosterBySlug = new Map<string, Entry>()
  for (const entry of IPL_ROSTER) {
    const target =
      bySlug.get(entry.barracks) ?? byName.get(entry.name) ?? byName.get(entry.given) ?? null
    if (!target) continue
    rosterBySlug.set(entry.barracks, target)
    put(entry.name, target)
    put(entry.given, target)
  }

  /* ③ 원문이 말하는 이름들 — 개명 전 이름이 여기서 나온다 */
  const sideRows = await prisma.$queryRaw<SideRow[]>`
    SELECT "subject",
           "payload"->>'red_clan_name'  AS red,
           "payload"->>'blue_clan_name' AS blue
    FROM "BarracksClanMatchRaw"
    WHERE "status" = 'ok'
  `
  const derived = deriveClanNames(sideRows)
  let recovered = 0
  for (const [subject, list] of derived) {
    const target = rosterBySlug.get(subject) ?? bySlug.get(subject)
    if (!target) continue
    for (const d of list) {
      if (!byName.has(d.name)) recovered += 1
      put(d.name, target)
    }
  }

  for (const name of conflicts) byName.delete(name)
  if (conflicts.size) {
    warn(`이름이 겹쳐 못 쓰는 이름 ${conflicts.size}개: ${[...conflicts].slice(0, 10).join(', ')}`)
  }
  log(`클랜 이름 색인 ${byName.size}개 (원문에서 되찾은 개명 ${recovered}개)`)
  return byName
}

export async function runIplProject(
  options: { confirm?: boolean; limit?: number } = {},
): Promise<IplProjectResult> {
  const league = await prisma.league.findUnique({
    where: { slug: IPL_SLUG },
    select: { id: true, name: true },
  })
  if (!league) throw new Error(`리그 ${IPL_SLUG} 이 없다`)

  const map = await prisma.gameMap.findFirst({
    where: { name: IPL_LEAGUE_MAP_NAME },
    select: { id: true },
  })
  if (!map) throw new Error(`맵 "${IPL_LEAGUE_MAP_NAME}" 이 없다. 먼저 만들어야 한다`)

  const clanIndex = await buildClanIndex(league.id)
  log(
    `찾을 수 있는 클랜 이름 ${clanIndex.size}개 · ★적재 창 시작 ${IPL_PROJECT_FROM.toISOString()}★` +
      ` (집계 창은 ${SEASON0_FROM.toISOString()} — 다른 값이다)`,
  )

  /* ★옛 적재 창은 지우지 않는다★ (`CLAUDE.md` 1-4) — 되돌리려면 `seasonFrom` 에 이걸 넣는다 */
  void IPL_PROJECT_FROM_V1

  const result: IplProjectResult = {
    uniqueMatches: 0,
    planned: 0,
    created: 0,
    updated: 0,
    skipped: emptySkips(),
    unknownClanNames: [],
  }
  const unknown = new Map<string, number>()
  const resolveClan = (name: string) => clanIndex.get(name) ?? null

  /* 같은 경기가 양쪽 클랜의 목록에 있으므로 `matchKey` 로 한 줄만 고른다 */
  const BATCH = 500
  let after = ''
  const limit = options.limit ?? Number.POSITIVE_INFINITY

  for (;;) {
    const rows = await prisma.$queryRaw<
      Array<{ matchKey: string; payload: Record<string, unknown> }>
    >`
      SELECT DISTINCT ON ("matchKey") "matchKey", "payload"
      FROM "BarracksClanMatchRaw"
      WHERE "matchKey" > ${after} AND "status" = 'ok'
      ORDER BY "matchKey" ASC, "id" ASC
      LIMIT ${BATCH}
    `
    if (!rows.length) break
    after = rows[rows.length - 1]!.matchKey

    for (const row of rows) {
      if (result.uniqueMatches >= limit) break
      result.uniqueMatches += 1
      const p = row.payload

      const planned = planProjection({
        matchKey: row.matchKey,
        mapName: typeof p.map_name === 'string' ? p.map_name : null,
        redClanName: typeof p.red_clan_name === 'string' ? p.red_clan_name : null,
        blueClanName: typeof p.blue_clan_name === 'string' ? p.blue_clan_name : null,
        redWinCount: p.red_win_cnt,
        blueWinCount: p.blue_win_cnt,
        resolveClan,
        /* ★적재 창은 3/5★ — 집계 창(7/1)과 다르다 (season0Window.ts 의 IPL_PROJECT_FROM) */
        seasonFrom: IPL_PROJECT_FROM,
      })

      if (!planned.ok) {
        result.skipped[planned.reason] += 1
        if (planned.reason === 'unknown_clan' || planned.reason === 'not_ipl_pair') {
          for (const n of [p.red_clan_name, p.blue_clan_name]) {
            if (typeof n === 'string' && n.trim() && !clanIndex.has(n.trim())) {
              unknown.set(n.trim(), (unknown.get(n.trim()) ?? 0) + 1)
            }
          }
        }
        continue
      }

      result.planned += 1
      if (!options.confirm) continue

      const plan = planned.plan
      /* 고유 키가 `[leagueId, origin, sourceMatchId]` 다 — 한 경기가 여러 리그에 기록된다 (D-155) */
      const existing = await prisma.match.findUnique({
        where: {
          leagueId_origin_sourceMatchId: {
            leagueId: league.id,
            origin: IPL_PROJECT_ORIGIN,
            sourceMatchId: plan.matchKey,
          },
        },
        select: { id: true },
      })

      const matchId =
        existing?.id ??
        (await allocateInternalMatchId(plan.startAt, async (candidate) => {
          const found = await prisma.match.findUnique({
            where: { id: candidate },
            select: { id: true },
          })
          return found !== null
        }))

      const data = {
        leagueId: league.id,
        mapId: map.id,
        /* 5대5 다. `plimit` 는 한 팀 정원이라 두 배가 참가 인원이다 */
        playerCount: 10,
        startAt: plan.startAt,
        /* 원문이 주지 않는 것은 전부 null 이다 (D-034 와 같은 원칙) */
        endAt: null,
        playTime: null,
        blueFirst: null,
        winnerSide: plan.winnerSide,
        mvpPlayerId: null,
        redLeagueClanId: plan.red.leagueClanId,
        blueLeagueClanId: plan.blue.leagueClanId,
        redDivisionAtMatch: plan.red.division,
        blueDivisionAtMatch: plan.blue.division,
        origin: IPL_PROJECT_ORIGIN,
        sourceMatchId: plan.matchKey,
      }

      await prisma.match.upsert({
        where: { id: matchId },
        create: { id: matchId, ...data },
        update: data,
      })
      if (existing) result.updated += 1
      else result.created += 1
    }
    if (result.uniqueMatches >= limit) break
  }

  result.unknownClanNames = [...unknown.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15)

  log(
    `IPL 투영 ${options.confirm ? '적재' : '미리보기'} — 고유경기 ${result.uniqueMatches.toLocaleString()} · ` +
      `투영대상 ${result.planned.toLocaleString()} · 신규 ${result.created.toLocaleString()} · 갱신 ${result.updated.toLocaleString()}`,
  )
  log(
    `건너뜀 — 다른맵 ${result.skipped.other_map.toLocaleString()} · ` +
      `시즌창밖 ${result.skipped.before_season.toLocaleString()} · ` +
      `IPL쌍아님 ${result.skipped.not_ipl_pair.toLocaleString()} · ` +
      `클랜모름 ${result.skipped.unknown_clan.toLocaleString()} · ` +
      `무승부 ${result.skipped.draw.toLocaleString()} · ` +
      `시각오류 ${result.skipped.bad_time.toLocaleString()} · ` +
      `점수오류 ${result.skipped.bad_score.toLocaleString()}`,
  )
  if (!options.confirm) log('--confirm 없이는 한 줄도 쓰지 않았다')

  return result
}
