/**
 * ★오늘의 셋★ — 그날 클랜전을 뛴 사람·클랜 중 「고르게 잘하고 승률도 좋은」 셋 (2026-09-14 사장님).
 *
 *   «IPL이랑 SPL 개인랭킹이랑 클랜랭킹 둘 다 그 날 클랜전한 인원들을 일열로 세워서
 *     ★육각축이 고르게 전부 잘한 사람 + 승률도 좋아야함★ 3명 그리고 3개씩 뽑아서
 *     올려주는거 어때? 그 날 승률이랑 킬뎃 적어주고
 *     (★IPL도 여기에만 예외로 킬뎃 적어줌★)»
 *
 * ── 「고르게 잘한다」를 어떻게 쟀나
 *   ★여섯 축 중 가장 낮은 축★ 을 본다. 그게 높으면 ★약점이 없다★ 는 뜻이다.
 *   평균만 보면 한 축이 100이고 다섯 축이 바닥인 사람이 올라온다 — 그건 «고르게» 가 아니다.
 *
 *   ```
 *   점수 = 최저축 × 0.45  +  여섯 축 평균 × 0.25  +  그날 승률 × 0.30
 *   ```
 *   최저축이 절반 가까이를 쥔다(«전부 잘한»), 평균이 뒤를 받치고(«잘한»),
 *   그날 승률이 나머지다(«승률도 좋아야함»). 실제 자료로 돌려 보고 고른 배분이다 —
 *   숫자를 지어내지 않았다.
 *
 * ── ★「그날」 은 오늘이 아니라 「경기가 있던 마지막 날」 이다★
 *   실측(2026-09-14 낮): 그날 IPL·SPL 모두 ★경기가 0판★ 이었다. «오늘» 로 고정하면
 *   아침마다 카드가 빈다. 경기가 들어오면 저절로 그날이 «오늘» 이 된다.
 *
 * ── 육각은 누적, 승률·킬뎃은 그날
 *   육각을 «그날치» 로 다시 재지 않는다 — 하루 네댓 판으로는 여섯 축이 안 잡힌다.
 *   그래서 ★실력은 누적 육각★ 으로 보고 ★그날 한 일★ 은 승률·킬뎃으로 적는다.
 */
import { prisma } from '@sacloud/db'
import {
  CLAN_HEX_V2_CONFIG,
  rankFlagDay,
  buildClanHexV2Raw,
  sumClanHexTallies,
  CLAN_HEX_V2_AXIS_UNITS,
  kdRate,
  playerHexLabelOf,
  normalizeByPercentile,
  type ClanHexTallyLike,
  type ClanHexV2,
} from '@sacloud/contract'

/** 몇 명·몇 곳을 뽑나 (사장님: «3명 그리고 3개씩») */
export const DAILY_PODIUM_SIZE = 3

/**
 * 그날 최소 몇 판을 뛰어야 뽑히나.
 *
 * 실측(2026-09-13): 상위권이 4~7판이었다. 3판으로 두면 «3판 전승» 이
 * «6판 4승» 을 이긴다 — 그건 그날 잘한 게 아니라 적게 한 것이다.
 */
const MIN_GAMES = 4

/**
 * ★그날 승률이 이보다 낮으면 안 뽑는다★ (2026-09-14 실측으로 넣었다).
 *
 *   사장님: «육각축이 고르게 전부 잘한 사람 ★+ 승률도 좋아야함★».
 *   처음엔 점수에 승률을 30%만 섞었는데, 클랜은 그날 20~35판이라 승률이
 *   평준화돼서 ★승률 43.5% 인 클랜이 「오늘의 클랜」 3위★ 로 올라왔다.
 *   «승률도 좋아야 한다» 는 말에 43.5% 는 안 맞는다. 그래서 ★문턱★ 을 따로 둔다 —
 *   점수를 흔드는 대신, 진 날은 애초에 안 올린다.
 */
const MIN_WIN_RATE = 50

/** 점수 배분 — 위 주석의 식 그대로다. 한 곳에서만 정한다 */
const W_LOW = 0.45
const W_AVG = 0.25
const W_WIN = 0.3

