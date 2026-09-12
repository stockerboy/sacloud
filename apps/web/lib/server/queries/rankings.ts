/**
 * 개인랭킹의 **무기 축**과 **폼 TOP3** (D-169).
 *
 * 둘 다 **원본 3rd.supply 에는 없는 우리 신규 기능**이다. 사용자가 명시적으로 지시했다
 * (`CLAUDE.md` 3장 3번 "임의 기능 추가 금지"의 예외 — 임의가 아니다).
 *
 * ── 무기 축 (통합 / 스나 / 라플)
 *   **무기별 공식 같은 것은 없다** (`CLAUDE.md` 3-B 1번). 통합 공식이 이미 계산해 둔
 *   경기별 증감을 무기에 따라 나눠 담은 `LeaguePlayerWeaponStat.ratingDelta` 를 읽을 뿐이다.
 *   통합 탭은 기존 `getPlayerRanks`(`leagues.ts`)를 그대로 쓴다 —
 *   **통합 래더 값은 한 점도 바뀌지 않는다** (3-B 2번).
 *
 *   정렬 기준은 `ratingDelta` 다. 선수 프로필의 무기별 순위(`playerWeaponRankOf`)와
 *   **같은 기준·같은 모집단**이어야 "3위 / 1,204명" 과 목록의 3번째 줄이 어긋나지 않는다.
 *
 *   무기 탭의 표시값도 `ratingDelta` 다. 무기별 **절대 점수**를 만들지 않는다 —
 *   `baseRating + ratingDelta` 같은 값을 지어내면 통합 래더와 다른 축의 숫자가 생기고,
 *   `baseRating` 이 선수마다 다른 리그에서는 정렬 기준과 표시값이 어긋나 표가
 *   뒤죽박죽으로 보인다. 무기 분리는 **기록만** 나눈다.
 *
 * ── 폼 TOP3
 *   그날 하루 동안 얻은 래더 증감의 합이 큰 순서로 3명. 최소 3경기.
 *   동점이면 경기 수가 많은 쪽이 위. 각 무기 축마다 따로 계산한다.
 *
 * ── 함정: 미러 경기의 증감은 다른 칸에 있다 (D-164 · D-153)
 *   `MatchPlayerStat.ratingUpdate` 는 **우리 공식(D-145)이 계산한 경기에만** 있다.
 *   3rd.supply 에서 미러링해 온 시즌7 경기(13만 건)에는 비어 있고, 그 증감은
 *   `sourceRatingDelta` 에 있다. 그래서 증감을 읽을 때는 항상
 *   `ratingUpdate ?? sourceRatingDelta` 로 폴백한다. 이 폴백이 없으면
 *   폼 TOP3 가 통째로 빈 화면이 된다.
 */
import { prisma } from '@sacloud/db'
import {
  FORM_TOP_MIN_GAMES,
  FORM_TOP_SIZE,
  RANK_WEAPON_CODE,
  kdRate,
  killPerMatch,
  winRate,
  type FormTop,
  type PlayerRankRow,
  type RankWeapon,
} from '@sacloud/contract'
import { cursorPage, type CursorPage } from '../cursorPage'
import { toKstDate } from '../format'
import {
  CLAN_SUMMARY_SELECT,
  PLAYER_SUMMARY_SELECT,
  toClanSummaryOrNull,
  toPlayerSummary,
} from '../mappers'
import { cumulativeKdRate } from './visibility'
import { ladderMatchWhere } from './ladderScope'
import { rankTierStatsOf, weaponSliceOf } from './rankTierStats'
import { SEASON0_ORIGINS, seasonWindowWhere } from './season0Scope'

/** 한 무기 축(스나·라플)만 가리키는 좁은 타입 — `all` 은 여기 오지 않는다 */
export type WeaponAxis = Exclude<RankWeapon, 'all'>

/**
 * 무기별 랭킹 정렬.
 *
 * 마지막에 반드시 고유 키를 둔다 — 증감 동점이 흔해서 타이브레이커가 없으면
 * 커서 페이지네이션이 흔들린다(같은 줄이 두 번 나오거나 빠진다).
 * `LeaguePlayerWeaponStat` 의 고유 키는 `(leaguePlayerId, weapon)` 이고
 * weapon 은 고정이므로 `leaguePlayerId` 하나면 충분하다.
 */
