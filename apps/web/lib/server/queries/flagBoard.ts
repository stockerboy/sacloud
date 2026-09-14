/**
 * ★깃발판★ — 그날(17:00~03:00) 1·2·3등을 세고, 꽂힌 깃발을 읽는다 (2026-09-15 사장님).
 *
 * > «17시부터 03시까지의 1,2,3등을 라이브로 보여주고 3시에 마감치는거야.»
 * > «막 경쟁해서 새벽 3시에 1등인 사람이 깃발 꽂고
 * >  그 깃발을 개인기록에 깃발 5개 이런식으로 표시해주면 좋겠어»
 *
 * ── 두 가지를 한다
 *   ```
 *   라이브 (17:00~03:00)   그날 뛴 것으로 ★지금 세서★ 보여 준다
 *   마감 뒤 (03:00~17:00)   ★박아 둔 깃발(`LeagueFlag`)★ 을 그대로 읽는다
 *   ```
 *   마감 뒤에 다시 세지 않는다 — 집계가 늦게 바뀌면 «어제 1등» 이 뒤바뀐다.
 *   깃발은 ★그 순간의 기록★ 이다.
 *
 * ── 셈은 계약이 한다
 *   줄 세우는 식은 `@sacloud/contract` 의 `rankFlagDay` 한 곳이다.
 *   ★마감 잡(worker)도 같은 함수를 쓴다★ — 다르면 라이브 1등이 깃발을 못 받는다.
 *   여기서는 ★재료만★ 모은다.
 */
import { prisma } from '@sacloud/db'
import {
  FLAG_PODIUM_SIZE,
  flagDayIsLive,
  flagDayOf,
  rankFlagDay,
  type FlagAxisKey,
  type FlagDay,
  type FlagDayTally,
} from '@sacloud/contract'

/** 화면이 받는 한 줄 */
export interface FlagBoardRow {
  rank: number
  player_id: string
  name: string
  clan: { slug: string; name: string; mark: { bg: string | null; front: string | null } } | null
  score: number
  games: number
  win: number
  lose: number
  win_rate: number
  /** 킬 ÷ (킬+데스) · % — 잴 수 없으면 null */
  kd_rate: number | null
  /** 그날 육각 — 백분위 (그날 뛴 사람들 안에서) */
  axes: { key: FlagAxisKey; value: number | null; pct: number | null }[]
  /** 지금까지 받은 깃발 수 (1등만 센다) */
  flags: number
}

export interface FlagBoard {
  league: string
  /** 마감일 `YYYY-MM-DD` (KST) */
  day_key: string
  opens_at: string
  closes_at: string
  /** 아직 경쟁 중인가 */
  live: boolean
  rows: FlagBoardRow[]
}

/** `MatchPlayerHex` + `MatchPlayerStat` 을 그날 창으로 접은 한 줄 */
interface DayRow {
  playerId: string
  name: string
  clanSlug: string | null
  clanName: string | null
  markBg: string | null
  markFront: string | null
  games: number
  win: number
  kill: number
  death: number
  sniperGames: number
  rifleGames: number
  rounds: number
  firstKills: number
  burstRounds: number
  aloneRounds: number
  aloneWon: number
  outRounds: number
  outWon: number
  sniperDuelWon: number
  sniperDuelLost: number
  rifleDuelWon: number
  rifleDuelLost: number
}

/**
 * ★주무기★ — 그날 더 많이 쓴 쪽.
 *
 * 시즌 판정(`mainWeaponOf`)은 10판을 요구하는데 하루에 10판은 드물다.
 * 그래서 ★더 많이 쓴 쪽★ 으로 정하고, 같으면 못 정한 것으로 둔다 (`null`).
 */
function dayWeaponOf(r: DayRow): 0 | 1 | null {
  if (r.sniperGames > r.rifleGames) return 1
  if (r.rifleGames > r.sniperGames) return 0
  return null
}

/**
 * 그 리그의 ★그날 재료★ 를 모은다.
 *
 * `MatchPlayerHex` 가 경기 × 선수로 남아 있어서, 창만 잘라 더하면 하루치가 된다.
 * ★시즌 표(`LeaguePlayerHex`)를 쓰지 않는다★ — 그건 누적이라
 * «오늘 잘한 사람» 이 아니라 «원래 잘하는 사람» 이 나온다 (사장님이 짚어 주신 자리).
 */