export interface DailyPodiumRow {
  /** 1~3 */
  rank: number
  name: string
  /** 사람 줄이면 그 사람의 클랜, 클랜 줄이면 자기 자신 */
  clan: { name: string; slug: string; mark: { bg: string | null; front: string | null } } | null
  /** 상세로 가는 주소를 만드는 값 */
  player_id: string | null
  clan_slug: string | null
  games: number
  win: number
  lose: number
  /** 그날 승률 (%) */
  win_rate: number
  /**
   * 그날 킬뎃 (%) — 킬/데스 × 100.
   * ★IPL 도 여기에만 적는다★ (사장님이 콕 집어 예외로 두셨다).
   */
  kd_rate: number | null
  /** 여섯 축 중 가장 낮은 축의 백분위 — «약점 없음» 의 크기다 */
  low_axis: number
  /** 그 축 이름 — «가장 약한 데가 여기인데 그것도 상위 76%» 를 보여 준다 */
  low_axis_label: string
  /** 여섯 축 평균 */
  avg_axis: number
}

export interface DailyPodium {
  /** 기준일 (KST `YYYY-MM-DD`). 경기가 하나도 없으면 `null` */
  day: string | null
  players: DailyPodiumRow[]
  clans: DailyPodiumRow[]
}

function tallyOf(value: unknown): ClanHexTallyLike | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  return value as ClanHexTallyLike
}

function scoreOf(low: number, avg: number, winRate: number): number {
  return low * W_LOW + avg * W_AVG + winRate * W_WIN
}

export async function dailyPodium(leagueSlug: string): Promise<DailyPodium | null> {
  const league = await prisma.league.findFirst({ where: { slug: leagueSlug }, select: { id: true } })
  if (league === null) return null

  /* ★경기가 있던 마지막 날★ — 오늘 경기가 들어오면 저절로 오늘이 된다 */
  const dayRows = (await prisma.$queryRawUnsafe(
    `SELECT (m."startAt" AT TIME ZONE 'Asia/Seoul')::date::text AS d
       FROM "Match" m
      WHERE m."leagueId" = $1 AND m."supersededAt" IS NULL
      ORDER BY m."startAt" DESC
      LIMIT 1`,
    league.id,
  )) as { d: string }[]
  const day = dayRows[0]?.d ?? null
  if (day === null) return { day: null, players: [], clans: [] }

  const players = await playersOf(league.id, day)
  const clans = await clansOf(league.id, day)
  return { day, players, clans }
}

/* -------------------------------------------------------------------------- */
/* 사람                                                                         */
/* -------------------------------------------------------------------------- */

