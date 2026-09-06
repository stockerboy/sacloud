/**
 * ★★시즌7 마감 카드를 만든다★★ (2026-09-06 · Part 5 · 사장님 지시).
 *
 * ```
 * pnpm --filter @sacloud/worker nexon season7-build            # 미리보기 (한 줄도 안 쓴다)
 * pnpm --filter @sacloud/worker nexon season7-build --confirm  # 실제 저장
 * ```
 *
 * ── 무엇인가
 *   시즌1~6 은 ★3rd.supply 가 준 카드 그대로★ 다. 시즌7 은 다르다 —
 *   원본이 시즌7을 아직 「지난 시즌」으로 닫아 주지 않아서
 *   (`/leagueplayers/{id}/seasons` 가 표본 5명 전부 4·5·6 만 줬다),
 *   ★우리가 보유한 3rd.supply 경기·참가기록을 기간 고정 후 직접 집계★ 한다.
 *
 * ── ★창★ (사장님이 정하신 값. 여기 한 번만 적는다)
 *   ```
 *   2024-04-01 00:00 KST  ~  2026-09-03 07:00 KST 직전
 *   origin = '3rd.supply' · 리그 = supply(서플라이공식리그)
 *   ```
 *   ⚠ 다른 리그(sanply · daerule · nolink)는 ★한 줄도 섞지 않는다.★
 *   ⚠ 9/3 07:00 이후는 ★한 줄도 넣지 않는다★ — 원본은 9/4 까지 더 쌓았고
 *     원본 프로필의 「지금 누적값」에는 그게 섞여 있다. ★그래서 그 값을 쓰지 않는다.★
 *
 * ── ★최종 순위는 저장하지 않는다★ (사장님 결정)
 *   그 기간의 ★개인 래더 값이 한 줄도 없다★ (ratingBefore/Update/After 전부 0줄 · 표본 3만 줄).
 *   승률순·승수순·KD순·자체 래더를 「최종 순위」라고 적으면 ★사실이 아니게 된다.★
 *   그래서 `rank` · `rankCount` · `rating` 은 ★null 로 둔다.★ 화면은 그 줄을 그리지 않는다.
 *
 * ── 안전
 *   · `--confirm` 없이는 ★한 줄도 쓰지 않는다★
 *   · 멱등하다 — `(leaguePlayerId, seasonId)` 로 upsert 한다
 *   · ★시즌1~6 카드는 건드리지 않는다★ (seasonId 가 다르다)
 *   · ★LeaguePlayer 를 새로 만들지 않는다★ — 없는 선수는 «없는 것» 으로 센다
 */
import { prisma } from '@sacloud/db'
import { rootSeasonNumber } from '@sacloud/contract'
import { log, warn } from '../lib/log.js'

/** 원본 시즌 번호. 내부 번호는 `-107` 이 된다 */
export const SEASON7_SOURCE_NUMBER = 7
export const SEASON7_INTERNAL_NUMBER = rootSeasonNumber(SEASON7_SOURCE_NUMBER)
/** 시즌7 창의 시작 — 사장님이 정하신 2024-04-01 KST */
export const SEASON7_FROM = new Date('2024-04-01T00:00:00+09:00')
/** 시즌7 창의 끝(미포함) = Cloud 0 의 시작. ★미러 동결 시각과 같은 점★ */
export const SEASON7_TO = new Date('2026-09-03T07:00:00+09:00')
/** 이 카드가 어디서 나왔는지 — ★원본 카드가 아님을 남긴다★ */
export const SEASON7_SOURCE =
  'sacloud-computed:3rd.supply/supply/2024-04-01..2026-09-03T07:00+09:00'
export const SEASON7_LEAGUE_SLUG = 'supply'

export interface Season7Row {
  playerId: string
  games: number
  win: number
  lose: number
  kill: number
  death: number
  assist: number
  headshot: number
  mvpCount: number
  dropoutCount: number
  rifleGames: number
  rifleKill: number
  rifleDeath: number
  sniperGames: number
  sniperKill: number
  sniperDeath: number
}