const WEAPON_ORDER = [{ ratingDelta: 'desc' as const }, { leaguePlayerId: 'asc' as const }]
const WEAPON_ORDER_REVERSED = [{ ratingDelta: 'asc' as const }, { leaguePlayerId: 'desc' as const }]

/**
 * 무기별 랭킹 모집단.
 *
 * `playerWeaponRankOf`(D-149)와 **똑같아야 한다.** 한쪽만 조건이 다르면
 * 프로필의 "N위 / M명" 과 이 목록의 줄 수가 어긋난다.
 *   · 배치고사 중인 선수는 순위를 받지 않는다 (다른 랭킹과 같은 규칙)
 *   · K/D 를 아는 경기가 한 판도 없으면 빼둔다 — 비교할 실적이 없는 사람에게 등수를 주지 않는다
 */
function weaponRankWhere(leagueId: string, weapon: WeaponAxis) {
  return {
    weapon: RANK_WEAPON_CODE[weapon],
    knownStatGames: { gt: 0 },
    /* **주무기만** 그 무기 랭킹에 오른다 (D-173).
       라플수가 어쩌다 든 스나 몇 판으로 스나 랭킹에 들어오면 안 된다.
       기록(판수·킬데스·증감)은 주무기가 아니어도 프로필에 그대로 나온다 */
    isMain: true,
    leaguePlayer: { leagueId, placement: false },
  }
}

interface WeaponRankRow {
  leaguePlayerId: string
  ratingDelta: number
  knownStatGames: number
  win: number
  lose: number
  kill: number
  death: number
  leaguePlayer: {
    rating: number
    activityPenalty: number
    player: { id: string; name: string }
    clan: {
      id: string
      slug: string
      name: string
      markBgUrl: string | null
      markFrontUrl: string | null
      sourceClanId: string | null
    } | null
  }
}

/**
 * 커서로 잘라 온 첫 줄의 순위.
 *
 * 커서 페이지네이션은 offset 을 모르므로 "정렬상 앞에 오는 행의 개수 + 1" 을 센다.
 * 정렬이 `ratingDelta desc, leaguePlayerId asc` 이므로
 * "증감이 더 크거나 / 같은데 id 가 앞선" 행이 앞이다.
 */
async function rankOfFirstWeaponRow(
  leagueId: string,
  weapon: WeaponAxis,
  first: { ratingDelta: number; leaguePlayerId: string } | undefined,
): Promise<number> {
  if (!first) return 1
  const before = await prisma.leaguePlayerWeaponStat.count({
    where: {
      ...weaponRankWhere(leagueId, weapon),
      OR: [
        { ratingDelta: { gt: first.ratingDelta } },
        { ratingDelta: first.ratingDelta, leaguePlayerId: { lt: first.leaguePlayerId } },
      ],
    },
  })
  return before + 1
}

/**
 * 무기별 개인랭킹 한 페이지.
 *
 * 승·패·킬·데스도 **그 무기 버킷의 값**이다. 통합 누적을 섞지 않는다.
 * 평균킬의 분모는 `knownStatGames` 다 — K/D 를 모르는 경기를 0킬로 세면 평균이 거짓이 된다 (D-149).
 */
