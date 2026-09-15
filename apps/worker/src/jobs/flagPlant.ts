/**
 * ★깃발 꽂기★ — 하루(17:00~03:00)가 끝나면 1·2·3등을 박는다 (2026-09-15 사장님).
 *
 * > «17시부터 03시까지의 1,2,3등을 라이브로 보여주고 3시에 마감치는거야.»
 * > «막 경쟁해서 새벽 3시에 1등인 사람이 깃발 꽂고
 * >  그 깃발을 개인기록에 깃발 5개 이런식으로 표시해주면 좋겠어»
 *
 * ```
 * pnpm --filter @sacloud/worker nexon flag-plant                  미리보기
 * pnpm --filter @sacloud/worker nexon flag-plant --confirm        실제로 꽂는다
 * pnpm --filter @sacloud/worker nexon flag-plant --day 2026-09-15 지난 날을 다시
 * pnpm --filter @sacloud/worker nexon flag-plant --league nolink  한 리그만
 * ```
 *
 * ── ★몇 번을 돌려도 깃발은 하나다★
 *   `(리그, 마감일, 등수)` 가 표의 자물쇠라 다시 돌리면 ★덮어쓴다.★
 *   예약이 겹쳐 두 번 돌아도, 손으로 다시 돌려도 줄이 늘지 않는다.
 *
 * ── ★아직 안 끝난 하루는 안 꽂는다★
 *   03:00 전에 꽂으면 그 뒤 경기가 반영이 안 된다. `--day` 로 지난 날을 지목하거나
 *   마감 뒤에 돌려야 한다. (`--force` 로 억지로 꽂을 수는 있다 — 시험용이다)
 *
 * ── 셈은 계약이 한다
 *   `rankFlagDay` 한 곳이다. ★화면(라이브)도 같은 함수를 쓴다★ —
 *   다르면 «라이브에서 1등이던 사람» 이 깃발을 못 받는다.
 */
import { prisma } from '@sacloud/db'
import {
  FLAG_PODIUM_SIZE,
  flagDayFromKey,
  flagDayOf,
  rankFlagDay,
  type FlagDay,
  type FlagDayTally,
} from '@sacloud/contract'

export interface FlagPlantResult {
  day: string
  /** 언제 열리고 닫혔나 (ISO) */
  opensAt: string
  closesAt: string
  /** 아직 안 끝난 하루를 건드렸나 */
  stillLive: boolean
  written: boolean
  leagues: {
    league: string
    /** 그날 뛴 선수 수 */
    players: number
    /** 문턱을 넘어 줄에 선 사람 수 (최대 3) */
    planted: { rank: number; name: string; score: number; games: number; win: number; lose: number }[]
    /** 아무도 문턱을 못 넘었나 */
    empty: boolean
  }[]
}