export interface Season7Result {
  /** 집계에 나온 선수 */
  players: number
  /** supply LeaguePlayer 가 있어 카드를 붙일 수 있는 선수 */
  attachable: number
  /** ★붙일 자리가 없는 선수★ — 만들지 않는다 */
  orphan: number
  created: number
  updated: number
  written: boolean
  seasonId: string | null
}

/** ★백분율은 원본과 같은 자리수(소수 첫째)로 만든다★ — 없는 값은 null 이다 */
const rate = (a: number, b: number): number | null =>
  a + b === 0 ? null : Math.round((a / (a + b)) * 1000) / 10

export async function runSeason7Build(
  options: { confirm?: boolean; limit?: number } = {},
): Promise<Season7Result> {
  const league = await prisma.league.findUnique({
    where: { slug: SEASON7_LEAGUE_SLUG },
    select: { id: true },
  })
  if (!league) throw new Error(`리그 ${SEASON7_LEAGUE_SLUG} 이 없다`)

  /* ── 시즌 행. 없으면 만든다 (--confirm 일 때만) ─────────────────────── */
  let season = await prisma.season.findFirst({
    where: { leagueId: league.id, number: SEASON7_INTERNAL_NUMBER },
    select: { id: true },
  })
  if (!season && options.confirm) {
    season = await prisma.season.create({
      data: {
        leagueId: league.id,
        number: SEASON7_INTERNAL_NUMBER,
        /* 시즌1~6 과 같은 종류다 — 지난 기록이고 재계산 대상이 아니다 */
        seasonType: 'legacy',
        status: 'closed',
        startedAt: SEASON7_FROM,
        endedAt: SEASON7_TO,
        imported: true,
        frozen: true,
      },
      select: { id: true },
    })
    log(`시즌7 행을 만들었다 — 내부번호 ${SEASON7_INTERNAL_NUMBER} · ${season.id}`)
  }

  /* ── 집계 ────────────────────────────────────────────────────────────── */
  const rows = await prisma.$queryRaw<Season7Row[]>`
    SELECT ps."playerId"                                                   AS "playerId",
           COUNT(*)::int                                                   AS games,
           COUNT(*) FILTER (WHERE ps.side = m."winnerSide")::int           AS win,
           COUNT(*) FILTER (WHERE ps.side <> m."winnerSide")::int          AS lose,
           COALESCE(SUM(ps.kill),0)::int                                   AS kill,
           COALESCE(SUM(ps.death),0)::int                                  AS death,
           COALESCE(SUM(ps.assist),0)::int                                 AS assist,
           COALESCE(SUM(ps.headshot),0)::int                               AS headshot,
           COUNT(*) FILTER (WHERE ps.mvp)::int                             AS "mvpCount",
           COUNT(*) FILTER (WHERE ps.dropout)::int                         AS "dropoutCount",
           COUNT(*) FILTER (WHERE ps.weapon = 0)::int                      AS "rifleGames",
           COALESCE(SUM(ps.kill)  FILTER (WHERE ps.weapon = 0),0)::int     AS "rifleKill",
           COALESCE(SUM(ps.death) FILTER (WHERE ps.weapon = 0),0)::int     AS "rifleDeath",
           COUNT(*) FILTER (WHERE ps.weapon = 1)::int                      AS "sniperGames",
           COALESCE(SUM(ps.kill)  FILTER (WHERE ps.weapon = 1),0)::int     AS "sniperKill",
           COALESCE(SUM(ps.death) FILTER (WHERE ps.weapon = 1),0)::int     AS "sniperDeath"
      FROM "MatchPlayerStat" ps
      JOIN "Match" m ON m.id = ps."matchId"
     WHERE m.origin = '3rd.supply'
       AND m."leagueId" = ${league.id}
       AND m."startAt" >= ${SEASON7_FROM}
       AND m."startAt" <  ${SEASON7_TO}
       AND m."supersededAt" IS NULL
     GROUP BY 1`

  /* ── 카드를 붙일 자리 ────────────────────────────────────────────────── */
  const lpOf = new Map(
    (
      await prisma.leaguePlayer.findMany({
        where: { leagueId: league.id },
        select: { id: true, playerId: true },
      })
    ).map((lp) => [lp.playerId, lp.id]),
  )

  const result: Season7Result = {
    players: rows.length,
    attachable: 0,
    orphan: 0,
    created: 0,
    updated: 0,
    written: options.confirm === true,
    seasonId: season?.id ?? null,
  }

  const targets = options.limit && options.limit > 0 ? rows.slice(0, options.limit) : rows
  const fetchedAt = new Date()

  /*
   * ★이미 있는 카드를 한 번에 읽어 둔다★ (2026-09-06).
   *
   * ⚠ 처음엔 행마다 `findUnique` 로 물었다 — ★1만 명이면 왕복이 2만 번★ 이라
   *   중간에 끊겼다. 신규/갱신을 가르는 셈 하나 때문에 그럴 이유가 없다.
   */
  const already = new Set<string>(
    season
      ? (
          await prisma.leaguePlayerSeason.findMany({
            where: { seasonId: season.id },
            select: { leaguePlayerId: true },
          })
        ).map((r) => r.leaguePlayerId)
      : [],
  )

  for (const r of targets) {
    const leaguePlayerId = lpOf.get(r.playerId)
    if (!leaguePlayerId) {
      /* ★만들지 않는다★ — 사장님: «임의로 LeaguePlayer 를 만들거나 합치지 않는다» */
      result.orphan += 1
      continue
    }
    result.attachable += 1
    if (!options.confirm || !season) continue

    const data = {
      season: SEASON7_SOURCE_NUMBER,
      /* ★순위는 넣지 않는다★ — 그 기간의 원본 rating/rank 가 없다 */
      rank: null,
      rankCount: null,
      rating: null,
      win: r.win,
      lose: r.lose,
      kill: r.kill,
      death: r.death,
      assist: r.assist,
      headshot: r.headshot,
      winRate: rate(r.win, r.lose),
      kdRate: rate(r.kill, r.death),
      killPerMatch: r.games === 0 ? null : Math.round((r.kill / r.games) * 100) / 100,
      mvpCount: r.mvpCount,
      games: r.games,
      dropoutCount: r.dropoutCount,
      rifleGames: r.rifleGames,
      rifleKill: r.rifleKill,
      rifleDeath: r.rifleDeath,
      sniperGames: r.sniperGames,
      sniperKill: r.sniperKill,
      sniperDeath: r.sniperDeath,
      source: SEASON7_SOURCE,
      sourceLeagueSlug: SEASON7_LEAGUE_SLUG,
      sourceFetchedAt: fetchedAt,
      /* ★원본이 준 카드가 아니다★ — 그래서 imported 는 false 다 */
      imported: false,
    }
    const before = already.has(leaguePlayerId)
    await prisma.leaguePlayerSeason.upsert({
      where: { leaguePlayerId_seasonId: { leaguePlayerId, seasonId: season.id } },
      create: { leaguePlayerId, seasonId: season.id, ...data },
      update: data,
    })
    if (before) result.updated += 1
    else result.created += 1
  }

  if (result.orphan > 0) {
    warn(
      `★카드를 못 붙인 선수 ${result.orphan}명★ — supply LeaguePlayer 행이 없다. ` +
        `★만들지 않았다★ (사장님 지시)`,
    )
  }
  log(
    `시즌7 ${options.confirm ? '적재' : '미리보기'} — 집계 선수 ${result.players.toLocaleString()} · ` +
      `붙일 수 있음 ${result.attachable.toLocaleString()} · ★붙일 자리 없음 ${result.orphan}★ · ` +
      `신규 ${result.created.toLocaleString()} · 갱신 ${result.updated.toLocaleString()}`,
  )
  if (!options.confirm) log('--confirm 없이는 한 줄도 쓰지 않았다')
  return result
}