export async function getPlayerRanksByWeapon(
  leagueId: string,
  weapon: WeaponAxis,
  cursor: string | null,
  size: number,
): Promise<CursorPage<PlayerRankRow> | null> {
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { id: true, category: true },
  })
  if (!league) return null

  const where = weaponRankWhere(leagueId, weapon)
  const weaponCode = RANK_WEAPON_CODE[weapon]

  const page = await cursorPage<WeaponRankRow>({
    cursor,
    size,
    orderBy: [...WEAPON_ORDER],
    reversedOrderBy: [...WEAPON_ORDER_REVERSED],
    idOf: (row) => row.leaguePlayerId,
    fetch: (args) =>
      prisma.leaguePlayerWeaponStat.findMany({
        where,
        take: args.take,
        orderBy: args.orderBy as never,
        /* 복합 기본키라 커서 모양이 `{ id }` 가 아니다.
           weapon 은 이 질의에서 고정이므로 `leaguePlayerId` 만 커서로 옮기면 된다 */
        ...(args.cursor
          ? {
              cursor: {
                leaguePlayerId_weapon: { leaguePlayerId: args.cursor.id, weapon: weaponCode },
              },
              skip: args.skip,
            }
          : {}),
        select: {
          leaguePlayerId: true,
          ratingDelta: true,
          knownStatGames: true,
          win: true,
          lose: true,
          kill: true,
          death: true,
          leaguePlayer: {
            select: {
              rating: true,
              player: { select: PLAYER_SUMMARY_SELECT },
              clan: { select: CLAN_SUMMARY_SELECT },
            },
          },
        },
      }) as Promise<WeaponRankRow[]>,
  })

  const startRank = await rankOfFirstWeaponRow(leagueId, weapon, page.items[0])

  return {
    cursor: page.cursor,
    items: page.items.map((row, index) => ({
      rank: startRank + index,
      league_player_id: row.leaguePlayerId,
      player: toPlayerSummary(row.leaguePlayer.player),
      clan: toClanSummaryOrNull(row.leaguePlayer.clan),
      win: row.win,
      lose: row.lose,
      win_rate: winRate(row.win, row.lose),
      /* 무소속리그면 top100 밖만 비운다 (2026-09-02). 무기 축과는 다른 규칙이다.
         여기서 견주는 순위는 **이 목록의 순위**(무기 랭킹)다 — 그 목록의 위 100명이다 */
      kd_rate: cumulativeKdRate(league, kdRate(row.kill, row.death), startRank + index),
      kill_per_match: killPerMatch(row.kill, row.knownStatGames),
      /* 통합 래더는 무기 탭에서도 통합 래더 그대로다 (3-B 2번) */
      rating: row.leaguePlayer.rating,
      weapon,
      rating_delta: row.ratingDelta,
      hex: null,
      score: null,
      score_weapon: null,
    })),
  }
}

/* --------------------------------- 폼 TOP3 -------------------------------- */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000

/**
 * KST 자정 기준 하루의 UTC 경계.
 *
 * [미확인] **"그날"의 기준 시각은 원본이 알려주지 않았다.** 한국 서비스이므로
 * 한국 시각(KST) 자정을 하루의 경계로 정했다 — 원본과 동일함이 검증되지 않았다 (D-169).
 */
export function kstDayRange(day: string): { from: Date; to: Date } {
  const from = new Date(`${day}T00:00:00.000Z`)
  from.setTime(from.getTime() - KST_OFFSET_MS)
  return { from, to: new Date(from.getTime() + 24 * 60 * 60 * 1000) }
}

interface FormAggRow {
  playerId: string
  delta: number
  games: number
}

/**
 * 폼 TOP3.
 *
 * ── 대상 날짜
 *   **가장 최근에 경기가 있었던 날(KST)** 이다. 오늘 경기가 있으면 그 날이 곧 오늘이다.
 *   오늘 경기가 하나도 없을 때 빈 칸을 남기지 않으려고 최근 경기일로 물러선다.
 *   물러섰다는 사실은 `is_today = false` 와 `date` 로 화면에 드러낸다 — 감추지 않는다.
 *   [미확인] 이 폴백은 원본에 없는 우리 결정이다 (D-169).
 *
 * ── 왜 raw SQL 인가
 *   `SUM(COALESCE(ratingUpdate, sourceRatingDelta, 0))` 이 필요하다 (D-164 · D-153).
 *   Prisma `groupBy` 는 두 컬럼을 합쳐 더할 수 없다. 폴백을 포기하면 미러 경기가
 *   전부 0점이 되어 목록이 비어 버린다.
 */