async function dayRowsOf(leagueId: string, day: FlagDay): Promise<DayRow[]> {
  return (await prisma.$queryRawUnsafe(
    `SELECT s."playerId",
            pl.name,
            c.slug AS "clanSlug", c.name AS "clanName",
            c."markBgUrl" AS "markBg", c."markFrontUrl" AS "markFront",
            COUNT(DISTINCT s."matchId")::int AS games,
            SUM(CASE WHEN m."winnerSide" = s.side THEN 1 ELSE 0 END)::int AS win,
            SUM(COALESCE(s.kill, 0))::int AS kill,
            SUM(COALESCE(s.death, 0))::int AS death,
            SUM(CASE WHEN s.weapon = 1 THEN 1 ELSE 0 END)::int AS "sniperGames",
            SUM(CASE WHEN s.weapon = 0 THEN 1 ELSE 0 END)::int AS "rifleGames",
            COALESCE(SUM(h.rounds), 0)::int       AS rounds,
            COALESCE(SUM(h."firstKills"), 0)::int  AS "firstKills",
            COALESCE(SUM(h."burstRounds"), 0)::int AS "burstRounds",
            COALESCE(SUM(h."aloneRounds"), 0)::int AS "aloneRounds",
            COALESCE(SUM(h."aloneWon"), 0)::int    AS "aloneWon",
            COALESCE(SUM(h."outRounds"), 0)::int   AS "outRounds",
            COALESCE(SUM(h."outWon"), 0)::int      AS "outWon",
            COALESCE(SUM(CASE WHEN h.weapon = 1 THEN h."duelWon"  ELSE 0 END), 0)::int AS "sniperDuelWon",
            COALESCE(SUM(CASE WHEN h.weapon = 1 THEN h."duelLost" ELSE 0 END), 0)::int AS "sniperDuelLost",
            COALESCE(SUM(CASE WHEN h.weapon = 0 THEN h."duelWon"  ELSE 0 END), 0)::int AS "rifleDuelWon",
            COALESCE(SUM(CASE WHEN h.weapon = 0 THEN h."duelLost" ELSE 0 END), 0)::int AS "rifleDuelLost"
       FROM "MatchPlayerStat" s
       JOIN "Match" m ON m.id = s."matchId"
       JOIN "Player" pl ON pl.id = s."playerId"
       LEFT JOIN "LeaguePlayer" lp ON lp."playerId" = s."playerId" AND lp."leagueId" = $1
       LEFT JOIN "Clan" c ON c.id = lp."clanId"
       LEFT JOIN "MatchPlayerHex" h ON h."matchId" = s."matchId" AND h."playerId" = s."playerId"
      WHERE m."leagueId" = $1
        AND m."supersededAt" IS NULL
        AND m."startAt" >= $2 AND m."startAt" < $3
      GROUP BY s."playerId", pl.name, c.slug, c.name, c."markBgUrl", c."markFrontUrl"`,
    leagueId,
    day.opensAt,
    day.closesAt,
  )) as DayRow[]
}

const tallyOf = (r: DayRow): FlagDayTally => ({
  games: Number(r.games),
  win: Number(r.win),
  lose: Number(r.games) - Number(r.win),
  kill: Number(r.kill),
  death: Number(r.death),
  rounds: Number(r.rounds),
  firstKills: Number(r.firstKills),
  burstRounds: Number(r.burstRounds),
  aloneRounds: Number(r.aloneRounds),
  aloneWon: Number(r.aloneWon),
  outRounds: Number(r.outRounds),
  outWon: Number(r.outWon),
  sniperDuelWon: Number(r.sniperDuelWon),
  sniperDuelLost: Number(r.sniperDuelLost),
  rifleDuelWon: Number(r.rifleDuelWon),
  rifleDuelLost: Number(r.rifleDuelLost),
  weapon: dayWeaponOf(r),
})

