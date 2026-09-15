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
  axes: {
    key: FlagAxisKey
    value: number | null
    pct: number | null
    /** ★그날 안에서의 등수★ — 축 밑에 «n위» 로 적는다 (2026-09-15 사장님) */
    rank: number | null
    total: number | null
  }[]
  /** 지금까지 받은 깃발 수 (1등만 센다) */
  flags: number
}

/** 능선 한 점 — «그 시각까지의 1등 점수» */
export interface FlagTimelinePoint {
  /** 0부터. `FLAG_SLOT_MINUTES` 칸 번호 */
  slot: number
  /** 0~100. 아직 아무도 문턱을 못 넘었으면 null */
  score: number | null
  /** 그 시각의 1등 (없으면 null) */
  player_id: string | null
}

export interface FlagBoard {
  league: string
  /** 마감일 `YYYY-MM-DD` (KST) */
  day_key: string
  opens_at: string
  closes_at: string
  /** 아직 경쟁 중인가 */
  live: boolean
  /** 한 칸이 몇 분인가 */
  slot_minutes: number
  /** ★능선★ — 시각마다 «그때까지의 1등 점수» */
  timeline: FlagTimelinePoint[]
  rows: FlagBoardRow[]
}

/**
 * ★능선을 그리는 칸★ — 하루(10시간)를 30분씩 스무 칸으로 나눈다 (2026-09-15).
 *
 * 파노라처럼 ★시간이 흐르며 점수가 오르내리는 선★ 을 그리려면 시각별 값이 있어야 한다.
 * 칸을 잘게 하면 질의가 무거워지고 굵게 하면 선이 각진다 — 30분이 실측상 알맞았다.
 */
export const FLAG_SLOT_MINUTES = 30

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
/* eslint-disable @typescript-eslint/no-unused-vars */
// @ts-expect-error — ★지금은 안 쓴다★ (`CLAUDE.md` 1-4). 칸별 질의(`daySlotRowsOf`)가
// 같은 재료를 시각까지 담아 주므로 그것을 합쳐 쓴다. 능선이 필요 없어지면 이쪽으로 돌아온다.
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
            COALESCE(SUM(h."evenKills"), 0)::int AS "evenKills",
            COALESCE(SUM(h."tradeKills"), 0)::int AS "tradeKills",
            COALESCE(SUM(h."mateDeaths"), 0)::int AS "mateDeaths",
            /*
             * ★캐리력은 «한 라운드 최대 킬»★ — ★더하지 않는다.★ 가장 큰 것을 남긴다.
             *
             * ⚠ 「그 최대를 낸 경기의 횟수」를 고르려면 «최대» 를 두 번 써야 하는데
             *   집계 안에 창함수를 중첩할 수 없다. 배열 비교로 한 번에 고른다 —
             *   Postgres 의 배열 대소는 ★앞 칸부터 차례로★ 보므로
             *   MAX(ARRAY[킬, 횟수]) 는 «가장 많이 몰아친 경기, 그중 더 자주 낸 쪽» 이다.
             *   (⚠ SQL 주석 안에 백틱을 쓰면 이 template literal 이 끊긴다)
             *   그래서 [2] 는 ★그 최고를 세운 경기에서 몇 번 냈나★ 다 (2026-09-15).
             */
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

/**
 * ★칸(30분)별 재료★ — 능선을 그리려고 시각을 함께 받는다.
 *
 * `dayRowsOf` 와 ★같은 재료★ 지만 `GROUP BY` 에 칸 번호가 하나 더 붙는다.
 * 화면에서 칸을 앞에서부터 더해 가며 «그 시각까지의 1등 점수» 를 만든다 —
 * 시각마다 질의를 던지면 스무 번이 되고, 연결이 하나뿐인 곳에서는 그게 곧 멈춤이다.
 */