export async function getFormTop(leagueId: string, weapon: RankWeapon): Promise<FormTop | null> {
  const league = await prisma.league.findUnique({ where: { id: leagueId }, select: { id: true } })
  if (!league) return null

  const empty: FormTop = { date: null, is_today: false, weapon, rows: [] }

  /* 래더에 반영된 경기 중 가장 최근 것 — 조건을 **베껴 적지 않고** 불러 쓴다 (D-164 · D-178).
     예전에는 여기에 같은 `OR` 를 다시 적어 두어서, 판정이 넓어졌을 때
     (`origin='nexon'` 추가) 이 줄만 옛 조건으로 남았다.
     시즌 창도 같이 건다 — 폼 TOP3 는 성적 수치다.
     `@@index([leagueId, startAt desc])` 를 그대로 탄다 */
  const latest = await prisma.match.findFirst({
    where: { leagueId, ...seasonWindowWhere(), ...ladderMatchWhere() },
    orderBy: { startAt: 'desc' },
    select: { startAt: true },
  })
  if (!latest) return empty

  const day = toKstDate(latest.startAt)
  const { from, to } = kstDayRange(day)
  const isToday = day === toKstDate(new Date())

  const weaponCode = weapon === 'all' ? null : RANK_WEAPON_CODE[weapon]

  /* `ladderMatchWhere()` 와 **같은 origin 목록**이다 (D-178).
     Prisma `groupBy` 로는 두 칸을 합쳐 더할 수 없어 여기만 raw SQL 인데,
     조건까지 손으로 베껴 적으면 두 곳이 갈라진다. 목록만 바인드 파라미터로 넘긴다 */
  const ladderOrigins = [...SEASON0_ORIGINS]

  /* `$queryRaw` 태그드 템플릿은 값을 전부 바인드 파라미터로 넘긴다 (SQL 주입 없음).
     무기 조건은 `weaponCode` 가 null 이면 항상 참이 되게 써서 질의를 한 벌로 유지한다 */
  const rows = await prisma.$queryRaw<FormAggRow[]>`
    SELECT s."playerId" AS "playerId",
           SUM(COALESCE(s."ratingUpdate", s."sourceRatingDelta", 0))::int AS "delta",
           COUNT(*)::int AS "games"
      FROM "MatchPlayerStat" s
      JOIN "Match" m ON m."id" = s."matchId"
     WHERE m."leagueId" = ${leagueId}
       AND m."startAt" >= ${from}
       AND m."startAt" < ${to}
       AND (m."redRatingUpdate" IS NOT NULL OR m."origin" = ANY(${ladderOrigins}::text[]))
       -- 숨긴 사본은 세지 않는다 (2026-09-06 · Part 8). seasonWindowWhere() 와 같은 조건.
       -- raw SQL 이라 그 함수를 못 써서 조건이 여기 한 벌 더 적혀 있다
       AND m."supersededAt" IS NULL
       AND (${weaponCode}::int IS NULL OR s."weapon" = ${weaponCode}::int)
     GROUP BY s."playerId"
    HAVING COUNT(*) >= ${FORM_TOP_MIN_GAMES}
     ORDER BY "delta" DESC, "games" DESC, s."playerId" ASC
     LIMIT ${FORM_TOP_SIZE}
  `

  if (rows.length === 0) return { ...empty, date: day, is_today: isToday }

  /* 표시에 필요한 선수·클랜은 리그 참가 기록에서 가져온다.
     배치고사 여부로 거르지 않는다 — 폼은 "그날 잘한 사람"이지 랭킹이 아니다 */
  const leaguePlayers = await prisma.leaguePlayer.findMany({
    where: { leagueId, playerId: { in: rows.map((row) => row.playerId) } },
    select: {
      id: true,
      playerId: true,
      player: { select: PLAYER_SUMMARY_SELECT },
      clan: { select: CLAN_SUMMARY_SELECT },
    },
  })
  const byPlayerId = new Map(leaguePlayers.map((entry) => [entry.playerId, entry]))

  return {
    date: day,
    is_today: isToday,
    weapon,
    rows: rows.flatMap((row, index) => {
      const entry = byPlayerId.get(row.playerId)
      // 리그 참가 기록이 없으면 이름을 지어내지 않고 그냥 뺀다
      if (!entry) return []
      return [
        {
          rank: index + 1,
          league_player_id: entry.id,
          player: toPlayerSummary(entry.player),
          clan: toClanSummaryOrNull(entry.clan),
          rating_delta: row.delta,
          games: row.games,
        },
      ]
    }),
  }
}

/* -------------------------------------------------------------------------- */
/* ★실력 점수 순 개인랭킹★ (2026-09-10 · 사장님 확정)                            */
/* -------------------------------------------------------------------------- */

