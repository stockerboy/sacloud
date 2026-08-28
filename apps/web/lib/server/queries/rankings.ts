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
import { MIRROR_ORIGIN } from './publicScope'

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
      // 무소속리그면 누적 킬뎃만 비운다 (D-107). 무기 축과는 다른 규칙이다
      kd_rate: cumulativeKdRate(league, kdRate(row.kill, row.death)),
      kill_per_match: killPerMatch(row.kill, row.knownStatGames),
      /* 통합 래더는 무기 탭에서도 통합 래더 그대로다 (3-B 2번) */
      rating: row.leaguePlayer.rating,
      weapon,
      rating_delta: row.ratingDelta,
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

  /* 래더에 반영된 경기 중 가장 최근 것 (`ladderMatchWhere()` 와 같은 조건 — D-164).
     `@@index([leagueId, startAt desc])` 를 그대로 탄다 */
  const latest = await prisma.match.findFirst({
    where: {
      leagueId,
      OR: [{ redRatingUpdate: { not: null } }, { origin: MIRROR_ORIGIN }],
    },
    orderBy: { startAt: 'desc' },
    select: { startAt: true },
  })
  if (!latest) return empty

  const day = toKstDate(latest.startAt)
  const { from, to } = kstDayRange(day)
  const isToday = day === toKstDate(new Date())

  const weaponCode = weapon === 'all' ? null : RANK_WEAPON_CODE[weapon]

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
       AND (m."redRatingUpdate" IS NOT NULL OR m."origin" = ${MIRROR_ORIGIN})
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