interface DayRow {
  playerId: string
  name: string
  clanId: string | null
  games: number
  win: number
  kill: number
  death: number
  sniperGames: number
  rifleGames: number
  rounds: number
  firstKills: number
  burstRounds: number
  maxRoundKills: number
  maxRoundTimes: number
  evenKills: number
  tradeKills: number
  mateDeaths: number
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
 * ★주무기★ — 그날 더 많이 쓴 쪽. 같으면 못 정한 것으로 둔다.
 * ⚠ 화면 쪽(`apps/web/lib/server/queries/flagBoard.ts`)의 `dayWeaponOf` 와 같은 규칙이다.
 */
function dayWeaponOf(r: DayRow): 0 | 1 | null {
  if (Number(r.sniperGames) > Number(r.rifleGames)) return 1
  if (Number(r.rifleGames) > Number(r.sniperGames)) return 0
  return null
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
  maxRoundKills: Number(r.maxRoundKills ?? 0),
  maxRoundTimes: Number(r.maxRoundTimes ?? 0),
  evenKills: Number(r.evenKills ?? 0),
  tradeKills: Number(r.tradeKills ?? 0),
  mateDeaths: Number(r.mateDeaths ?? 0),
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

/**
 * 그 리그의 그날 재료.
 * ⚠ 화면 쪽 `dayRowsOf` 와 ★같은 질의★ 다 — 한쪽만 고치면 두 화면이 갈린다.
 */
async function dayRowsOf(leagueId: string, day: FlagDay): Promise<DayRow[]> {
  return (await prisma.$queryRawUnsafe(
    `SELECT s."playerId",
            pl.name,
            lp."clanId" AS "clanId",
            COUNT(DISTINCT s."matchId")::int AS games,
            SUM(CASE WHEN m."winnerSide" = s.side THEN 1 ELSE 0 END)::int AS win,
            SUM(COALESCE(s.kill, 0))::int AS kill,
            SUM(COALESCE(s.death, 0))::int AS death,
            SUM(CASE WHEN s.weapon = 1 THEN 1 ELSE 0 END)::int AS "sniperGames",
            SUM(CASE WHEN s.weapon = 0 THEN 1 ELSE 0 END)::int AS "rifleGames",
            COALESCE(SUM(h.rounds), 0)::int        AS rounds,
            COALESCE(SUM(h."firstKills"), 0)::int  AS "firstKills",
            COALESCE(SUM(h."burstRounds"), 0)::int AS "burstRounds",
            /* ★캐리력은 «한 라운드 최대 킬»★ — 더하지 않는다.
               배열 대소는 앞 칸부터 보므로 [2] 는 그 최고를 세운 경기의 횟수다 (2026-09-15) */
            COALESCE(SUM(h."evenKills"), 0)::int AS "evenKills",
            COALESCE(SUM(h."tradeKills"), 0)::int AS "tradeKills",
            COALESCE(SUM(h."mateDeaths"), 0)::int AS "mateDeaths",
            COALESCE(MAX(h."maxRoundKills"), 0)::int AS "maxRoundKills",
            COALESCE((MAX(ARRAY[h."maxRoundKills", h."maxRoundTimes"]))[2], 0)::int AS "maxRoundTimes",
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
       LEFT JOIN "MatchPlayerHex" h ON h."matchId" = s."matchId" AND h."playerId" = s."playerId"
      WHERE m."leagueId" = $1
        AND m."supersededAt" IS NULL
        AND m."startAt" >= $2 AND m."startAt" < $3
      GROUP BY s."playerId", pl.name, lp."clanId"`,
    leagueId,
    day.opensAt,
    day.closesAt,
  )) as DayRow[]
}

export async function plantFlags(input: {
  confirm?: boolean
  /** `YYYY-MM-DD` (마감일). 없으면 지금이 속한 하루 */
  dayKey?: string | null
  leagueSlug?: string | null
  /** 아직 안 끝난 하루에도 꽂는다 — ★시험용★ */
  force?: boolean
  now?: Date
}): Promise<FlagPlantResult> {
  const now = input.now ?? new Date()
  const day = input.dayKey ? flagDayFromKey(input.dayKey) : flagDayOf(now)
  if (day === null) throw new Error(`날짜를 못 읽었다: ${input.dayKey}`)

  const stillLive = now.getTime() < day.closesAt.getTime()
  const result: FlagPlantResult = {
    day: day.key,
    opensAt: day.opensAt.toISOString(),
    closesAt: day.closesAt.toISOString(),
    stillLive,
    written: false,
    leagues: [],
  }
  /* ★아직 안 끝난 하루는 안 꽂는다★ — 그 뒤 경기가 빠진 채로 굳는다 */
  if (stillLive && input.force !== true) return result

  const leagues = await prisma.league.findMany({
    where: {
      ...(input.leagueSlug ? { slug: input.leagueSlug } : { slug: { in: ['nolink', 'supply', 'sanply'] } }),
    },
    select: { id: true, slug: true },
    orderBy: { slug: 'asc' },
  })

  for (const league of leagues) {
    /* ★차례로★ 부른다 — 연결이 하나뿐이라 한꺼번에 던지면 전부 멈춘다 */
    const rows = await dayRowsOf(league.id, day)
    const ranked = rankFlagDay(
      rows.map((r) => ({ ref: r, tally: tallyOf(r) })),
      FLAG_PODIUM_SIZE,
    )
    result.leagues.push({
      league: league.slug,
      players: rows.length,
      planted: ranked.map((r) => ({
        rank: r.rank,
        name: r.ref.name,
        score: Math.round(r.score * 10) / 10,
        games: r.games,
        win: r.win,
        lose: r.lose,
      })),
      empty: ranked.length === 0,
    })
    if (input.confirm !== true) continue

    for (const r of ranked) {
      const data = {
        playerId: r.ref.playerId,
        clanId: r.ref.clanId,
        score: r.score,
        games: r.games,
        win: r.win,
        lose: r.lose,
        kdRate: r.kdRate,
        winRate: r.winRate,
        plantedAt: now,
      }
      await prisma.leagueFlag.upsert({
        where: { leagueId_dayKey_rank: { leagueId: league.id, dayKey: day.key, rank: r.rank } },
        update: data,
        create: { leagueId: league.id, dayKey: day.key, rank: r.rank, ...data },
      })
    }
    /*
     * ★줄 수가 줄면 남은 꼬리를 지운다★ — 어제는 셋이었는데 오늘 둘뿐이면
     * 어제의 3등이 남아 «오늘의 3등» 인 척한다. 다시 돌릴 때도 같은 일이 생긴다.
     */
    await prisma.leagueFlag.deleteMany({
      where: { leagueId: league.id, dayKey: day.key, rank: { gt: ranked.length } },
    })
  }

  result.written = input.confirm === true
  return result
}