async function playersOf(leagueId: string, day: string): Promise<DailyPodiumRow[]> {
  /*
   * ⚠ ★시즌 누적을 쓰지 않는다★ (2026-09-15 사장님:
   *   «누적 1,2,3등말고 / ★그 날 한 경기 데이터로만 분석해서 육각축 만들어달라고★»).
   *
   *   옛 질의는 `LeaguePlayerHex` 의 `{축}Pct` — ★시즌 누적 백분위★ 를 읽었다.
   *   그러면 «오늘 잘한 사람» 이 아니라 ★«원래 잘하는 사람»★ 이 뽑힌다.
   *   이제 경기 단위 재료(`MatchPlayerHex`)를 ★그날 것만 접어서★ 축을 만들고,
   *   백분위도 ★그날 뛴 사람들 안에서★ 낸다 (`rankFlagDay` — 깃발과 같은 함수다).
   */
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT s."playerId", pl.name,
            c.name AS "clanName", c.slug AS "clanSlug", c."markBgUrl", c."markFrontUrl",
            COUNT(DISTINCT s."matchId")::int AS games,
            SUM(CASE WHEN m."winnerSide" = s.side THEN 1 ELSE 0 END)::int AS win,
            SUM(COALESCE(s.kill, 0))::int AS kill,
            SUM(COALESCE(s.death, 0))::int AS death,
            SUM(CASE WHEN s.weapon = 1 THEN 1 ELSE 0 END)::int AS "sniperGames",
            SUM(CASE WHEN s.weapon = 0 THEN 1 ELSE 0 END)::int AS "rifleGames",
            COALESCE(SUM(h.rounds), 0)::int        AS rounds,
            COALESCE(SUM(h."firstKills"), 0)::int  AS "firstKills",
            COALESCE(SUM(h."burstRounds"), 0)::int AS "burstRounds",
            COALESCE(SUM(h."evenKills"), 0)::int AS "evenKills",
            COALESCE(SUM(h."tradeKills"), 0)::int AS "tradeKills",
            COALESCE(SUM(h."mateDeaths"), 0)::int AS "mateDeaths",
            /* ★캐리력은 «한 라운드 최대 킬»★ — 더하지 않고 가장 큰 것을 남긴다.
               배열 대소는 앞 칸부터 보므로 [2] 는 그 최고를 세운 경기의 횟수다 (2026-09-15) */
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
       JOIN "LeaguePlayer" lp ON lp."playerId" = s."playerId" AND lp."leagueId" = $1
       LEFT JOIN "Clan" c ON c.id = lp."clanId"
       LEFT JOIN "MatchPlayerHex" h ON h."matchId" = s."matchId" AND h."playerId" = s."playerId"
      WHERE m."leagueId" = $1 AND m."supersededAt" IS NULL
        AND (m."startAt" AT TIME ZONE 'Asia/Seoul')::date = $2::date
      GROUP BY s."playerId", pl.name, c.name, c.slug, c."markBgUrl", c."markFrontUrl"`,
    leagueId,
    day,
  )) as Record<string, unknown>[]

  /*
   * ★줄 세우기는 깃발과 같은 함수★ (`rankFlagDay`) — 그날 재료로 축을 만들고
   * 백분위도 그날 안에서 낸다. 두 화면이 한 리그에서 다른 사람을 1등이라고 하면 안 된다.
   */
  const num = (v: unknown) => Number(v ?? 0)
  const ranked = rankFlagDay(
    rows.map((r) => ({
      ref: r,
      tally: {
        games: num(r.games),
        win: num(r.win),
        lose: num(r.games) - num(r.win),
        kill: num(r.kill),
        death: num(r.death),
        rounds: num(r.rounds),
        firstKills: num(r.firstKills),
        burstRounds: num(r.burstRounds),
        maxRoundKills: num(r.maxRoundKills),
        evenKills: num(r.evenKills),
        tradeKills: num(r.tradeKills),
        mateDeaths: num(r.mateDeaths),
        maxRoundTimes: num(r.maxRoundTimes),
        aloneRounds: num(r.aloneRounds),
        aloneWon: num(r.aloneWon),
        outRounds: num(r.outRounds),
        outWon: num(r.outWon),
        sniperDuelWon: num(r.sniperDuelWon),
        sniperDuelLost: num(r.sniperDuelLost),
        rifleDuelWon: num(r.rifleDuelWon),
        rifleDuelLost: num(r.rifleDuelLost),
        /* 그날 더 많이 쓴 무기. 같으면 못 정한 것으로 둔다 */
        weapon:
          num(r.sniperGames) > num(r.rifleGames)
            ? (1 as const)
            : num(r.rifleGames) > num(r.sniperGames)
              ? (0 as const)
              : null,
      },
    })),
    DAILY_PODIUM_SIZE,
  )

  return ranked.map((x) => {
    const r = x.ref
    /* 그날 주무기 — 축 이름이 무기에 따라 갈린다 (스나싸움 / 샷싸움) */
    const w: 0 | 1 | null =
      num(r.sniperGames) > num(r.rifleGames) ? 1 : num(r.rifleGames) > num(r.sniperGames) ? 0 : null
    return {
      rank: x.rank,
      name: String(r.name),
      clan:
        r.clanSlug === null || r.clanSlug === undefined
          ? null
          : {
              name: String(r.clanName),
              slug: String(r.clanSlug),
              mark: {
                bg: (r.markBgUrl as string | null) ?? null,
                front: (r.markFrontUrl as string | null) ?? null,
              },
            },
      player_id: String(r.playerId),
      clan_slug: null,
      games: x.games,
      win: x.win,
      lose: x.lose,
      win_rate: x.winRate,
      kd_rate: x.kdRate,
      low_axis: Math.round(x.lowPct),
      /*
       * ⚠ ★영어 열쇠를 그대로 내보내면 안 된다★ (2026-09-14 실측 — «최저축 duel 76»).
       *   화면에 쓰는 이름은 `playerHexLabelOf` 가 정한다 — 무기에 따라 갈린다.
       */
      low_axis_label: playerHexLabelOf(x.lowKey, w),
      avg_axis: Math.round(x.axes.reduce((a, b) => a + (b.pct ?? 0), 0) / x.axes.length),
      /* ★그날 육각★ — 사장님: «그 날 한 경기 데이터로만 분석해서 육각축 만들어달라고» */
      axes: x.axes.map((a) => ({
        key: a.key,
        label: playerHexLabelOf(a.key, w),
        value: a.value,
        pct: a.pct,
        unit:
          /*
           * ★선짤만 «판당 n.n회»★ 다 (2026-09-15 사장님).
           * ⚠ 같은 날 두 축이 퍼센트로 옮겨 갔다 — 게임영향력(옛 캐리력)과
           *   5번 축(옛 연속킬 → 교환율). 남은 `per_game` 은 선짤뿐이다.
           */
          a.key === 'opening' ? ('per_game' as const) : ('percent' as const),
      })),
    }
  })
}

/* -------------------------------------------------------------------------- */
/* 클랜                                                                         */
/* -------------------------------------------------------------------------- */

async function clansOf(leagueId: string, day: string): Promise<DailyPodiumRow[]> {
  /* 그날 뛴 클랜의 성적 — 한 경기에 두 클랜이라 red/blue 를 펼쳐 센다 */
  const rows = (await prisma.$queryRawUnsafe(
    `WITH played AS (
       SELECT m."redLeagueClanId" AS "leagueClanId",
              (m."winnerSide" = 'red') AS won, m.id AS "matchId"
         FROM "Match" m
        WHERE m."leagueId" = $1 AND m."supersededAt" IS NULL
          AND (m."startAt" AT TIME ZONE 'Asia/Seoul')::date = $2::date
       UNION ALL
       SELECT m."blueLeagueClanId", (m."winnerSide" = 'blue'), m.id
         FROM "Match" m
        WHERE m."leagueId" = $1 AND m."supersededAt" IS NULL
          AND (m."startAt" AT TIME ZONE 'Asia/Seoul')::date = $2::date
     )
     SELECT lc.id AS "leagueClanId", c.name, c.slug, c."markBgUrl", c."markFrontUrl",
            COUNT(*)::int AS games,
            SUM(CASE WHEN p.won THEN 1 ELSE 0 END)::int AS win,
            COALESCE(SUM(k.kill), 0)::int AS kill,
            COALESCE(SUM(k.death), 0)::int AS death
       FROM played p
       JOIN "LeagueClan" lc ON lc.id = p."leagueClanId"
       JOIN "Clan" c ON c.id = lc."clanId"
       LEFT JOIN LATERAL (
         SELECT SUM(COALESCE(s.kill, 0))::int AS kill, SUM(COALESCE(s.death, 0))::int AS death
           FROM "MatchPlayerStat" s
          WHERE s."matchId" = p."matchId" AND s."matchTimeLeagueClanId" = lc.id
       ) k ON TRUE
      WHERE lc."expelledAt" IS NULL
      GROUP BY lc.id, c.name, c.slug, c."markBgUrl", c."markFrontUrl"`,
    leagueId,
    day,
  )) as {
    leagueClanId: string
    name: string
    slug: string
    markBgUrl: string | null
    markFrontUrl: string | null
    games: number
    win: number
    kill: number
    death: number
  }[]
  if (rows.length === 0) return []

  /*
   * ⚠ ★시즌 요약을 쓰지 않는다★ (2026-09-15 사장님:
   *   «누적 1,2,3등말고 / ★그 날 한 경기 데이터로만 분석해서 육각축 만들어달라고★»).
   *
   *   옛 판은 `ClanHexV2Summary` — ★시즌 누적★ 을 읽어 리그 분포로 정규화했다.
   *   그러면 «오늘 잘한 클랜» 이 아니라 ★«원래 잘하는 클랜»★ 이 뽑힌다.
   *   이제 경기 단위 재료(`MatchClanHexV2`)를 ★그날 경기만★ 합쳐서 축을 만들고,
   *   백분위도 ★그날 뛴 클랜들 안에서★ 낸다.
   */
  const dayRows = await prisma.$queryRawUnsafe<
    { leagueClanId: string; tally: unknown; matches: number }[]
  >(
    `SELECT h."leagueClanId", jsonb_agg(h.tally) AS tally, COUNT(*)::int AS matches
       FROM "MatchClanHexV2" h
       JOIN "Match" m ON m.id = h."matchId"
      WHERE m."leagueId" = $1 AND m."supersededAt" IS NULL
        AND (m."startAt" AT TIME ZONE 'Asia/Seoul')::date = $2::date
        AND h."formulaVersion" = $3
      GROUP BY h."leagueClanId"`,
    leagueId,
    day,
    CLAN_HEX_V2_CONFIG.formulaVersion,
  )
  const raw = new Map<string, ClanHexV2>()
  for (const r of dayRows) {
    /* 경기별 tally 를 하나로 접는다 — 요약 잡이 시즌 단위로 하는 일을 하루 단위로 */
    const parts = Array.isArray(r.tally) ? r.tally : [r.tally]
    const talls = parts.map((t) => tallyOf(t)).filter((t): t is NonNullable<typeof t> => t !== null)
    if (talls.length === 0) continue
    /* 분자·분모를 각각 쌓고 ★마지막에 한 번만 나눈다★ — 요약 잡과 같은 함수다 */
    const merged = sumClanHexTallies(talls)
    raw.set(r.leagueClanId, buildClanHexV2Raw({ tally: merged, matches: Number(r.matches) }))
  }
  const pool = [...raw.values()]

  /*
   * ★그날 뛴 클랜들 안에서 축마다 등수★ (2026-09-15 사장님 «퍼센트 말고 순위로»).
   *
   * 축 원값(`raw`)을 모아 내림차순으로 두고, 같은 값이면 같은 등수로 센다.
   * 시즌 등수가 아니다 — 오늘의 셋은 ★그날 자료만★ 본다.
   */
  const clanAxisPool = new Map<string, number[]>()
  for (const hex of pool) {
    for (const a of hex.axes) {
      if (a.raw === null) continue
      const list = clanAxisPool.get(a.key) ?? []
      list.push(a.raw)
      clanAxisPool.set(a.key, list)
    }
  }
  for (const list of clanAxisPool.values()) list.sort((x, y) => y - x)
  /** 게임템포는 ★작을수록 좋다★ — 라운드가 빨리 끝난 쪽이 위다 */
  const LOWER_IS_BETTER = new Set(['tempo'])
  const clanAxisRank = (key: string, raw: number | null): number | null => {
    if (raw === null) return null
    const list = clanAxisPool.get(key)
    if (!list || list.length === 0) return null
    const better = LOWER_IS_BETTER.has(key)
      ? list.filter((v) => v < raw).length
      : list.filter((v) => v > raw).length
    return better + 1
  }
  const clanAxisTotal = (key: string): number | null => {
    const n = clanAxisPool.get(key)?.length ?? 0
    return n > 0 ? n : null
  }

  const scored = rows
    .map((r) => {
      if (r.games < MIN_GAMES) return null
      const target = raw.get(r.leagueClanId)
      if (target === undefined) return null
      const hex = normalizeByPercentile(target, pool)
      const vals = hex.axes.map((a) => (a.value === null ? null : a.value * 100))
      if (vals.some((v) => v === null)) return null
      const nums = vals as number[]
      const low = Math.min(...nums)
      const avg = nums.reduce((a, b) => a + b, 0) / nums.length
      const winRate = (r.win / r.games) * 100
      if (winRate < MIN_WIN_RATE) return null
      const lowIndex = nums.indexOf(low)
      return {
        r,
        low,
        avg,
        winRate,
        lowLabel: hex.axes[lowIndex]?.label ?? '',
        /* ★그날 육각★ — 사장님: «그 날 한 경기 데이터로만 분석해서 육각축 만들어달라고» */
        hex,
        /* ⚠ 위와 같다 — ★킬 ÷ (킬+데스)★. 계약의 `kdRate` 한 곳이 정한다 */
        kd: r.death === 0 && r.kill === 0 ? null : kdRate(r.kill, r.death),
        score: scoreOf(low, avg, winRate),
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, DAILY_PODIUM_SIZE)

  return scored.map((x, i) => ({
    rank: i + 1,
    name: x.r.name,
    clan: {
      name: x.r.name,
      slug: x.r.slug,
      mark: { bg: x.r.markBgUrl, front: x.r.markFrontUrl },
    },
    player_id: null,
    clan_slug: x.r.slug,
    games: x.r.games,
    win: x.r.win,
    lose: x.r.games - x.r.win,
    win_rate: Math.round(x.winRate * 10) / 10,
    kd_rate: x.kd === null ? null : Math.round(x.kd * 10) / 10,
    low_axis: Math.round(x.low),
    low_axis_label: x.lowLabel,
    avg_axis: Math.round(x.avg),
    /*
     * ★그날 육각★ — 면적은 백분위(`value`), 밑에 적는 글자는 원값이다.
     * 단위는 계약의 `CLAN_HEX_V2_AXIS_UNITS` 가 정한다 (게임템포만 초다).
     */
    axes: x.hex.axes.map((a) => ({
      key: a.key,
      label: a.label,
      value: a.raw,
      pct: a.value === null ? null : Math.round(a.value * 1000) / 10,
      /* ★그날 뛴 클랜들 안에서의 등수★ (2026-09-15 사장님 «퍼센트 말고 순위로») */
      rank: clanAxisRank(a.key, a.raw),
      total: clanAxisTotal(a.key),
      unit:
        CLAN_HEX_V2_AXIS_UNITS[a.key] === 'seconds'
          ? ('seconds' as const)
          : CLAN_HEX_V2_AXIS_UNITS[a.key] === 'perGame' || CLAN_HEX_V2_AXIS_UNITS[a.key] === 'perRound'
            ? ('per_game' as const)
            : ('percent' as const),
    })),
  }))
}