/**
 * > "개인랭킹 이걸로 확정이다 (…) 클랜은 그냥 원래하던대로 가고" — 사용자, 2026-09-10
 *
 * `weapon=all` 개인랭킹이 이제 이 목록이다. 점수·등수는 워커 잡(`player-hex-build`)이
 * `LeaguePlayerHex` 에 미리 접어 둔 값이라 여기서는 **읽어서 줄만 세운다.** 첫 줄의 등수도
 * 저장된 `scoreRank` 그대로다 — 세는 질의가 없다.
 *
 * 옛 래더 순 목록(`leagues.ts` 의 `getPlayerRanks`)은 지우지 않았다 (`CLAUDE.md` 1-4).
 * 표가 비어 있으면(잡이 아직 안 돌았으면) 라우트가 그쪽으로 돌아간다.
 */
/** ★개인랭킹에 올리는 최소 판수★ (2026-09-12 사장님) — 0 이면 전부 올린다 */
export const RANK_MIN_GAMES = 15

/** `false` 로 두면 옛 판 — 통합 승률 + 무기별 «전 구간» 킬뎃 (`CLAUDE.md` 1-4) */
const RANK_STATS_BY_HOME_TIER = true

export async function getPlayerRanksByScore(
  leagueId: string,
  cursor: string | null,
  size: number,
  /** 0 라플 · 1 스나 — 주면 ★그 무기 선수만 남긴다.★ 순위 자체는 그대로다 (2026-09-11 사장님) */
  onlyWeapon: 0 | 1 | null = null,
  /**
   * 1 ASTRA · 2 CHALLENGER1 · 3 CHALLENGER2 — 주면 ★내 구간이 그 티어인 선수만 남긴다.★
   * «내 구간» 은 ★가장 많이 뛴 티어★(`homeTier`) 다. 클랜 소속이 아니다 (2026-09-11 사장님).
   * 무기 칩과 똑같이 ★거르개★ 라 등수는 걸러 낸 줄의 순서다.
   */
  onlyTier: 1 | 2 | 3 | null = null,
  /**
   * ★페이지 번호로 건너뛰기★ (2026-09-12 사장님: «개인랭킹은 페이지로 만들고싶어»).
   *
   * 0 이면 1페이지(1~20위), 20 이면 2페이지다. 주면 ★커서를 안 쓰고★ 그 자리에서
   * `size` 줄을 떠 오고, «모두 몇 줄인가»(`total`)도 같이 센다 — 페이지 단추를 그리려면
   * 그 값이 있어야 한다. 안 주면(`null`) 옛 커서 방식 그대로다 (`CLAUDE.md` 1-4).
   *
   * 줄 차례가 `score desc, leaguePlayerId asc` 로 ★한 가지로 정해져 있어★ 자리로 떠도
   * 커서로 떠도 같은 줄이 나온다. 그래서 등수는 `offset + 1` 로 바로 안다 — 셈이 하나 준다.
   */
  offset: number | null = null,
): Promise<(CursorPage<PlayerRankRow> & { total?: number }) | null> {
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { id: true, category: true },
  })
  if (!league) return null
  /* ★스나·라플을 섞어 점수 순 한 줄★ (2026-09-10 · 사장님 확정). 무기별 등수(`scoreRank`)는 상세 화면 몫이다.
     ★무기 칩은 「거르개」지 「다른 순위」가 아니다★ (2026-09-11 사장님) — 래더는 스나·라플 점수를 합친 하나뿐이고
     순위는 그 하나로 매긴다. 무기마다 다시 줄 세우면 통합 1등 스나와 스나 탭 1등이 달라진다 (실측: lximmore vs 모어젤) */
  const where = {
    weapon: onlyWeapon === null ? { not: null } : onlyWeapon,
    score: { not: null },
    /**
     * ★적게 뛴 선수는 개인랭킹에 안 올린다★ (2026-09-12 사장님: «판수 적은데 상위권인 애들이 너무 많아»).
     * 조절판에서 15판으로 고르셨다. 점수 자체는 그대로 계산되고 ★줄 세우기에서만 뺀다★ —
     * 선수 페이지에는 점수가 그대로 뜬다. 0 으로 두면 규칙이 꺼진다 (CLAUDE.md 1-4).
     */
    ...(RANK_MIN_GAMES > 0 ? { games: { gte: RANK_MIN_GAMES } } : {}),
    /* 구간 고르개 — 안 고르면 칸을 아예 안 넣는다 (homeTier 가 빈 줄도 전체에는 남는다) */
    ...(onlyTier === null ? {} : { homeTier: onlyTier }),
    leaguePlayer: { leagueId, placement: false },
  }
  const SELECT = {
        leaguePlayerId: true,
        weapon: true,
        score: true,
        scoreRank: true,
        hex: true,
        games: true,
        /* ★인식표★ 가 쓰는 구간 — 가장 많이 뛴 티어 (2026-09-11 사장님) */
        homeTier: true,
        leaguePlayer: {
          select: {
            rating: true,
            activityPenalty: true,
            win: true,
            lose: true,
            kill: true,
            death: true,
            player: { select: PLAYER_SUMMARY_SELECT },
            clan: { select: CLAN_SUMMARY_SELECT },
            /* ★주무기 줄★ — 랭킹의 승률·킬뎃은 통합이 아니라 «그 선수 주무기» 다 (2026-09-11 사장님) */
            weaponStats: { select: { weapon: true, win: true, lose: true, kill: true, death: true, games: true, isMain: true } },
          },
        },
  } as const

  /* ★자리로 건너뛰는 길★ (페이지 번호) — 커서를 안 쓴다 */
  const byOffset = offset !== null
  const total = byOffset ? await prisma.leaguePlayerHex.count({ where }) : undefined
  const page = byOffset
    ? {
        items: (await prisma.leaguePlayerHex.findMany({
          where,
          skip: offset,
          take: size,
          orderBy: [...SCORE_ORDER],
          select: SELECT,
        })) as unknown as ScoreRankRow[],
        /* 페이지 단추가 앞뒤를 정하니 커서는 안 쓴다 — 칸은 계약대로 채운다 */
        cursor: { prev: null, next: null },
      }
    : await cursorPage<ScoreRankRow>({
        cursor,
        size,
        orderBy: [...SCORE_ORDER],
        reversedOrderBy: [...SCORE_ORDER_REVERSED],
        idOf: (row) => row.leaguePlayerId,
        fetch: (args) =>
          prisma.leaguePlayerHex.findMany({
            where,
            take: args.take,
            orderBy: args.orderBy as never,
            ...(args.cursor ? { cursor: { leaguePlayerId: args.cursor.id }, skip: args.skip } : {}),
            select: SELECT,
          }) as unknown as Promise<ScoreRankRow[]>,
      })
  /**
   * ★대표 숫자는 「그 선수 구간」 것★ (2026-09-11 사장님).
   *
   * > «승률도 자기가 소속된 구간의 승률을 대표 승률로 적으라고 했는데»
   *
   * 선수 페이지 머리 카드는 이미 구간 기준인데 랭킹만 통합이라 두 화면이 갈렸다
   * (실측 lximmore — 선수 페이지 ASTRA 48.0%, 랭킹 51.4%). 여기서 맞춘다.
   * 한 페이지를 ★한 번에★ 읽는다 (줄마다 부르면 20번이 된다).
   */
  const tierStats = await rankTierStatsOf(leagueId, page.items.map((row) => row.leaguePlayer.player.id))

  const first = page.items[0]
  /* 자리로 떠 왔으면 등수는 이미 안다 — 세러 가지 않는다 */
  const startRank = byOffset
    ? (offset as number) + 1
    : first && first.score !== null
      ? (await prisma.leaguePlayerHex.count({
          where: {
            ...where,
            OR: [
              { score: { gt: first.score } },
              { score: first.score, leaguePlayerId: { lt: first.leaguePlayerId } },
            ],
          },
        })) + 1
      : 1
  return {
    cursor: page.cursor,
    ...(total === undefined ? {} : { total }),
    items: page.items.map((row, index) => {
      /* ⚠ 2026-09-11 되돌림 — 접어 둔 scoreRank 는 ★무기 안에서의 등수★ 라, 스나·라플을 섞은 이 목록에
         그대로 쓰면 «1위» 가 둘이 된다 (실측: starry 1위 · lximmore 1위). 섞은 목록의 등수는 ★줄 순서★ 다.
         띠에 뜨는 무기별 등수와는 뜻이 다르다 — 구간별 랭킹 개편 때 하나로 맞춘다 (ORDERS 맨 위 칸) */
      const rank = startRank + index
      const lp = row.leaguePlayer
      /* ★대표 숫자는 주무기 것★ (2026-09-11 사장님: «해당 선수 주무기 사용한 개인 승률과 킬데스»).
         주무기는 여섯 축을 잰 무기(hex.weapon)를 먼저 본다 — 없으면 isMain, 그것도 없으면 많이 뛴 쪽.
         그 무기 줄이 없으면 통합으로 떨어진다 (지어내지 않는다) */
      const ws = lp.weaponStats ?? []
      const mine =
        ws.find((w) => w.weapon === row.weapon) ??
        ws.find((w) => w.isMain) ??
        [...ws].sort((a, b) => b.games - a.games)[0] ??
        null
      /**
       * ★승률 = 내 구간 승률★ · ★킬뎃 = 내 구간 + 내 무기★ (2026-09-11 사장님).
       *
       * 내 구간은 ★가장 많이 뛴 티어★(`homeTier`) 다. 아직 안 재졌거나 그 구간 판이 없으면
       * ★통합으로 떨어진다★ — 빈 칸을 만들지 않고, 지어내지도 않는다.
       *
       * ⚠ 옛 판(통합 승률 + 무기별 전 구간 킬뎃)은 아래 스위치로 돌아간다 (`CLAUDE.md` 1-4).
       */
      const home = row.homeTier ?? null
      const tier = RANK_STATS_BY_HOME_TIER && home !== null ? tierStats.get(lp.player.id)?.get(home) : undefined
      const slice = weaponSliceOf(tier, (row.weapon === 0 || row.weapon === 1 ? row.weapon : null))
      const win = tier && tier.games > 0 ? tier.win : lp.win
      const lose = tier && tier.games > 0 ? tier.lose : lp.lose
      /* 그 구간에서 그 무기로 뛴 판이 없으면 → 그 구간 전체 → 그래도 없으면 통합 */
      const kill = slice.games > 0 ? slice.kill : tier && tier.knownGames > 0 ? tier.kill : mine ? mine.kill : lp.kill
      const death = slice.games > 0 ? slice.death : tier && tier.knownGames > 0 ? tier.death : mine ? mine.death : lp.death
      const games = slice.games > 0 ? slice.games : tier && tier.knownGames > 0 ? tier.knownGames : mine ? mine.games : row.games
      return {
        rank,
        league_player_id: row.leaguePlayerId,
        player: toPlayerSummary(lp.player),
        clan: toClanSummaryOrNull(lp.clan),
        win,
        lose,
        win_rate: winRate(win, lose),
        /* ★10판 미만이라고 감추지 않는다★ (2026-09-11 사장님). 옛 판: cumulativeKdRate(league, …, rank) */
        kd_rate: kill + death > 0 ? kdRate(kill, death) : null,
        kill_per_match: killPerMatch(kill, games),
        rating: lp.rating,
        activity_penalty: lp.activityPenalty ?? 0,
        home_tier: row.homeTier ?? null,
        weapon: 'all' as const,
        score: row.score,
        score_weapon: row.weapon === 0 || row.weapon === 1 ? row.weapon : null,
        hex: row.hex,
      }
    }),
  }
}

const SCORE_ORDER = [{ score: 'desc' as const }, { leaguePlayerId: 'asc' as const }]
const SCORE_ORDER_REVERSED = [{ score: 'asc' as const }, { leaguePlayerId: 'desc' as const }]

interface ScoreRankRow {
  leaguePlayerId: string
  weapon: number | null
  score: number | null
  scoreRank: number | null
  hex: number | null
  games: number
  homeTier: number | null
  leaguePlayer: {
    rating: number
    activityPenalty: number
    win: number
    lose: number
    kill: number
    death: number
    weaponStats?: { weapon: number; win: number; lose: number; kill: number; death: number; games: number; isMain: boolean }[]
    player: { id: string; name: string }
    clan: {
      id: string
      slug: string
      name: string
      markBgUrl: string | null
      markFrontUrl: string | null
      sourceClanId: string | null
    } | null
  }
}