async function daySlotRowsOf(leagueId: string, day: FlagDay): Promise<(DayRow & { slot: number })[]> {
  return (await prisma.$queryRawUnsafe(
    `SELECT s."playerId",
            pl.name,
            c.slug AS "clanSlug", c.name AS "clanName",
            c."markBgUrl" AS "markBg", c."markFrontUrl" AS "markFront",
            FLOOR(EXTRACT(EPOCH FROM (m."startAt" - $2::timestamptz)) / ($4 * 60))::int AS slot,
            COUNT(DISTINCT s."matchId")::int AS games,
            SUM(CASE WHEN m."winnerSide" = s.side THEN 1 ELSE 0 END)::int AS win,
            SUM(COALESCE(s.kill, 0))::int AS kill,
            SUM(COALESCE(s.death, 0))::int AS death,
            SUM(CASE WHEN s.weapon = 1 THEN 1 ELSE 0 END)::int AS "sniperGames",
            SUM(CASE WHEN s.weapon = 0 THEN 1 ELSE 0 END)::int AS "rifleGames",
            COALESCE(SUM(h.rounds), 0)::int       AS rounds,
            COALESCE(SUM(h."firstKills"), 0)::int  AS "firstKills",
            COALESCE(SUM(h."burstRounds"), 0)::int AS "burstRounds",
            COALESCE(SUM(h."evenKills"), 0)::int AS "evenKills",
            COALESCE(SUM(h."tradeKills"), 0)::int AS "tradeKills",
            COALESCE(SUM(h."mateDeaths"), 0)::int AS "mateDeaths",
            /*
             * ★캐리력은 «한 라운드 최대 킬»★ — ★더하지 않는다.★ 가장 큰 것을 남긴다.
             *
             * ⚠ 「그 최대를 낸 경기의 횟수」를 고르려면 «최대» 를 두 번 써야 하는데
             *   집계 안에 창함수를 중첩할 수 없다. 배열 비교로 한 번에 고른다 —
             *   Postgres 의 배열 대소는 ★앞 칸부터 차례로★ 보므로
             *   MAX(ARRAY[킬, 횟수]) 는 «가장 많이 몰아친 경기, 그중 더 자주 낸 쪽» 이다.
             *   (⚠ SQL 주석 안에 백틱을 쓰면 이 template literal 이 끊긴다)
             *   그래서 [2] 는 ★그 최고를 세운 경기에서 몇 번 냈나★ 다 (2026-09-15).
             */
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
       LEFT JOIN "Clan" c ON c.id = lp."clanId"
       LEFT JOIN "MatchPlayerHex" h ON h."matchId" = s."matchId" AND h."playerId" = s."playerId"
      WHERE m."leagueId" = $1
        AND m."supersededAt" IS NULL
        AND m."startAt" >= $2 AND m."startAt" < $3
      GROUP BY s."playerId", pl.name, c.slug, c.name, c."markBgUrl", c."markFrontUrl", 7`,
    leagueId,
    day.opensAt,
    day.closesAt,
    FLAG_SLOT_MINUTES,
  )) as (DayRow & { slot: number })[]
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

/** 두 재료를 더한다 — 칸을 앞에서부터 쌓을 때 쓴다 */
function addTally(into: FlagDayTally, from: FlagDayTally): FlagDayTally {
  return {
    games: into.games + from.games,
    win: into.win + from.win,
    lose: into.lose + from.lose,
    kill: into.kill + from.kill,
    death: into.death + from.death,
    rounds: into.rounds + from.rounds,
    firstKills: into.firstKills + from.firstKills,
    burstRounds: into.burstRounds + from.burstRounds,
    /* ★최대는 더하지 않는다★ — 큰 쪽을 남기고, 같으면 «몇 번 냈나» 를 더한다 */
    evenKills: into.evenKills + from.evenKills,
    tradeKills: into.tradeKills + from.tradeKills,
    mateDeaths: into.mateDeaths + from.mateDeaths,
    maxRoundKills: Math.max(into.maxRoundKills, from.maxRoundKills),
    maxRoundTimes:
      into.maxRoundKills === from.maxRoundKills
        ? into.maxRoundTimes + from.maxRoundTimes
        : into.maxRoundKills > from.maxRoundKills
          ? into.maxRoundTimes
          : from.maxRoundTimes,
    aloneRounds: into.aloneRounds + from.aloneRounds,
    aloneWon: into.aloneWon + from.aloneWon,
    outRounds: into.outRounds + from.outRounds,
    outWon: into.outWon + from.outWon,
    sniperDuelWon: into.sniperDuelWon + from.sniperDuelWon,
    sniperDuelLost: into.sniperDuelLost + from.sniperDuelLost,
    rifleDuelWon: into.rifleDuelWon + from.rifleDuelWon,
    rifleDuelLost: into.rifleDuelLost + from.rifleDuelLost,
    /* 무기는 더할 수 없다 — 판수가 많은 쪽으로 다시 정한다 (아래에서 덮는다) */
    weapon: null,
  }
}

/**
 * ★능선★ — 칸마다 «그때까지의 1등 점수».
 *
 * 질의는 ★한 번★ 이다. 칸별 재료를 받아 ★앞에서부터 쌓아 가며★ 매 칸에서
 * 줄 세우기를 다시 한다. 시각마다 DB 를 부르면 스무 번이 되고,
 * 연결이 하나뿐인 곳에서는 그게 곧 멈춤이다.
 *
 * 아직 아무도 문턱(4판·승률 50%)을 못 넘은 칸은 `null` 이다 — 0 으로 채우지 않는다.
 */
function timelineOf(
  slotRows: readonly (DayRow & { slot: number })[],
  slots: number,
): FlagTimelinePoint[] {
  /* 선수별 누적 재료 + 무기 판수 */
  const acc = new Map<string, { tally: FlagDayTally; sniper: number; rifle: number; row: DayRow }>()
  const bySlot = new Map<number, (DayRow & { slot: number })[]>()
  for (const r of slotRows) {
    const k = Math.max(0, Math.min(slots - 1, Number(r.slot)))
    const list = bySlot.get(k)
    if (list) list.push(r)
    else bySlot.set(k, [r])
  }

  const out: FlagTimelinePoint[] = []
  for (let i = 0; i < slots; i += 1) {
    for (const r of bySlot.get(i) ?? []) {
      const cur = acc.get(r.playerId)
      const add = tallyOf(r)
      const sniper = (cur?.sniper ?? 0) + Number(r.sniperGames)
      const rifle = (cur?.rifle ?? 0) + Number(r.rifleGames)
      acc.set(r.playerId, {
        tally: cur === undefined ? add : addTally(cur.tally, add),
        sniper,
        rifle,
        row: r,
      })
    }
    const candidates = [...acc.entries()].map(([playerId, v]) => ({
      ref: playerId,
      /* 무기는 ★누적 판수★ 로 다시 정한다 — 칸마다 바뀔 수 있다 */
      tally: { ...v.tally, weapon: v.sniper > v.rifle ? 1 : v.rifle > v.sniper ? 0 : null } as FlagDayTally,
    }))
    const top = rankFlagDay(candidates, 1)[0] ?? null
    out.push({
      slot: i,
      score: top === null ? null : Math.round(top.score * 10) / 10,
      player_id: top === null ? null : top.ref,
    })
  }
  return out
}

/** 칸별 줄을 선수 하나로 합친다 — `dayRowsOf` 와 같은 결과가 된다 */
function mergeSlots(slotRows: readonly (DayRow & { slot: number })[]): DayRow[] {
  const by = new Map<string, DayRow>()
  const num = (v: unknown) => Number(v ?? 0)
  for (const r of slotRows) {
    const cur = by.get(r.playerId)
    if (cur === undefined) {
      by.set(r.playerId, { ...r })
      continue
    }
    cur.games = num(cur.games) + num(r.games)
    cur.win = num(cur.win) + num(r.win)
    cur.kill = num(cur.kill) + num(r.kill)
    cur.death = num(cur.death) + num(r.death)
    cur.sniperGames = num(cur.sniperGames) + num(r.sniperGames)
    cur.rifleGames = num(cur.rifleGames) + num(r.rifleGames)
    cur.rounds = num(cur.rounds) + num(r.rounds)
    cur.firstKills = num(cur.firstKills) + num(r.firstKills)
    cur.burstRounds = num(cur.burstRounds) + num(r.burstRounds)
    cur.evenKills = num(cur.evenKills) + num(r.evenKills)
    cur.tradeKills = num(cur.tradeKills) + num(r.tradeKills)
    cur.mateDeaths = num(cur.mateDeaths) + num(r.mateDeaths)
    /* 최대는 큰 쪽을 남기고, 같을 때만 횟수를 더한다 */
    if (num(r.maxRoundKills) > num(cur.maxRoundKills)) {
      cur.maxRoundKills = num(r.maxRoundKills)
      cur.maxRoundTimes = num(r.maxRoundTimes)
    } else if (num(r.maxRoundKills) === num(cur.maxRoundKills)) {
      cur.maxRoundTimes = num(cur.maxRoundTimes) + num(r.maxRoundTimes)
    }
    cur.aloneRounds = num(cur.aloneRounds) + num(r.aloneRounds)
    cur.aloneWon = num(cur.aloneWon) + num(r.aloneWon)
    cur.outRounds = num(cur.outRounds) + num(r.outRounds)
    cur.outWon = num(cur.outWon) + num(r.outWon)
    cur.sniperDuelWon = num(cur.sniperDuelWon) + num(r.sniperDuelWon)
    cur.sniperDuelLost = num(cur.sniperDuelLost) + num(r.sniperDuelLost)
    cur.rifleDuelWon = num(cur.rifleDuelWon) + num(r.rifleDuelWon)
    cur.rifleDuelLost = num(cur.rifleDuelLost) + num(r.rifleDuelLost)
  }
  return [...by.values()]
}

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

  /* 하루를 몇 칸으로 나누나 — 10시간 ÷ 30분 = 20칸 */
  const slots = Math.max(
    1,
    Math.round((day.closesAt.getTime() - day.opensAt.getTime()) / (FLAG_SLOT_MINUTES * 60_000)),
  )
  /* ★능선은 라이브든 마감이든 늘 그린다★ — 하루가 어떻게 흘렀나는 안 바뀐다 */
  const slotRows = await daySlotRowsOf(league.id, day)
  const timeline = timelineOf(slotRows, slots)

  /*
   * ★직전 마감의 1등★ — 오늘 아직 아무도 없을 때 대신 보여 준다 (2026-09-15 · 무한 QA).
   *
   * 깃발은 17:00 에 열려 03:00 에 마감한다. 그래서 ★저녁마다 한동안★ 홈 첫 칸이
   * «아직 아무도 정상에 오르지 않았습니다» 로 빈다 — 하루 4판을 채운 사람이 없어서다.
   * 첫 화면 맨 위가 비어 있으면 사이트가 죽은 것처럼 보인다.
   *
   * ★오늘 줄이 하나라도 있으면 안 쓴다★ — 오늘 것이 늘 우선이다.
   * 실패해도 깃발판을 죽이지 않는다 (없으면 옛 문구 그대로).
   */
  const previousFlag = await prisma.leagueFlag
    .findFirst({
      where: { leagueId: league.id, rank: 1, dayKey: { lt: day.key } },
      orderBy: { dayKey: 'desc' },
      select: { dayKey: true, player: { select: { name: true } }, clan: { select: { name: true } } },
    })
    .catch(() => null)

  const base = {
    league: leagueSlug,
    day_key: day.key,
    opens_at: day.opensAt.toISOString(),
    closes_at: day.closesAt.toISOString(),
    live,
    slot_minutes: FLAG_SLOT_MINUTES,
    timeline,
    previous:
      previousFlag === null
        ? null
        : {
            day_key: previousFlag.dayKey,
            name: previousFlag.player?.name ?? '알수없음',
            clan: previousFlag.clan?.name ?? null,
          },
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
      /* 축만 다시 접는다 — 순위·전적은 박아 둔 값을 쓴다.
         ★칸별 재료를 이미 읽었으니 그것을 합친다★ — 같은 질의를 두 번 던지지 않는다 */
      const dayRows = mergeSlots(slotRows)
      const wanted = new Set(planted.map((p) => p.playerId))
      const axesOf = new Map(
        rankFlagDay(
          dayRows.map((r) => ({ ref: r, tally: tallyOf(r) })),
          /* 셋만 뽑으면 2·3 등이 빠질 수 있다 — 넉넉히 받아 필요한 사람만 고른다 */
          Number.MAX_SAFE_INTEGER,
        )
          .filter((r) => wanted.has(r.ref.playerId))
          .map((r) => [r.ref.playerId, r.axes] as const),
      )
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
          /*
           * ★마감 뒤에도 육각을 보여 준다★ (2026-09-15 사장님:
           * «이것도 그 날 1700-0300까지의 육각이다»).
           *
           * 깃발 표에는 점수만 박혀 있고 축은 없다. 그래서 ★그날 창으로 다시 접어★
           * 축만 붙인다 — ★순위와 전적은 박아 둔 값 그대로★ 다.
           * (다시 세면 집계가 늦게 바뀌어 «어제 1등» 이 뒤바뀔 수 있다.
           *  바뀌면 안 되는 것은 순위이지 그림이 아니다)
           */
          axes: axesOf.get(p.playerId) ?? [],
          flags: counts.get(p.playerId) ?? 0,
        })),
      }
    }
    /* 깃발이 아직 안 박혔다 (잡이 늦거나 그날 아무도 문턱을 못 넘었다) →
       ★그때까지의 기록으로 세어서 보여 준다.★ 빈 화면보다는 낫다 */
  }

  /* ★칸별 재료를 합쳐 쓴다★ — 같은 것을 두 번 읽지 않는다 */
  const rows = mergeSlots(slotRows)
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