/** 선수별 ★지금까지 받은 깃발 수★ (1등만 센다) */
async function flagCountsOf(playerIds: readonly string[]): Promise<Map<string, number>> {
  if (playerIds.length === 0) return new Map()
  const rows = await prisma.leagueFlag.groupBy({
    by: ['playerId'],
    where: { playerId: { in: [...playerIds] }, rank: 1 },
    _count: { _all: true },
  })
  return new Map(rows.map((r) => [r.playerId, r._count._all]))
}

const clanOf = (r: { clanSlug: string | null; clanName: string | null; markBg: string | null; markFront: string | null }) =>
  r.clanSlug === null || r.clanName === null
    ? null
    : { slug: r.clanSlug, name: r.clanName, mark: { bg: r.markBg, front: r.markFront } }

/**
 * ★지금 이 리그의 깃발판★.
 *
 * 열려 있으면 그날 재료로 세고, 닫혀 있으면 박아 둔 깃발을 읽는다.
 * 리그를 못 찾으면 `null` — 지어내지 않는다.
 */
export async function getFlagBoard(leagueSlug: string, now: Date = new Date()): Promise<FlagBoard | null> {
  const league = await prisma.league.findFirst({ where: { slug: leagueSlug }, select: { id: true } })
  if (league === null) return null

  const day = flagDayOf(now)
  const live = flagDayIsLive(now)

  const base = {
    league: leagueSlug,
    day_key: day.key,
    opens_at: day.opensAt.toISOString(),
    closes_at: day.closesAt.toISOString(),
    live,
  }

  if (!live) {
    /* ★박아 둔 깃발을 그대로★ — 다시 세지 않는다 */
    const planted = await prisma.leagueFlag.findMany({
      where: { leagueId: league.id, dayKey: day.key },
      orderBy: { rank: 'asc' },
      select: {
        rank: true,
        playerId: true,
        score: true,
        games: true,
        win: true,
        lose: true,
        winRate: true,
        kdRate: true,
        player: { select: { name: true } },
        clan: { select: { slug: true, name: true, markBgUrl: true, markFrontUrl: true } },
      },
    })
    if (planted.length > 0) {
      const counts = await flagCountsOf(planted.map((p) => p.playerId))
      return {
        ...base,
        rows: planted.map((p) => ({
          rank: p.rank,
          player_id: p.playerId,
          name: p.player.name,
          clan:
            p.clan === null
              ? null
              : { slug: p.clan.slug, name: p.clan.name, mark: { bg: p.clan.markBgUrl, front: p.clan.markFrontUrl } },
          score: p.score,
          games: p.games,
          win: p.win,
          lose: p.lose,
          win_rate: p.winRate ?? 0,
          kd_rate: p.kdRate,
          /* 저장된 육각은 아직 없다 — 화면은 이 줄에서 육각을 안 그린다 */
          axes: [],
          flags: counts.get(p.playerId) ?? 0,
        })),
      }
    }
    /* 깃발이 아직 안 박혔다 (잡이 늦거나 그날 아무도 문턱을 못 넘었다) →
       ★그때까지의 기록으로 세어서 보여 준다.★ 빈 화면보다는 낫다 */
  }

  const rows = await dayRowsOf(league.id, day)
  const ranked = rankFlagDay(
    rows.map((r) => ({ ref: r, tally: tallyOf(r) })),
    FLAG_PODIUM_SIZE,
  )
  const counts = await flagCountsOf(ranked.map((r) => r.ref.playerId))
  return {
    ...base,
    rows: ranked.map((r) => ({
      rank: r.rank,
      player_id: r.ref.playerId,
      name: r.ref.name,
      clan: clanOf(r.ref),
      score: Math.round(r.score * 10) / 10,
      games: r.games,
      win: r.win,
      lose: r.lose,
      win_rate: r.winRate,
      kd_rate: r.kdRate,
      axes: r.axes,
      flags: counts.get(r.ref.playerId) ?? 0,
    })),
  }
}

/** 한 선수가 받은 깃발 수 — 선수 화면의 «🚩 5개» */
export async function getPlayerFlagCount(playerId: string): Promise<number> {
  return prisma.leagueFlag.count({ where: { playerId, rank: 1 } })
}
