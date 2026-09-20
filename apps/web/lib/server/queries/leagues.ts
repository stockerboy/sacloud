import { prisma } from '@sacloud/db'
/* 「현재 시즌」 판정은 ★한 곳★ 에만 있다 (`packages/db/ops/season.ts`) */
import { CURRENT_SEASON_ORDER, currentSeasonWhere } from '@sacloud/db/ops'
import {
  killPerMatch,
  kdRate,
  showsTier,
  tierGroupOf,
  winRate,
  type ClanSummary,
  type PlayerSummary,
  type ClanRankRow,
  type PlayerRankHexAxis,
  type League,
  type LeagueClan,
  type LeagueListItem,
  type PlayerRankRow,
  type PlayerLimit,
  type SeasonType,
} from '@sacloud/contract'
import { cursorPage, paginateArray, type CursorPage } from '../cursorPage'
import { toKstIso } from '../format'
import {
  CLAN_SUMMARY_SELECT,
  LEAGUE_SUMMARY_SELECT,
  PLAYER_SUMMARY_SELECT,
  USER_SUMMARY_SELECT,
  toClanSummary,
  toClanSummaryOrNull,
  toLeagueSummary,
  toPlayerSummary,
  toUserSummaryOrNull,
} from '../mappers'
import { cumulativeKdRate } from './visibility'
import { publicOriginWhere } from './publicScope'
import { ladderMatchWhere } from './ladderScope'
/* 화면 표기는 계약이 정한다 — 베타는 `시즌0` (D-178) */
import { CLAN_HEX_V2_CLAN_AXIS_KEYS, hiddenClanSlugsIn, seasonDisplayLabel as seasonLabel } from '@sacloud/contract'
import { SEASON0_FROM, seasonWindowWhere } from './season0Scope'
import { leagueClanHexV2, leagueClanBadges } from './clanHexV2'
import { softFail } from '../softFail'
import { withLadderMatch } from './ladderScope'

/**
 * 리그 · 랭킹 조회.
 *
 * Mock의 `store.ts`와 **같은 결과**를 내야 한다. 정렬·필터·파생값 규칙을 그대로 옮겼다.
 * 다른 점은 데이터를 메모리 배열이 아니라 DB에서 읽는다는 것뿐이다.
 *
 * 정렬에는 항상 **고유 키(id)를 마지막 기준으로** 넣는다.
 * 동점이 흔한 데이터라(래더·승패) 타이브레이커가 없으면 커서 페이지네이션이 흔들린다.
 */

/**
 * 공개 화면에 내보내는 참가 클랜 조건.
 *
 * `Clan.active`는 스키마 주석대로 **삭제 대신 쓰는 값**이다.
 * 경기가 걸려 있어 지울 수 없는 dev 잔존 클랜을 목록·랭킹·집계에서 빼는 데 쓴다.
 * 이걸 반영하지 않으면 "확인된 44개"에 잔존 4개가 섞여 48처럼 보인다 (D-124).
 *
 * ── `expelledAt` 도 함께 본다 (2026-08-30)
 *   추방(등록 해제)된 클랜은 그 리그의 목록·랭킹·개수에서 빠져야 한다.
 *   그런데 이 값은 지금까지 투영 잡만 보고 **공개 질의는 아무도 보지 않았다** —
 *   추방해도 랭킹에 그대로 남아 등록 해제가 되지 않았다.
 *   여기 한 곳에 넣어 목록과 개수가 **같은 조건**을 쓰게 한다 (D-147 과 같은 이유).
 *   **경기 기록은 지우지 않는다.** 순위와 명단에서만 빠진다.
 */
const ACTIVE_CLAN = { clan: { active: true }, expelledAt: null } as const

/**
 * **그 리그에서 볼 수 있는 클랜만** — 감춘 43곳을 뺀다 (O-044 · 2026-09-03).
 *
 * > 사장님: «열산클랜이 SPL에 합류하면 그 열산클랜은 **더 이상 열산클랜이 아니고**
 * >  그 반대도 마찬가지이다»
 *
 * ★감추는 것이지 지우는 것이 아니다.★ 등록행도 경기도 그대로 있고,
 * ★상대 클랜의 킬뎃·승률에는 그 경기가 그대로 들어간다★ (사장님 말씀).
 * 여기서 빠지는 것은 **그 리그의 목록·랭킹에 보이는 자리**뿐이다.
 *
 * 표는 `@sacloud/contract` 의 `CLAN_HIDDEN_IN_LEAGUE` 한 곳에 있다.
 * ⚠ ★이름이 아니라 slug 로 짝짓는다★ — `＃chasepIay`/`＃chaseplay` 처럼 눈으로 못 가리는 이름이 있다.
 */
function activeClanIn(leagueSlug: string) {
  const hidden = hiddenClanSlugsIn(leagueSlug)
  return hidden.length === 0
    ? ACTIVE_CLAN
    : { clan: { active: true, slug: { notIn: [...hidden] } }, expelledAt: null }
}

/**
 * ★이번 시즌 한 판도 안 뛴 클랜은 랭킹에 넣지 않는다★
 * (2026-09-15 사장님: «미활동 클랜 전부 db에서 삭제»).
 *
 * 화면에 ★「기록 없음 · 30.0층」★ 으로만 줄줄이 서 있던 줄들이다.
 * 순위 자리를 차지하면서 보여 줄 것이 없다.
 *
 * ★실측 (2026-09-15 운영)★ — 시즌0(9/3~) 에 한 판도 안 뛴 클랜
 * ```
 * IPL 1곳  ·  LLM 20곳  ·  YSL 249곳 (356곳 중)
 * ```
 * YSL 이 유독 많은 것은 옛 미러(`3rd.supply`)가 9/3 에 얼어붙었기 때문이다.
 *
 * ★지우지도, 도장을 찍지도 않는다★ (`CLAUDE.md` 2장 2번) —
 * `win + lose = 0` 이라는 ★지금 값★ 으로 거른다. 한 판이라도 뛰면 집계가 승패를
 * 채우고 ★저절로 순위에 돌아온다.★ 손댈 것이 없다.
 *
 * ⚠ ★같은 규칙이 `ladders.ts` 에도 있다★ (`HIDE_NO_GAME_CLANS`).
 *   랭킹 표는 이 파일, 래더는 그쪽이다. 끄려면 ★두 곳을 같이★ 끈다.
 */
const HIDE_NO_GAME_CLANS = true

/**
 * ★★클랜랭킹 최소 판수★★ (2026-09-20 사장님)
 *
 * > 「클랜도 마찬가지로 나는 ★판수 없는 클랜 진짜 싫어하는거★ 알지」
 *
 * ── 무엇이 문제였나 (실측 2026-09-20)
 *
 *     SPL    ★4위  <#ever_wC>   2판 · 100%★   ← 두 판 이겨서 4위
 *            ★6위  멘토르        2판 ·   0%★   ← 두 판 지고 6위
 *            아홉 팀 중 ★여섯 팀이 20판 미만★
 *     열산   ★7위  dearblue      6판 · 100%★
 *
 *   ★두 판으로 4위가 되는 것은 랭킹이 아니다.★ 개인 랭킹에는 이미
 *   `RANK_MIN_GAMES = 15` 문턱이 있는데 ★클랜에는 없었다.★
 *
 * ── 왜 20판인가
 *
 *   개인(15판)보다 조금 높다. 클랜전은 ★다섯 명이 함께★ 뛰므로 한 판의 무게가
 *   개인보다 가볍고, 클랜 수가 적어(9~20곳) 문턱이 낮으면 거의 안 걸러진다.
 *
 * ⚠ ★지우는 것이 아니라 랭킹에서만 뺀다★ — 클랜 화면·경기 기록은 그대로다.
 *   한 판이라도 더 뛰면 ★저절로 돌아온다.★ 손댈 것이 없다.
 * ⚠ ★0 으로 두면 문턱이 사라진다★ (`CLAUDE.md` 1-4) — 되돌릴 때 재계산이 없다.
 */
export const CLAN_RANK_MIN_GAMES = 20

/**
 * 랭킹에 올릴 클랜인가.
 *
 * ⚠ 문턱을 켜면 ★승·패 합★ 으로 거른다. 「한 판도 안 뛴 클랜」 규칙(위)을
 *   삼키므로 조건을 따로 두지 않는다 — 20판 문턱이 0판을 이미 막는다.
 */
const PLAYED_THIS_SEASON: { NOT?: { win: number; lose: number } } =
  CLAN_RANK_MIN_GAMES > 0
    ? {}
    : HIDE_NO_GAME_CLANS
      ? { NOT: { win: 0, lose: 0 } }
      : {}

/* -------------------------------- 리그 목록 ------------------------------- */

export async function listLeagues(cursor: string | null, size: number): Promise<CursorPage<LeagueListItem>> {
  const leagues = await prisma.league.findMany({
    // 개발용 시드 리그는 공개 목록에 넣지 않는다 (D-116)
    where: { ...publicOriginWhere() },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      ...LEAGUE_SUMMARY_SELECT,
      createdAt: true,
      owner: { select: USER_SUMMARY_SELECT },
      _count: { select: { clans: { where: ACTIVE_CLAN } } },
      // 목록에 노출되는 대표 클랜 (관측: 3개)
      clans: {
        /* **개수와 같은 조건으로 거른다** (D-147).
           `_count` 는 `ACTIVE_CLAN` 으로 44개를 세는데 이 미리보기에는 필터가 없어서,
           비활성 처리된 개발용 클랜(`real-` 접두 4개)이 공개 리그 목록에 그대로 나왔다.
           세는 집합과 보여 주는 집합이 다르면 안 된다. */
        where: ACTIVE_CLAN,
        take: 3,
        orderBy: { joinedAt: 'asc' },
        select: { clan: { select: CLAN_SUMMARY_SELECT } },
      },
    },
  })

  const rows: LeagueListItem[] = leagues.map((league) => ({
    ...toLeagueSummary(league),
    user: toUserSummaryOrNull(league.owner),
    clan_count: league._count.clans,
    created_at: toKstIso(league.createdAt),
    clans: league.clans.map((entry) => toClanSummary(entry.clan)),
  }))

  // 리그는 소수(관측 4개)라 전량을 읽어도 무리가 없다
  return paginateArray(rows, cursor, size, (item) => item.id)
}

/* --------------------------------- 리그 상세 ------------------------------ */

export async function getLeague(leagueSlug: string): Promise<League | null> {
  const league = await prisma.league.findFirst({
    // 시드 리그는 **없는 것처럼** 다룬다. 숨김이 아니라 404다 (D-116)
    where: { slug: leagueSlug, ...publicOriginWhere() },
    select: {
      ...LEAGUE_SUMMARY_SELECT,
      description: true,
      status: true,
      createdAt: true,
      owner: { select: USER_SUMMARY_SELECT },
      maps: { select: { map: { select: { id: true, name: true } } } },
      playerLimits: { select: { playerCount: true } },
      /* 감춘 클랜(O-044)은 안 센다 — 클랜랭킹 «40곳» 과 같은 수 (QA 교차검토 21) */
      /*
       * ★이번 시즌 뛴 클랜만 센다★ (2026-09-15 QA에서 잡았다).
       *
       *   개인랭킹 머리에 «약 1시간마다 갱신 · ★308개 클랜★» 이라고 적혀 있었다.
       *   그런데 YSL 356곳 중 ★249곳은 이번 시즌 한 판도 안 뛰었다.★
       *   표에서는 그 줄을 이미 뺐는데 숫자만 옛 수를 세고 있었다 —
       *   ★세는 집합과 보여 주는 집합이 달라지면 안 된다★ (바로 위 D-147 과 같은 규칙).
       */
      _count: { select: { clans: { where: { ...activeClanIn(leagueSlug), ...PLAYED_THIS_SEASON } } } },
      /*
       * ★「지금 시즌」은 `status` 가 아니다★ (2026-09-07 · 사장님 결정).
       *
       *   옛 조건 — `status: 'active'` + `number: 'desc'`
       *   `status` 는 ★「아직 종료되지 않았다」★ 라 ★아직 시작도 안 한 다음 시즌★ 도
       *   `active` 다. 그래서 9/7 에 ★Cloud 1★ 이 골라졌다 (운영 실측).
       *
       *   지금 — ★시각이 창 안인 시즌★ (`currentSeasonWhere`). 규칙은 한 곳에만 있다.
       *   10/1 00:00 KST 가 지나면 저절로 Cloud 1 이 된다.
       */
      seasons: {
        where: currentSeasonWhere(),
        orderBy: CURRENT_SEASON_ORDER,
        take: 1,
        select: { number: true, seasonType: true },
      },
    },
  })
  if (!league) return null

  return {
    ...toLeagueSummary(league),
    description: league.description,
    user: toUserSummaryOrNull(league.owner),
    maps: league.maps.map((entry) => entry.map),
    player_limits: league.playerLimits
      .map((entry) => entry.playerCount)
      .sort((a, b) => a - b) as PlayerLimit[],
    clan_count: league._count.clans,
    status: league.status,
    created_at: toKstIso(league.createdAt),
    season: league.seasons[0]?.number ?? 0,
    /* 베타는 내부 번호가 0이다. 화면이 "Season 0"이라고 쓰지 않도록
       표시용 이름을 서버가 만들어서 내려 준다 (D-098) */
    season_type: (league.seasons[0]?.seasonType ?? 'official') as SeasonType,
    season_label: seasonLabel({
      number: league.seasons[0]?.number ?? 0,
      seasonType: league.seasons[0]?.seasonType ?? 'official',
    }),
  }
}

export async function getLeagueIdBySlug(leagueSlug: string): Promise<string | null> {
  const league = await prisma.league.findFirst({
    where: { slug: leagueSlug, ...publicOriginWhere() },
    select: { id: true },
  })
  return league?.id ?? null
}

/**
 * 경로의 리그 식별자를 리그 ID로 바꾼다.
 *
 * **슬러그와 ID를 모두 받는다.** 계약은 랭킹·매치 경로를 `:leagueId`로 적어 두었지만,
 * 화면은 이 자리에 **슬러그를 넣어 호출한다**
 * (`app/league/[leagueSlug]/rank/...`가 URL의 슬러그를 그대로 넘긴다).
 * Mock 핸들러도 둘 다 받아 왔기 때문에 그동안 드러나지 않았다.
 * ID만 받도록 두면 랭킹·기록실이 전부 404가 난다 (실제로 그렇게 났다).
 */
export async function resolveLeagueId(value: string): Promise<string | null> {
  const league = await prisma.league.findFirst({
    // 시드 리그는 여기서 막는다. 리그 스코프 공개 경로가 전부 이 함수를 지나므로
    // 한 곳만 막으면 랭킹·기록실·매치 상세가 함께 닫힌다 (D-116)
    where: { OR: [{ id: value }, { slug: value }], ...publicOriginWhere() },
    select: { id: true },
  })
  return league?.id ?? null
}

export async function isSlugTaken(slug: string): Promise<boolean> {
  const league = await prisma.league.findUnique({ where: { slug }, select: { id: true } })
  return league !== null
}

/* ----------------------------- 리그 참여 클랜 ----------------------------- */

const LEAGUE_CLAN_ORDER = [{ division: 'asc' }, { rating: 'desc' }, { id: 'asc' }] as const
const LEAGUE_CLAN_ORDER_REVERSED = [
  { division: 'desc' },
  { rating: 'asc' },
  { id: 'desc' },
] as const

/**
 * ★클랜별 «내 구간 전적»★ — 같은 티어끼리 붙은 판만 센다 (2026-09-11 사장님).
 * 클랜 상세의 «구간 승률»(상대전적을 상대 티어로 접는 것)과 같은 답이 나온다.
 * 리그 한 번에 한 질의로 접는다 — 줄마다 다시 세면 42줄에 42번 돈다.
 */
async function tierRecordsOf(leagueId: string): Promise<Map<string, { win: number; lose: number }>> {
  const [matches, clans] = await Promise.all([
    prisma.match.findMany({
      where: withLadderMatch({ leagueId, ...seasonWindowWhere() }),
      select: { redLeagueClanId: true, blueLeagueClanId: true, winnerSide: true },
    }),
    prisma.leagueClan.findMany({ where: { leagueId }, select: { id: true, division: true } }),
  ])
  const divisionOf = new Map(clans.map((c) => [c.id, c.division]))
  const out = new Map<string, { win: number; lose: number }>()
  const add = (id: string, won: boolean) => {
    const acc = out.get(id) ?? { win: 0, lose: 0 }
    if (won) acc.win += 1
    else acc.lose += 1
    out.set(id, acc)
  }
  for (const m of matches) {
    const rd = divisionOf.get(m.redLeagueClanId)
    const bd = divisionOf.get(m.blueLeagueClanId)
    /* 티어를 모르거나 서로 다른 티어면 «내 구간» 이 아니다 */
    if (rd === undefined || bd === undefined || rd !== bd) continue
    add(m.redLeagueClanId, m.winnerSide === 'red')
    add(m.blueLeagueClanId, m.winnerSide === 'blue')
  }
  return out
}

/**
 * ★주요멤버 다섯★ — 여러 클랜을 한 질의로 (2026-09-16 밤 사장님).
 *
 * 셈은 클랜 상세(`records.ts` 의 `mainLineupOf`)와 ★똑같다★ —
 * 점수 순 라플 넷 + 스나 하나, 무기나 점수를 모르면 안 넣는다 (D-106).
 *
 * 다른 것은 ★왜복 하나★ 라는 점뿐이다 — 목록은 스무 줄이라
 * 줄마다 부르면 스무 번이 된다.
 */
/**
 * ★라이벌★ — 그 리그 클랜들이 ★제일 많이 붙은 상대★ 를 한 번에 (2026-09-17 사장님).
 *
 * ── 왜 한 번에 가져오나
 *   `clanHeadToHead()` 는 ★클랜 하나씩★ 이다. 랭킹 스무 줄에 그걸 쓰면 왕복이 스무 번이다.
 *   `mainMembersOf` 와 같은 결로 ★질의 하나★ 로 끝낸다.
 *
 * ── 셈
 *   경기 한 판을 ★양쪽에서 한 번씩★ 센다 (`UNION ALL` 로 red↔blue 를 뒤집어 붙인다).
 *   그러면 「나 → 상대」 짝이 생기고, 짝마다 세어 클랜별 제일 많은 하나만 남긴다.
 *   판 수가 같으면 ★상대 id 가 작은 쪽★ 으로 못 박는다 — 새로고침마다 라이벌이 바뀌면 안 된다.
 *
 * ⚠ 자기 자신은 뺀다. 같은 클랜끼리 붙은 판이 자료에 있을 수 있다.
 */
async function rivalsOf(
  leagueId: string,
  from: Date,
): Promise<Map<string, { leagueClanId: string; games: number }>> {
  const out = new Map<string, { leagueClanId: string; games: number }>()
  const rows =
    (await softFail('clan-rival', null, { leagueId })(
      prisma.$queryRaw<{ me: string; foe: string; games: bigint }[]>`
        WITH pairs AS (
          SELECT "redLeagueClanId" AS me, "blueLeagueClanId" AS foe
            FROM "Match"
           WHERE "leagueId" = ${leagueId} AND "supersededAt" IS NULL AND "startAt" >= ${from}
             AND "redLeagueClanId" IS NOT NULL AND "blueLeagueClanId" IS NOT NULL
          UNION ALL
          SELECT "blueLeagueClanId" AS me, "redLeagueClanId" AS foe
            FROM "Match"
           WHERE "leagueId" = ${leagueId} AND "supersededAt" IS NULL AND "startAt" >= ${from}
             AND "redLeagueClanId" IS NOT NULL AND "blueLeagueClanId" IS NOT NULL
        ),
        counted AS (
          SELECT me, foe, COUNT(*) AS games
            FROM pairs
           WHERE me <> foe
           GROUP BY me, foe
        ),
        ranked AS (
          SELECT me, foe, games,
                 ROW_NUMBER() OVER (PARTITION BY me ORDER BY games DESC, foe ASC) AS rn
            FROM counted
        )
        SELECT me, foe, games FROM ranked WHERE rn = 1`,
    )) ?? []
  for (const row of rows) {
    out.set(row.me, { leagueClanId: row.foe, games: Number(row.games) })
  }
  return out
}

async function mainMembersOf(
  leagueId: string,
  clanIds: readonly string[],
): Promise<Map<string, { player: ReturnType<typeof toPlayerSummary>; weapon: 0 | 1; score: number | null }[]>> {
  const out = new Map<string, { player: ReturnType<typeof toPlayerSummary>; weapon: 0 | 1; score: number | null }[]>()
  if (clanIds.length === 0) return out
  const rows =
    (await softFail('clan-main-members', null, { leagueId })(
      prisma.leaguePlayerHex.findMany({
        where: {
          score: { not: null },
          weapon: { not: null },
          leaguePlayer: { leagueId, clanId: { in: [...clanIds] }, placement: false },
        },
        orderBy: [{ score: 'desc' }, { leaguePlayerId: 'asc' }],
        select: {
          weapon: true,
          score: true,
          leaguePlayer: { select: { clanId: true, player: { select: PLAYER_SUMMARY_SELECT } } },
        },
      }),
    )) ?? []
  const byClan = new Map<string, typeof rows>()
  for (const row of rows) {
    const clanId = row.leaguePlayer.clanId
    if (clanId === null) continue
    const list = byClan.get(clanId) ?? []
    list.push(row)
    byClan.set(clanId, list)
  }
  for (const [clanId, list] of byClan) {
    const pick = (weapon: 0 | 1, take: number) =>
      list
        .filter((row) => row.weapon === weapon)
        .slice(0, take)
        .map((row) => ({ player: toPlayerSummary(row.leaguePlayer.player), weapon, score: row.score }))
    /* ★라플 넷이 먼저, 스나가 맨 아래★ — 사장님이 차례까지 정하셨다 */
    out.set(clanId, [...pick(0, 4), ...pick(1, 1)])
  }
  return out
}

export async function getLeagueClans(
  leagueSlug: string,
  cursor: string | null,
  size: number,
): Promise<CursorPage<LeagueClan> | null> {
  const leagueId = await getLeagueIdBySlug(leagueSlug)
  if (!leagueId) return null

  return cursorPage<LeagueClan>({
    cursor,
    size,
    orderBy: [...LEAGUE_CLAN_ORDER],
    reversedOrderBy: [...LEAGUE_CLAN_ORDER_REVERSED],
    idOf: (row) => row.id,
    fetch: async (args) => {
      const tierRecords = await tierRecordsOf(leagueId)
      const rows = await prisma.leagueClan.findMany({
        /*
         * ⚠ ★여기서는 「이번 시즌 0판」을 거르지 않는다★ (2026-09-15).
         *   이 끝점은 랭킹 표만 쓰는 것이 아니다 — ★리그 설정(관리자)★ 과 알 갤러리도
         *   같은 곳을 읽는다. 관리자 화면에서 안 뛴 클랜이 사라지면 관리를 못 한다.
         *   거르는 것은 ★랭킹 표 쪽(`ClanDirectory`)★ 이 한다.
         */
        where: { leagueId, ...activeClanIn(leagueSlug) },
        take: args.take,
        orderBy: args.orderBy as never,
        ...(args.cursor ? { cursor: args.cursor, skip: args.skip } : {}),
        select: {
          id: true,
          leagueId: true,
          rating: true,
          division: true,
          win: true,
          lose: true,
          placement: true,
          status: true,
          joinedAt: true,
          clan: { select: CLAN_SUMMARY_SELECT },
        },
      })
      /* ★뱃지★ (2026-09-14) — 분포를 한 번만 읽는다. 실패해도 목록은 그대로 나간다 */
      const badgeOf =
        (await softFail('league-clan-badge', null, { leagueId })(
          leagueClanBadges({
            leagueId,
            divisionOf: new Map(rows.map((row) => [row.id, row.division])),
          }),
        )) ?? new Map<string, string[]>()
      /* ★주요멤버★ — 빈칸을 메운다 (2026-09-16 밤 사장님) */
      const mainOf = await mainMembersOf(leagueId, rows.map((row) => row.clan.id))
      /* ★라이벌★ — 제일 많이 붙은 상대 (2026-09-17 사장님). 질의 하나로 리그 전체를 가져온다 */
      const rivalOf = await rivalsOf(leagueId, SEASON0_FROM)
      const clanById = new Map(rows.map((row) => [row.id, row.clan]))

      return rows.map((row) => {
        const tier = tierRecords.get(row.id) ?? { win: 0, lose: 0 }
        return {
        id: row.id,
        league_id: row.leagueId,
        clan: toClanSummary(row.clan),
        rating: row.rating,
        division: row.division,
        win: row.win,
        lose: row.lose,
        win_rate: winRate(row.win, row.lose),
        tier_win: tier.win,
        tier_lose: tier.lose,
        tier_win_rate: tier.win + tier.lose === 0 ? null : winRate(tier.win, tier.lose),
        badges: badgeOf.get(row.id) ?? [],
        placement: row.placement,
        status: row.status,
        joined_at: toKstIso(row.joinedAt),
        main_members: mainOf.get(row.clan.id) ?? [],
        rival: (() => {
          const hit = rivalOf.get(row.id)
          if (hit === undefined) return null
          const foe = clanById.get(hit.leagueClanId)
          /* 상대가 이 쪽에 없으면(탈퇴·다른 부리그) 안 그린다 — 이름을 지어내지 않는다 */
          if (foe === undefined) return null
          return { clan: toClanSummary(foe), games: hit.games }
        })(),
        }
      })
    },
  })
}

/* ---------------------------------- 랭킹 --------------------------------- */

/**
 * 랭킹은 **배치고사가 끝난 대상만** 노출한다(관측).
 * 원본은 1시간 주기 배치로 만들지만 여기서는 요청 시 정렬한다.
 * 배치(`RankSnapshot`) 재현은 Phase 9에서 다룬다.
 */
/** ★클랜 랭킹★ 의 줄 세우기 — 클랜은 그대로 래더 순이다 */
const RANK_ORDER = [{ rating: 'desc' }, { id: 'asc' }] as const
const RANK_ORDER_REVERSED = [{ rating: 'asc' }, { id: 'desc' }] as const

/*
 * ★개인 랭킹은 점수 래더 순★ (2026-09-18 사장님: «래더점수도 이걸로 계산해»).
 *
 * `scoreRating` 은 ★경기당 평균 점수 × 100★ 이고 ★상위권 보정이 이미 들어 있다★.
 *
 * ⚠ ★아직 안 잰 선수(`null`)는 뒤로 보낸다★ — 0점으로 우기지 않는다 (D-106).
 *   그 뒤는 ★옛 Elo 래더★ 로 줄을 세운다. 재계산 전에도 목록이 안 무너진다.
 * ⚠ ★옛 정렬을 지우지 않는다★ (`CLAUDE.md` 1-4) — `PLAYER_RANK_ORDER_V1` 이 그것이다.
 */
const PLAYER_RANK_ORDER = [
  { scoreRating: { sort: 'desc', nulls: 'last' } },
  { rating: 'desc' },
  { id: 'asc' },
] as const
const PLAYER_RANK_ORDER_REVERSED = [
  { scoreRating: { sort: 'asc', nulls: 'last' } },
  { rating: 'asc' },
  { id: 'desc' },
] as const

/** ⚠ 옛 개인 정렬 — 2026-09-18 까지 쓰던 판 (Elo 래더만 봤다) */
export const PLAYER_RANK_ORDER_V1 = [{ rating: 'desc' }, { id: 'asc' }] as const

/**
 * 개인랭킹 **모집단** — 목록 · 순위 계산 · 메인 TOP3 가 같은 조건을 써야 한다.
 *
 * 리그 안의 선수는 **전원** 들어간다 (D-107). 클랜으로 거르지 않는다 —
 * 무소속 선수는 `clanId` 가 null 이라 클랜 조건을 걸면 통째로 빠진다.
 */
function playerRankWhere(leagueId: string): { leagueId: string; placement: boolean } {
  return { leagueId, placement: false }
}

/**
 * 클랜랭킹에서 **부리그를 나누지 않는 축**의 정렬 (2026-09-01 사용자 지시).
 *
 * ```
 * 공식리그(SPL)   부리그를 섞어 래더 순으로 한 줄     RANK_ORDER 그대로
 * 무소속리그(IPL) 티어를 유지한 채 한 줄 + 티어 경계선 TIER_ORDER
 * ```
 *
 * 티어는 운영자가 정하는 값이라 래더로 자동 정렬되지 않는다 (D-104).
 * 그래서 IPL 은 **티어 오름차순 → 그 안에서 래더 내림차순**이다.
 * `id` 는 언제나 마지막 타이브레이커다 — 없으면 커서 페이지네이션이 흔들린다.
 */
const TIER_ORDER = [{ division: 'asc' }, { rating: 'desc' }, { id: 'asc' }] as const
const TIER_ORDER_REVERSED = [{ division: 'desc' }, { rating: 'asc' }, { id: 'desc' }] as const

/** 티어를 나누지 않고 한 줄로 세울 때 쓰는 표시값 (API `division=0`) */
export const ALL_DIVISIONS = 0

/**
 * 전체 보기(`division=0`)에서 **티어 우선**으로 정렬할 것인가 (2026-09-02 지시 #24 ⑤).
 *
 * > 사장님: "IPL 클랜 순위는 점수를 많이 받는다고 해도 **티어표를 넘나들 수는 없다.**
 * >  1티어 순위가 먼저 보이고 경계 긋고 2티어 순위가 보이고 … 티어별로 1,2,3,4… 등이 있는 것이다."
 *
 * 그래서 **켜 둔다.** 티어 우선 → 티어 안에서 래더 순 → 티어마다 순위가 1 부터 (⑤ 커밋).
 *
 * ⚠ 옛 서술 (같은 날 · 지시 #9 후속 · #23 총괄 판단) — 검수 #8 의 «점수가 섞여 보인다» 때문에
 *   래더 순(`false`)으로 뒀었다. 사장님이 티어를 넘나들지 않는 순위가 맞다고 정했다.
 *   `false` 로 하면 그 래더 순(경계선 없음 · 행마다 티어 라벨)이 돌아온다 —
 *   화면의 `ClanRankSplit` 에 같은 이름 스위치가 있어 함께 바꿔야 한다.
 * 타입을 `boolean` 으로 넓혀 둔 이유는 리터럴로 좁히면 `&&` 뒤가 «닿을 수 없는 코드» 가 되기 때문이다.
 */
/**
 * ⚠ ★2026-09-13 — 두 번 바뀐 자리다★
 *   ① «challenger1,2 경계 없애줘» → false (경계선이 통째로 사라짐)
 *   ② «Astra 는 따로 둬 챌린저1,2구분만 없애는거야» → 다시 true
 *
 *   ①은 ASTRA 경계까지 같이 지웠다. 사장님이 원한 것은 ★챌린저 둘만★ 합치는 것이라
 *   되돌리고, 대신 ★구간 묶음★ 으로 줄 세운다 (아래 `CHALLENGER_MERGED`).
 */
export const TIER_FIRST_SORT: boolean = true

/**
 * ★CHALLENGER 1·2 를 한 덩어리로 줄 세운다★ (2026-09-13 사장님).
 *
 * ⚠ 이름만 «CHALLENGER» 로 합치고 순서를 그대로 두면 ★래더가 위아래로 섞여 보인다★ —
 *   CH1 2,777점이 CH2 3,033점 위에 온다. 같은 이름인데 순서가 어긋나면 표가 고장 나 보인다.
 *   그래서 ★정렬도 같이★ 합친다: ASTRA 먼저, 그 다음 CHALLENGER 전부를 래더 순으로.
 *
 * ── 왜 한 번에 다 떠 오나
 *   «구간 묶음» 은 계산해서 만드는 값이라 DB 정렬 칸으로 못 쓴다
 *   (`division` 은 1·2·3 그대로 두어야 한다 — 승강과 구간 승률이 그 값을 쓴다).
 *   IPL 클랜은 ★43곳★ 이라 한 번에 떠서 여기서 줄 세우는 편이 정확하고 싸다.
 *   `MERGE_CAP` 을 넘기면 ★옛 방식(티어 우선)으로 그냥 돌아간다★ — 큰 리그가 생겨도 안 터진다.
 *
 * `false` 로 두면 CHALLENGER 1·2 가 다시 따로 줄 선다.
 */
export const CHALLENGER_MERGED: boolean = true
const MERGE_CAP = 300

/**
 * 페이지 첫 행의 순위를 구한다.
 *
 * 커서 페이지네이션은 offset을 모르기 때문에, 정렬 기준상 **앞에 오는 행의 개수**를 세서
 * 순위를 만든다. 정렬이 `rating desc, id asc`이므로
 * "래더가 더 높거나 / 같은데 id가 앞선" 행의 수 + 1이 순위다.
 *
 * `division <= 0`(전체)이면 부리그 조건을 빼고 센다. 이때 정렬이 티어 축이면
 * "앞에 오는 행" 의 뜻도 함께 바뀐다 — **목록과 같은 정렬로 세지 않으면 순위가 어긋난다.**
 */
async function rankOfFirstClan(
  listWhere: Record<string, unknown>,
  first: { rating: number; id: string; division: number } | undefined,
  byTier: boolean,
): Promise<number> {
  if (!first) return 1
  const ahead = byTier
    ? [
        { division: { lt: first.division } },
        { division: first.division, rating: { gt: first.rating } },
        { division: first.division, rating: first.rating, id: { lt: first.id } },
      ]
    : [{ rating: { gt: first.rating } }, { rating: first.rating, id: { lt: first.id } }]

  const before = await prisma.leagueClan.count({
    /*
     * ★★목록이 쓰는 조건을 그대로 받아 센다★★ (2026-09-21 · 비판 검수가 짚은 자리)
     *
     * ── 여기서 조건을 다시 짜다가 ★진짜 어긋났다★
     *
     *   옛 판은 `ACTIVE_CLAN` 하나만 걸고 다시 짰다. 그 사이 목록에는
     *   ★조건 셋★ 이 더 붙었는데 여기는 안 따라왔다 —
     *     ① `activeClanIn(slug)` 의 ★그 리그에서 감춘 클랜★ (O-044 · 43곳)
     *     ② `PLAYED_THIS_SEASON` ★이번 시즌 한 판도 안 뛴 클랜★
     *     ③ `win + lose >= CLAN_RANK_MIN_GAMES` ★판수 문턱★
     *
     *   ★실측 (2026-09-21 운영)★ — 열산리그 클랜랭킹
     *   ```
     *   1쪽  1 ~ 20위
     *   2쪽  ★59위★        ← 21위여야 한다. 38곳이 순위에만 더해졌다
     *   ```
     *   IPL·PL 은 마침 어긋나지 않아 ★아무도 못 보고 지나갔다.★
     *
     * ── 그래서 조건을 ★다시 짜지 않는다.★ 목록이 쓰던 것을 그대로 받는다.
     *   앞으로 목록에 조건이 붙어도 여기가 저절로 따라온다 —
     *   ★두 벌을 손으로 맞추는 일을 없애는 것이 이 고침의 전부다.★
     */
    where: { ...listWhere, OR: ahead },
  })
  return before + 1
}

async function rankOfFirstPlayer(
  leagueId: string,
  first: { rating: number; id: string } | undefined,
): Promise<number> {
  if (!first) return 1
  const before = await prisma.leaguePlayer.count({
    /* 여기에는 `ACTIVE_CLAN` 을 넣지 않는다. 개인 랭킹 목록(`getPlayerRanks`)이
       클랜으로 거르지 않기 때문이다 — 리그 안의 선수는 **전원** 들어간다 (D-107).
       무소속 선수는 `clanId` 가 null 이라 클랜 조건을 걸면 통째로 빠진다. */
    where: {
      ...playerRankWhere(leagueId),
      OR: [{ rating: { gt: first.rating } }, { rating: first.rating, id: { lt: first.id } }],
    },
  })
  return before + 1
}

/**
 * 클랜랭킹.
 *
 * `division >= 1` 이면 예전 그대로 **그 부리그만** 준다 (부리그 탭 화면이 쓴다).
 *
 * ── `division <= 0` = 부리그를 나누지 않는다 (2026-09-01 사용자 지시)
 *   *"SPL은 1,2부 나누지 말고 그냥 순위대로 배열하고, IPL도 세로로 일열 배열하는데
 *     우리가 정해놨던 티어별로 선을 그어서 나눠줘"*
 *
 *   같은 「전체」인데 정렬이 둘로 갈린다 —
 *   공식리그는 부리그를 **섞어** 래더 순, 무소속리그는 티어를 **유지**한 채 래더 순이다.
 *   화면이 티어 경계선을 그릴 수 있도록 `division` 값은 행마다 그대로 나간다.
 *
 *   **없던 데이터를 만들지 않는다.** 걸러 내는 조건(배치고사 · `ACTIVE_CLAN`)은 그대로다.
 */
/**
 * ★ASTRA 먼저, 그 다음 CHALLENGER 전부를 래더 순으로★ (2026-09-13 사장님).
 *
 * 한 번에 떠서 여기서 줄 세운다. `MERGE_CAP` 을 넘기면 `null` 을 돌려주고
 * ★옛 길(쪽 나눔)로 그냥 내려간다★ — 큰 리그가 생겨도 안 터진다.
 */
async function mergedChallengerPage(where: Record<string, unknown>) {
  const all = await prisma.leagueClan.findMany({
    where: where as never,
    take: MERGE_CAP + 1,
    orderBy: [...RANK_ORDER],
    select: {
      id: true,
      rating: true,
      division: true,
      win: true,
      lose: true,
      clan: { select: { ...CLAN_SUMMARY_SELECT, category: true } },
    },
  })
  if (all.length > MERGE_CAP) return null
  all.sort(
    (a, b) =>
      tierGroupOf(a.division) - tierGroupOf(b.division) ||
      b.rating - a.rating ||
      a.id.localeCompare(b.id),
  )
  return { items: all, cursor: { prev: null, next: null } }
}

export async function getClanRanks(
  leagueId: string,
  division: number,
  cursor: string | null,
  size: number,
): Promise<CursorPage<ClanRankRow> | null> {
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { id: true, slug: true, category: true },
  })
  if (!league) return null

  /* 전체 보기에서만 티어 축을 쓴다. 부리그 탭(division >= 1)은 예전 정렬 그대로다.

     ⚠ 2026-09-02 (지시 #9 후속 · D-265 ③) — **부리그를 화면에 내지 않는 리그는 티어 축도 쓰지 않는다.**
       사장님 뜻이 «1·2부 구분을 없앤다» 라서, 경계선만 지우고 티어 우선 정렬을 남기면
       순위는 그대로인데 래더 숫자가 위아래로 섞여 보인다(2티어 1,100점 위에 1티어 900점).
       스위치는 계약(`leagueScreen`)의 것과 같다 — 화면과 서버가 한 표를 본다.
       스위치를 끄면(`nolink: WITH_LADDER`) 아래가 예전처럼 티어 우선으로 돌아온다.
       `division` 값·API 모양·`rankOfFirstClan` 은 그대로다 — 후자는 같은 `byTier` 를 받는다. */
  const byTier =
    division <= 0 && league.category === 'independent' && showsTier(league.slug) && TIER_FIRST_SORT
  const order = byTier ? TIER_ORDER : RANK_ORDER
  const orderReversed = byTier ? TIER_ORDER_REVERSED : RANK_ORDER_REVERSED

  /*
   * ★★판수가 모자란 클랜은 랭킹에서 뺀다★★ (2026-09-20 사장님:
   *   「나는 ★판수 없는 클랜 진짜 싫어하는거★ 알지」)
   *
   *   실측 — SPL 아홉 팀 중 ★여섯 팀이 20판 미만★ 이었고,
   *   ★두 판 이겨서 4위★ · ★두 판 지고 6위★ 가 나란히 서 있었다.
   *
   * ⚠ ★`win + lose` 는 Prisma 의 `where` 로 못 거른다★ — 칸끼리 더하는 조건이
   *   없다. `LeagueClan` 에는 `games` 칸도 없다. 그래서 ★id 를 먼저 골라★ 넣는다.
   *   클랜은 리그마다 수십 곳이라 이 왕복이 싸다.
   * ⚠ 문턱이 0 이면 질의를 아예 안 한다 — 되돌릴 때 값이 안 든다.
   */
  const enoughIds =
    CLAN_RANK_MIN_GAMES > 0
      ? (
          await prisma.$queryRaw<{ id: string }[]>`
            SELECT "id" FROM "LeagueClan"
             WHERE "leagueId" = ${leagueId}
               AND "win" + "lose" >= ${CLAN_RANK_MIN_GAMES}
          `
        ).map((r) => r.id)
      : null

  const where = {
    leagueId,
    ...(division > 0 ? { division } : {}),
    placement: false,
    /* 감춘 클랜은 랭킹에도 안 나온다 (O-044). `league.slug` 는 위에서 이미 읽었다 */
    ...activeClanIn(league.slug),
    /* 이번 시즌 한 판도 안 뛴 클랜도 뺀다 (2026-09-15) */
    ...PLAYED_THIS_SEASON,
    ...(enoughIds === null ? {} : { id: { in: enoughIds } }),
  }

  /*
   * ★CHALLENGER 를 한 덩어리로★ (2026-09-13) — 한 번에 떠서 여기서 줄 세운다.
   * «구간 묶음» 은 계산해서 만드는 값이라 DB 정렬 칸으로 못 쓴다. IPL 은 43곳이라
   * 한 번에 떠서 줄 세우는 편이 정확하고 싸다. 쪽 단추가 없어지는 대신 ★순서가 맞는다.★
   */
  const merged =
    byTier && CHALLENGER_MERGED
      ? await mergedChallengerPage(where)
      : null

  const page = merged ?? await cursorPage<{
    id: string
    rating: number
    division: number
    win: number
    lose: number
    clan: {
      id: string
      slug: string
      name: string
      markBgUrl: string | null
      markFrontUrl: string | null
      category: string
    }
  }>({
    cursor,
    size,
    orderBy: [...order],
    reversedOrderBy: [...orderReversed],
    idOf: (row) => row.id,
    fetch: (args) =>
      prisma.leagueClan.findMany({
        where,
        take: args.take,
        orderBy: args.orderBy as never,
        ...(args.cursor ? { cursor: args.cursor, skip: args.skip } : {}),
        select: {
          id: true,
          rating: true,
          division: true,
          win: true,
          lose: true,
          clan: { select: { ...CLAN_SUMMARY_SELECT, category: true } },
        },
      }),
  })

  /* **첫 쪽이면 세지 않는다** (2026-09-01 · D-239 후속).
     목록과 순위 계산이 같은 조건·같은 정렬을 쓰므로, 커서가 없을 때 첫 줄보다
     앞에 오는 행은 **정의상 0개**다. 세러 가는 왕복 한 번이 통째로 사라진다.
     커서가 있을 때만 예전처럼 센다 */
  const startRank =
    merged !== null || cursor === null
      ? 1
      : await rankOfFirstClan(where, page.items[0], byTier)

  /**
   * ★1·2·3위만 여섯 축을 싣는다★ (2026-09-12 사장님: «클랜도 탑3는 플레이스타일 6각형»).
   *
   * 백분위는 리그 전체 분포를 봐야 나온다 — 줄마다 부르면 스무 번이다.
   * 세 줄만 부른다. 실패해도 목록을 죽이지 않는다 (그때는 그림 없이 그린다).
   */
  const podium = page.items.slice(0, CLAN_PODIUM_SIZE)
  const hexOf = new Map<string, PlayerRankHexAxis[]>()
  if (podium.length > 0) {
    const built = await Promise.all(
      podium.map(async (row) => {
        const hex = await softFail('clan-rank-hex', null, { leagueClanId: row.id })(
          leagueClanHexV2({ leagueClanId: row.id, leagueId }),
        )
        return { id: row.id, hex }
      }),
    )
    for (const entry of built) {
      if (!entry.hex) continue
      hexOf.set(
        entry.id,
        CLAN_HEX_ORDER.map((key) => {
          const axis = entry.hex?.axes.find((a) => a.key === key) ?? null
          return {
            key,
            label: CLAN_HEX_LABEL[key] ?? key,
            percentile: axis?.value === null || axis?.value === undefined ? null : axis.value * 100,
            rank: axis?.rank ?? null,
            total: axis?.total ?? null,
          }
        }),
      )
    }
  }

  /**
   * ★뱃지★ (2026-09-14 사장님: «6각이 5위 안에 드는 클랜은 승률옆에 뱃지를»).
   *
   * 육각과 달리 ★모든 줄★ 에 붙는다. 그래서 줄마다 부르지 않고 한 번에 만든다 —
   * `leagueClanBadges` 가 분포를 한 덩어리로 받아 축별 등수를 한 번에 끊는다.
   * 축 등수는 ★리그 전체★ 로 이미 정해져 있어서, 이 페이지 밖 클랜의 구간을 몰라도
   * 이 페이지 줄들의 판정은 달라지지 않는다 (보정은 자기 구간만 본다).
   *
   * 실패해도 목록을 죽이지 않는다 — 그때는 뱃지 없이 그린다.
   */
  const badgeOf =
    (await softFail('clan-rank-badge', null, { leagueId })(
      leagueClanBadges({
        leagueId,
        divisionOf: new Map(page.items.map((row) => [row.id, row.division])),
      }),
    )) ?? new Map<string, string[]>()

  /*
   * ★주요멤버 다섯★ (2026-09-16 밤 사장님:
   * «클명이랑 승률사이에 메인 이라고 쓰고 메인멤버 5명을 써주든가»).
   *
   * PC 에서 클랜명과 승률 사이가 800px 비어 있었다 (무한 QA 실측).
   *
   * ★왕복 하나★ — 클랜 상세(`mainLineupOf`)처럼 줄마다 부르면 스무 번이다.
   * 이 페이지 클랜들의 선수를 한 번에 읽어 여기서 자른다.
   * 셈은 상세와 ★똑같다★ — 점수 순 라플 넷 + 스나 하나, 무기·점수를 모르면 안 넣는다.
   * 실패해도 목록을 죽이지 않는다 — 그때는 빈 자리로 그린다.
   */
  /* ★주요멤버★ — 메인 목록과 ★같은 함수★ 를 쓴다 (두 곳에 베끼면 갈린다) */
  const mainOf = await mainMembersOf(leagueId, page.items.map((row) => row.clan.id))
  /* ★라이벌★ — 제일 많이 붙은 상대 (2026-09-17 사장님). 질의 하나로 리그 전체를 가져온다 */
  const rivalOf = await rivalsOf(leagueId, SEASON0_FROM)
  const clanById = new Map(page.items.map((row) => [row.id, row.clan]))

  return {
    cursor: page.cursor,
    items: page.items.map((row, index) => ({
      rank: startRank + index,
      league_clan_id: row.id,
      clan: toClanSummary(row.clan),
      division: row.division,
      win: row.win,
      lose: row.lose,
      win_rate: winRate(row.win, row.lose),
      rating: row.rating,
      category: row.clan.category,
      badges: badgeOf.get(row.id) ?? [],
      hex_axes: hexOf.get(row.id) ?? null,
      main_members: mainOf.get(row.clan.id) ?? [],
      rival: (() => {
        const hit = rivalOf.get(row.id)
        if (hit === undefined) return null
        const foe = clanById.get(hit.leagueClanId)
        /* 상대가 이 쪽에 없으면(탈퇴·다른 부리그) 안 그린다 — 이름을 지어내지 않는다 */
        if (foe === undefined) return null
        return { clan: toClanSummary(foe), games: hit.games }
      })(),
    })),
  }
}

/** 카드를 그리는 줄 수 — 개인랭킹 포디움과 같다 */
const CLAN_PODIUM_SIZE = 3

/** 클랜 육각형 축 차례·이름 — 클랜 카드(`clanHexAxes`)와 ★같은 차례★ 다 */
/* ⚠ ★2026-09-15★ — ④ 가 `tempo`(게임템포) 에서 `riflePower`(라이플화력) 로 바뀌었다 (사장님) */
/* ⚠ ★2026-09-16★ — ⑤ 가 `firstBlood`(선짤) 에서 `sniperInfluence`(스나영향력) 로 바뀌었다 (사장님) */
/*
 * ⚠ ★축 목록을 여기 적지 않는다★ (2026-09-16 밤).
 *   계약이 정한 여섯을 그대로 따른다 — 화면마다 적어 둔 탓에
 *   축이 갈릴 때 한 곳이 빠지는 일을 오늘만 세 번 걱었다.
 */
/*
 * ⚠ ★클랜 육각도 점수제다★ (2026-09-18 사장님: 「클랜 6각이 바꼈어
 *   저게 비리베 숏 이층 으로 바뀌어야하는데」).
 *
 *   옛 `CLAN_HEX_V2_AXIS_KEYS`(스나영향력·라플영향력·기회차단…)를 보고 있어서
 *   화면만 옛 축 그대로였다. ★`CLAN_HEX_V2_CLAN_AXIS_KEYS` 가 지금 여섯이다.★
 */
const CLAN_HEX_ORDER = CLAN_HEX_V2_CLAN_AXIS_KEYS
const CLAN_HEX_LABEL: Readonly<Record<string, string>> = {
  sniperDuel: '스나싸움',
  outnumbered: '소수싸움',
  save: '세이브',
  riflePower: '라이플화력',
  rifleInfluence: '라플영향력',
  blockChance: '기회차단',
  sniperInfluence: '스나영향력',
  firstBloodless: '크랙 성공',
}

/**
 * 리그별 플레이어의 경기 수.
 *
 * `kill_per_match`(평균킬) 계산에 필요하다. 한 페이지(20건)치만 세므로 비용이 크지 않다.
 * 누적 승/패 합계가 아니라 **실제 참가 경기 수**를 쓴다 (store.ts와 동일).
 */
export async function matchCountByPlayer(
  leagueId: string,
  playerIds: string[],
): Promise<Map<string, number>> {
  if (playerIds.length === 0) return new Map()
  const grouped = await prisma.matchPlayerStat.groupBy({
    by: ['playerId'],
    /* 평균킬의 **분모**다. 분자(`LeaguePlayer.kill`)는 래더 경기를 누적하므로
       분모도 래더 경기를 센다. `official` 라벨은 D-145 에서 래더와 무관해졌다 (D-148).
     *
     * `redRatingUpdate` 하나만 보면 안 된다 — 그건 **우리 공식(D-145)이 계산한** 값이라
     * 미러링한 3rd.supply 경기에는 들어 있지 않다. 실측: supply 리그 13만 경기 중
     * `redRatingUpdate` 가 있는 것은 98건뿐이라 분모가 0이 됐고, 화면에 평균킬이
     * 전부 `0.0킬` 로 나왔다. 미러 경기는 전부 래더 경기다 (원본이 래더 경기만 준다).
     *
     * 분자(`LeaguePlayer.kill`)는 **시즌0 창 안**만 담는다(엔진 집계). 그래서 분모에도
     * 같은 창을 건다 (D-178). 창이 없으면 분모만 전 기간이 되어 평균킬이 `0.29킬` 처럼
     * 터무니없이 작아진다 — D-172 가 고친 것과 같은 종류의 어긋남이다. */
    where: {
      playerId: { in: playerIds },
      match: { leagueId, ...seasonWindowWhere(), ...ladderMatchWhere() },
    },
    _count: { _all: true },
  })
  return new Map(grouped.map((row) => [row.playerId, row._count._all]))
}

/**
 * 평균킬의 분모 — **집계에 실제로 들어간 판수** (D-172).
 *
 * `matchCountByPlayer` 는 그 리그의 래더 경기를 **전부** 센다. 시즌 단위로 집계하기
 * 시작하면서 분자(`LeaguePlayer.kill`)는 그 시즌 것만 담게 됐는데 분모는 전 기간이라,
 * 실측에서 평균킬이 `0.29킬` 처럼 터무니없이 작게 나왔다.
 *
 * `LeaguePlayerWeaponStat.knownStatGames` 는 **같은 집계에서 나온 값**이고
 * K/D 를 아는 경기만 센다 (D-149). 그래서 분자와 분모의 출처가 같아진다.
 * 무기별 행이 하나도 없으면 예전 방식으로 물러난다.
 */
function knownGamesOf(rows: { knownStatGames: number }[]): number {
  return rows.reduce((sum, row) => sum + row.knownStatGames, 0)
}

export async function getPlayerRanks(
  leagueId: string,
  cursor: string | null,
  size: number,
  /**
   * ★페이지 번호로 건너뛰기★ (2026-09-12 사장님). 0 이면 1쪽이다.
   *
   * ⚠ 이 길은 ★실력 점수가 없는 리그★(10🏔) 가 쓴다. 쪽 번호를 여기까지 안 내려 주면
   *   10 개인랭킹이 통째로 빈다 — 실제로 그렇게 깨뜨렸다 (2026-09-12).
   */
  offset: number | null = null,
  /**
   * ★무기 거르개★ — 0 라플 · 1 스나 (2026-09-13 사장님: «검색 필터가 안먹혀 스나 라플 통합»).
   *
   * ⚠ ★이 길에는 거르개가 아예 없었다.★ 그래서 ★열산 개인랭킹의 무기 칩이 아무 일도
   *   안 했다★ — 통합 829명 · 스나 826명 · 라플 826명으로 세 탭이 사실상 같은 목록이었다.
   *   (실측 2026-09-13. IPL·SPL 은 실력 점수 길로 가서 멀쩡했고, 점수를 안 매기는
   *    10🏔 만 이 길로 떨어져서 티가 안 났다.)
   *
   * 모집단 판정은 `LeaguePlayerWeaponStat.isMain` 이다 — ★점수 길과 같은 뜻★ 을 쓴다
   * (그 무기로 뛴 판이 절반 이상). 어쩌다 든 스나 몇 판으로 스나 랭킹에 들어오지 않는다.
   */
  onlyWeapon: 0 | 1 | null = null,
): Promise<(CursorPage<PlayerRankRow> & { total?: number }) | null> {
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { id: true, category: true },
  })
  if (!league) return null

  /* 리그 안의 선수는 **전원** 랭킹에 들어간다 (D-107).
     무소속리그에도 개인 랭킹이 있다. 리그가 다르면 애초에 다른 목록이라
     여기서 걸러 낼 것이 없다. 무소속리그에서 감추는 것은 누적 킬뎃 컬럼뿐이다. */
  const RANK_WHERE = {
    ...playerRankWhere(leagueId),
    /* 무기를 고르면 ★그 무기가 주무기인 선수만★ (2026-09-13). 안 고르면 칸을 아예 안 넣는다 */
    ...(onlyWeapon === null
      ? {}
      : { weaponStats: { some: { weapon: onlyWeapon, isMain: true } } }),
  }
  const RANK_SELECT = {
    id: true,
    rating: true,
    /* ★점수 래더★ (2026-09-18) — 줄 세우기와 화면 숫자가 이 값이다 */
    scoreRating: true,
    scoreGames: true,
    scoreBonus: true,
    win: true,
    lose: true,
    kill: true,
    death: true,
    player: { select: PLAYER_SUMMARY_SELECT },
    clan: { select: CLAN_SUMMARY_SELECT },
    /* 평균킬 분모 — 분자와 같은 집계에서 나온 판수를 쓴다 (D-172) */
    weaponStats: { select: { knownStatGames: true } },
  } as const
  type RankRowShape = {
    id: string
    rating: number
    scoreRating: number | null
    scoreGames: number
    scoreBonus: number
    win: number
    lose: number
    kill: number
    death: number
    player: { id: string; name: string }
    clan: { id: string; slug: string; name: string; markBgUrl: string | null; markFrontUrl: string | null } | null
    weaponStats: { knownStatGames: number }[]
  }

  const byOffset = offset !== null
  const total = byOffset ? await prisma.leaguePlayer.count({ where: RANK_WHERE }) : undefined
  const page = byOffset
    ? {
        items: (await prisma.leaguePlayer.findMany({
          where: RANK_WHERE,
          skip: offset,
          take: size,
          orderBy: [...PLAYER_RANK_ORDER] as never,
          select: RANK_SELECT,
        })) as unknown as RankRowShape[],
        cursor: { prev: null, next: null },
      }
    : await cursorPage<RankRowShape>({
        cursor,
        size,
        orderBy: [...PLAYER_RANK_ORDER],
        reversedOrderBy: [...PLAYER_RANK_ORDER_REVERSED],
        idOf: (row) => row.id,
        fetch: (args) =>
          prisma.leaguePlayer.findMany({
            where: RANK_WHERE,
            take: args.take,
            orderBy: args.orderBy as never,
            ...(args.cursor ? { cursor: args.cursor, skip: args.skip } : {}),
            select: RANK_SELECT,
          }) as unknown as Promise<RankRowShape[]>,
      })

  /* 평균킬 분모는 `knownStatGames` 가 **먼저**다 (D-172). 그것이 있는 선수는
     `matchCountByPlayer` 를 부를 이유가 없다 — 결과를 쓰지도 않는다.
     그런데 예전에는 **전원 분을 항상** 물었다. 운영 실측에서 그 `groupBy` 하나가
     DPL 1.3초 · 열산 0.3초였다 (2026-09-01 · D-223).
     그래서 **모르는 선수만** 모아서 묻는다. 아무도 없으면 질의 자체가 사라진다.

     두 질의를 `Promise.all` 로 묶은 것도 같은 이유다. 서로 아무 관계가 없는데
     줄줄이 기다리고 있었다 — 왕복 시간이 그대로 두 번 더해졌다. */
  const unknownGames = page.items.filter((row) => knownGamesOf(row.weaponStats) === 0)
  const [startRank, counts] = await Promise.all([
    /* **첫 쪽이면 세지 않는다** (2026-09-01 · D-239 후속).
       목록과 순위 계산이 같은 조건·같은 정렬이라, 커서가 없을 때 첫 줄보다 앞에 오는 행은
       **정의상 0개**다. 메인 TOP3·랭킹 첫 화면에서 왕복 한 번이 사라진다 */
    byOffset ? Promise.resolve((offset as number) + 1) : cursor === null ? Promise.resolve(1) : rankOfFirstPlayer(leagueId, page.items[0]),
    matchCountByPlayer(
      leagueId,
      unknownGames.map((row) => row.player.id),
    ),
  ])

  return {
    cursor: page.cursor,
    ...(total === undefined ? {} : { total }),
    items: page.items.map((row, index) => ({
      rank: startRank + index,
      league_player_id: row.id,
      player: toPlayerSummary(row.player),
      clan: toClanSummaryOrNull(row.clan),
      win: row.win,
      lose: row.lose,
      win_rate: winRate(row.win, row.lose),
      /* 무소속리그면 **top100 밖만** 누적 킬뎃을 비운다 (2026-09-02).
         순위·승패·평균킬은 언제나 그대로 나간다. 옛 규칙(전원 감춤)은 D-107 */
      kd_rate: cumulativeKdRate(league, kdRate(row.kill, row.death), startRank + index),
      kill_per_match: killPerMatch(
        row.kill,
        knownGamesOf(row.weaponStats) || (counts.get(row.player.id) ?? 0),
      ),
      rating: row.rating,
      /*
       * ★점수 래더★ (2026-09-18 사장님) — DB 는 ×100 한 정수, 화면은 ★소수 한 자리★ 다.
       * ⚠ 나누는 곳은 ★여기 하나뿐★ 이다. 다른 데서 또 나누면 값이 100배 작아진다.
       */
      score_rating: row.scoreRating === null ? null : Math.round(row.scoreRating / 10) / 10,
      score_games: row.scoreGames,
      score_bonus: Math.round(row.scoreBonus / 10) / 10,
      /* 옛 래더 순 목록에는 실력 점수가 없다 (2026-09-10) */
      hex: null,
      score: null,
      score_weapon: null,
    })),
  }
}

/**
 * 메인페이지 TOP3 가 쓰는 **가벼운 개인랭킹 첫 줄** (2026-09-01 · D-239 후속).
 *
 * ── 왜 `getPlayerRanks` 를 그대로 부르지 않는가
 *   메인은 `rank · player · clan · rating` **네 칸만** 그린다 (`HomeLeagueTop`).
 *   그런데 `getPlayerRanks` 는 킬뎃과 평균킬을 만드느라 선수마다 `weaponStats` 를
 *   더 읽고, 필요하면 `matchCountByPlayer` 까지 부른다. **메인은 그 값을 버린다.**
 *   리그 세 개니까 버릴 값을 만드느라 왕복이 리그마다 두 번씩 더 났다.
 *   실측: `/api/home/top` 이 왕복 13번 → 8번.
 *
 * ── 규칙은 여전히 한 곳에서 나온다
 *   모집단(`playerRankWhere`)과 정렬(`RANK_ORDER`)을 **랭킹 화면과 같은 상수**로 쓴다.
 *   여기에 조건이나 정렬을 새로 적으면 두 화면이 조용히 갈라진다.
 *
 * ── 순위는 세지 않는다
 *   첫 쪽이라 첫 줄이 1위다 (`getPlayerRanks` 의 같은 판단과 근거가 같다).
 */
export async function getTopPlayerRows(
  leagueId: string,
  size: number,
): Promise<{ rank: number; player: PlayerSummary; clan: ClanSummary | null; rating: number }[]> {
  const rows = await prisma.leaguePlayer.findMany({
    where: playerRankWhere(leagueId),
    take: size,
    orderBy: [...RANK_ORDER],
    select: {
      rating: true,
      player: { select: PLAYER_SUMMARY_SELECT },
      clan: { select: CLAN_SUMMARY_SELECT },
    },
  })
  return rows.map((row, index) => ({
    rank: index + 1,
    player: toPlayerSummary(row.player),
    clan: toClanSummaryOrNull(row.clan),
    rating: row.rating,
  }))
}

/* ------------------------- 순위 (개별 대상 조회용) ------------------------- */

export async function clanRankOf(leagueClan: {
  id: string
  leagueId: string
  division: number
  rating: number
  placement: boolean
  /* ★판수 문턱을 넘겼나★ 를 여기서 본다 (2026-09-20) — 목록과 같은 조건이어야 한다 */
  win: number
  lose: number
  /**
   * ★감춘 클랜을 빼려면 리그 slug 가 필요하다★ (2026-09-20 비판 검수에서 잡았다).
   *
   *   목록(`getClanRanks`)은 `activeClanIn(slug)` 으로 ★그 리그에서 감춘 클랜★ 을 뺀다.
   *   그런데 이 분모는 그 조건이 ★없었다.★ 그래서 목록에 없는 클랜이 분모에 섞여
   *   「3위 / 7팀」 인데 목록에는 여섯 팀뿐인 일이 생긴다 (D-147 과 같은 병).
   *
   * ⚠ 안 주면 ★감춘 클랜을 못 뺀다★ — 옛 호출부가 깨지지 않게 선택 칸으로 둔다.
   *   새로 부르는 곳은 반드시 준다.
   */
  leagueSlug?: string
}): Promise<{ rank: number | null; rankCount: number | null }> {
  /* `rankCount` 는 클랜랭킹의 **모집단 크기**다. 랭킹 목록(`getClanRanks`)이
     비활성 클랜을 빼고 내보내므로 분모도 같은 집합이어야 한다.
     아니면 "3 / 7 위" 처럼 목록에 7번째가 없는 분모가 나온다 (D-147 과 같은 이유).
   *
   * ── **왕복 두 번을 한 번으로 줄였다** (2026-09-01 · D-239 후속)
   *   예전에는 `count(모집단)` 과 `count(앞에 오는 행)` 을 **줄줄이** 던졌다.
   *   운영은 `connection_limit=1` 이라 그 둘이 병렬로 돌지도 않는다 — 왕복 두 번이
   *   그대로 더해진다. 같은 표를 두 번 훑을 이유가 없어 `FILTER` 로 한 번에 센다.
   *
   *   ⚠ 조건은 위의 Prisma 판(`ACTIVE_CLAN` · `placement: false`)과 **한 글자도 다르면 안
   *     된다.** `getClanRanks` 목록과 모집단이 갈리는 순간 "목록에 없는 분모" 가 생긴다.
   *     `Clan.active` 와 `LeagueClan.expelledAt` 이 그 조건이다.
   *
   *   ⚠ 배치고사면 예전에도 `rankCount` 를 **읽고 나서** 버렸다. 지금도 읽고 버린다 —
   *     한 질의라 버리는 값이 공짜다. 밖으로 나가는 값은 그대로 `null` 이다. */
  /*
   * ★감춘 클랜 목록★ — 리그 slug 를 줬을 때만 뺄 수 있다 (2026-09-20 비판 검수).
   * ⚠ 빈 배열이면 SQL 의 그 줄이 아무도 안 막는다 — 옛 호출부가 그대로 돈다.
   */
  const hiddenSlugs = leagueClan.leagueSlug === undefined ? [] : [...hiddenClanSlugsIn(leagueClan.leagueSlug)]

  /*
   * ★판수 문턱을 목록과 같이 건다★ (2026-09-20 사장님: 「판수 없는 클랜 진짜 싫어해」)
   *
   *   `getClanRanks` 가 `win + lose >= CLAN_RANK_MIN_GAMES` 로 거르므로
   *   ★여기 빠뜨리면 「목록에 없는 분모」 가 그대로 생긴다★ — 위 주석이 경고한 그것이다.
   *
   * ⚠ ★SQL 템플릿 안에 백틱을 쓰지 않는다★ — 템플릿이 거기서 끊긴다.
   *   그래서 설명은 ★템플릿 밖★ 인 여기에 적는다. (이 세션에서 일곱 번 밟았다)
   */
  const [row] = await prisma.$queryRaw<{ rankCount: number; above: number }[]>`
    SELECT COUNT(*)::int AS "rankCount",
           COUNT(*) FILTER (
             WHERE lc."rating" > ${leagueClan.rating}
                OR (lc."rating" = ${leagueClan.rating} AND lc."id" < ${leagueClan.id})
           )::int AS "above"
      FROM "LeagueClan" lc
      JOIN "Clan" c ON c."id" = lc."clanId"
     WHERE lc."leagueId" = ${leagueClan.leagueId}
       AND lc."division" = ${leagueClan.division}
       AND lc."placement" = false
       AND lc."expelledAt" IS NULL
       AND c."active" = true
       /* ★판수 문턱★ — 목록(getClanRanks)과 같은 조건이다. 위 주석을 보라 */
       AND lc."win" + lc."lose" >= ${CLAN_RANK_MIN_GAMES}
       /* ★감춘 클랜★ — 목록도 뺀다 (O-044). 빈 목록이면 이 줄이 아무도 안 막는다 */
       AND (${hiddenSlugs.length} = 0 OR c."slug" <> ALL(${hiddenSlugs}::text[]))
  `
  const rankCount = row?.rankCount ?? 0
  if (leagueClan.placement) return { rank: null, rankCount: null }
  /*
   * ★문턱을 못 넘긴 클랜은 순위가 없다★ (2026-09-20) — 목록에 없는데 「n위」 라고
   *   적으면 눌러도 그 자리에 없다. ★모르는 것이 아니라 「아직 아니다」★ 이므로
   *   화면은 「기록 부족」 으로 적는다.
   */
  if (leagueClan.win + leagueClan.lose < CLAN_RANK_MIN_GAMES) return { rank: null, rankCount }
  return { rank: (row?.above ?? 0) + 1, rankCount }
}

/**
 * 무기별 랭킹 (D-146).
 *
 * `LeaguePlayerWeaponStat.ratingDelta` 기준이다 — 무기 분리는 **기록만** 나누고
 * 통합 래더 값을 바꾸지 않는다 (LADDER_IMPLEMENTATION_SPEC 6장).
 *
 * **넥슨 Open API 는 무기를 주지 않는다** (D-034). 그래서 무기가 확인된 경기가 없는
 * 선수는 `null` 이다 — 표본이 없는데 순위를 만들어 내지 않는다.
 * 화면은 `null` 을 "집계 없음" 으로 표시한다.
 */
/**
 * 무기별 전적 + 그 무기 안에서의 순위 (D-149).
 *
 * ── 순위 기준
 *   `ratingDelta` — **그 무기로 뛴 경기에서 얻은 래더 증감의 합**이다.
 *   새 점수식을 만든 것이 아니다. D-145 통합 공식이 이미 계산해 둔 `ratingUpdate` 를
 *   무기에 따라 나눠 담기만 한다 (`CLAUDE.md` 3-B 1번 — 무기별 공식은 없다).
 *   개인 래더(`LeaguePlayer.rating`)는 무기별로 쪼개지 않는다.
 *
 *   D-149 이전에는 이 값이 항상 0이라 전원 동점이었고 모두 1위로 나왔다.
 *
 * ── 모집단
 *   **K/D 를 아는 경기가 한 판이라도 있는 선수**만 순위에 넣는다 (`knownStatGames > 0`).
 *   무기만 알고 기록을 모르는 선수를 순위에 넣으면 비교할 실적이 없는 사람이 등수를 받는다.
 *   배치고사 중인 선수는 기존 규칙 그대로 순위를 받지 않는다.
 */
export interface WeaponRankResult {
  rank: number | null
  rankCount: number | null
  games: number
  knownGames: number
  kill: number
  death: number
  assist: number
  kdRate: number | null
}

const EMPTY_WEAPON_RANK: WeaponRankResult = {
  rank: null,
  rankCount: null,
  games: 0,
  knownGames: 0,
  kill: 0,
  death: 0,
  assist: 0,
  kdRate: null,
}

/** 순위를 매기는 데 필요한 무기 버킷 한 줄 */
export interface WeaponStatRow {
  weapon: number
  ratingDelta: number
  games: number
  knownStatGames: number
  kill: number
  death: number
  assist: number
  isMain: boolean
}

/**
 * 무기 버킷 한 줄에서 **기록**과 「순위를 받을 자격이 있는가」를 정한다.
 * 순위 숫자는 여기서 만들지 않는다 — 그건 모집단을 세야 나온다.
 */
function weaponStatOf(
  mine: WeaponStatRow | undefined,
  placement: boolean,
): { stat: WeaponRankResult; ranked: boolean } {
  // 그 무기로 뛴 기록이 아예 없으면 만들어 내지 않는다
  if (!mine || mine.games === 0) return { stat: EMPTY_WEAPON_RANK, ranked: false }

  const stat: WeaponRankResult = {
    ...EMPTY_WEAPON_RANK,
    games: mine.games,
    knownGames: mine.knownStatGames,
    kill: mine.kill,
    death: mine.death,
    assist: mine.assist,
    /* K/D 정의는 통합 킬뎃과 **같다** — `킬 / (킬 + 데스) × 100`.
       전체와 무기별이 다른 정의를 쓰면 나란히 놓았을 때 거짓말이 된다.
       아는 경기가 없으면 계산하지 않는다 (0%가 아니라 모르는 것이다) */
    kdRate: mine.knownStatGames === 0 ? null : kdRate(mine.kill, mine.death),
  }

  /* **본인이 랭킹 모집단에 들어가지 않으면 순위도 없다.**
     배치고사 중인 선수를 세지 않으면서 그 선수에게만 순위를 주면
     "0명중 1위" 같은 값이 나온다. 실제로 그렇게 나왔다. */
  /* 주무기가 아니면 그 무기 랭킹의 모집단이 아니다 (D-173).
     기록은 그대로 돌려주고 **순위만** 주지 않는다 —
     목록(`rankings.ts`)과 모집단이 같아야 "N위 / M명" 이 어긋나지 않는다 */
  const ranked = !placement && mine.knownStatGames > 0 && mine.isMain
  return { stat, ranked }
}

/**
 * 무기 축의 **모집단 크기와 앞선 인원**을 한 질의로 센다 (2026-09-01 · D-239 후속).
 *
 * 예전에는 무기마다 `count(모집단)` · `count(앞선 사람)` 을 **줄줄이** 던졌다.
 * 스나·라플 둘 다 순위를 받는 선수면 왕복이 네 번이다. 운영은 `connection_limit=1` 이라
 * 그 넷이 병렬로 돌지도 않는다 (D-239). 같은 표를 네 번 훑는 대신 `FILTER` 로 한 번에 센다.
 *
 * ⚠ 조건은 `rankings.ts` 의 `weaponRankWhere()` 와 **한 글자도 다르면 안 된다.**
 *   한쪽만 달라지면 프로필의 "N위 / M명" 과 목록의 줄 수가 어긋난다.
 */
async function weaponRankCounts(
  leagueId: string,
  targets: readonly { weapon: 0 | 1; ratingDelta: number }[],
): Promise<Map<number, { rankCount: number; above: number }>> {
  const out = new Map<number, { rankCount: number; above: number }>()
  if (targets.length === 0) return out

  const weapons = targets.map((target) => target.weapon)
  /* `CASE` 는 두 무기를 모두 받는다. 목록에 없는 무기의 값은 어차피 세지 않는다 */
  const rifleDelta = targets.find((target) => target.weapon === 0)?.ratingDelta ?? 0
  const sniperDelta = targets.find((target) => target.weapon === 1)?.ratingDelta ?? 0

  const rows = await prisma.$queryRaw<{ weapon: number; rankCount: number; above: number }[]>`
    SELECT w."weapon" AS "weapon",
           COUNT(*)::int AS "rankCount",
           COUNT(*) FILTER (
             WHERE w."ratingDelta" > (CASE w."weapon" WHEN 0 THEN ${rifleDelta} ELSE ${sniperDelta} END)
           )::int AS "above"
      FROM "LeaguePlayerWeaponStat" w
      JOIN "LeaguePlayer" p ON p."id" = w."leaguePlayerId"
     WHERE p."leagueId" = ${leagueId}
       AND p."placement" = false
       AND w."knownStatGames" > 0
       AND w."isMain" = true
       AND w."weapon" = ANY(${weapons}::int[])
     GROUP BY w."weapon"
  `
  for (const row of rows) out.set(row.weapon, { rankCount: row.rankCount, above: row.above })
  return out
}

/**
 * 스나·라플 **두 축을 한꺼번에** 만든다 (2026-09-01 · D-239 후속).
 *
 * 기록실이 `playerWeaponRankOf` 를 두 번 부르면 왕복이 최대 여섯 번이었다.
 * 무기 버킷은 이미 `weapon_stats` 를 만들며 읽어 두므로 그것을 넘겨받고,
 * 모집단은 위의 한 질의로 센다 — **왕복 한 번**으로 끝난다.
 * 순위를 받을 사람이 아무도 없으면 질의 자체가 사라진다.
 */
export async function playerWeaponRanksOf(
  leagueId: string,
  placement: boolean,
  rows: readonly WeaponStatRow[],
): Promise<Map<0 | 1, WeaponRankResult>> {
  const resolved = new Map<0 | 1, { stat: WeaponRankResult; ranked: boolean; delta: number }>()
  for (const weapon of [0, 1] as const) {
    const mine = rows.find((row) => row.weapon === weapon)
    const { stat, ranked } = weaponStatOf(mine, placement)
    resolved.set(weapon, { stat, ranked, delta: mine?.ratingDelta ?? 0 })
  }

  const targets = [...resolved.entries()]
    .filter(([, value]) => value.ranked)
    .map(([weapon, value]) => ({ weapon, ratingDelta: value.delta }))
  const counts = await weaponRankCounts(leagueId, targets)

  const out = new Map<0 | 1, WeaponRankResult>()
  for (const [weapon, value] of resolved) {
    const count = value.ranked ? counts.get(weapon) : undefined
    out.set(
      weapon,
      count ? { ...value.stat, rank: count.above + 1, rankCount: count.rankCount } : value.stat,
    )
  }
  return out
}

/**
 * **옛 진입점** — 무기 하나만 따로 묻는다 (`CLAUDE.md` 10-4: 옛 버전을 남긴다).
 *
 * 화면은 이제 `playerWeaponRanksOf` 로 둘을 한꺼번에 받는다.
 * 이쪽도 왕복은 두 번으로 줄었다(버킷 한 줄 + 모집단 한 번).
 */
export async function playerWeaponRankOf(
  leaguePlayerId: string,
  leagueId: string,
  weapon: 0 | 1,
): Promise<WeaponRankResult> {
  const mine = await prisma.leaguePlayerWeaponStat.findUnique({
    where: { leaguePlayerId_weapon: { leaguePlayerId, weapon } },
    select: {
      weapon: true,
      ratingDelta: true,
      games: true,
      knownStatGames: true,
      kill: true,
      death: true,
      assist: true,
      isMain: true,
      leaguePlayer: { select: { placement: true } },
    },
  })
  if (!mine) return EMPTY_WEAPON_RANK

  const { stat, ranked } = weaponStatOf(mine, mine.leaguePlayer.placement)
  if (!ranked) return stat

  const counts = await weaponRankCounts(leagueId, [{ weapon, ratingDelta: mine.ratingDelta }])
  const count = counts.get(weapon)
  return count ? { ...stat, rank: count.above + 1, rankCount: count.rankCount } : stat
}

export async function playerRankOf(leaguePlayer: {
  id: string
  leagueId: string
  rating: number
  scoreRating: number | null
  placement: boolean
}): Promise<{ rank: number | null; rankCount: number | null }> {
  /* **왕복 두 번을 한 번으로 줄였다** (2026-09-01 · D-239 후속) — `clanRankOf` 와 같은 이유다.
     모집단(`placement: false`)도 `rankOfFirstPlayer` 의 조건도 그대로다.
     여기에 `ACTIVE_CLAN` 을 넣지 않는 이유는 위 `rankOfFirstPlayer` 주석에 있다 —
     개인 랭킹 목록은 클랜으로 거르지 않는다 (D-107). 무소속 선수가 통째로 빠진다 */
  /*
   * ★★랭킹 목록과 ★같은 규칙★ 으로 센다★★ (2026-09-20)
   *
   * ── 무엇이 어긋나 있었나
   *
   *   목록(`PLAYER_RANK_ORDER`)은 ★점수 래더 먼저, 없으면 Elo★ 로 줄을 세우는데
   *   이 함수는 ★Elo 만★ 봤다. 그래서 ★같은 선수가 두 등수★ 를 가졌다 —
   *   기본정보에 「2207명중 517위」, 랭킹 화면에 가면 다른 자리.
   *   ★화면의 두 숫자가 서로를 설명하지 못했다.★
   *
   * ── 규칙 (`PLAYER_RANK_ORDER` 와 한 글자도 다르지 않아야 한다)
   *
   *     ① 점수 래더 높은 순 — ★단, 못 잰 사람(`null`)은 맨 뒤★
   *     ② 같으면 옛 Elo 래더 높은 순
   *     ③ 그래도 같으면 `id` 작은 순
   *
   *   ⚠ ★「점수가 있는 사람은 없는 사람보다 무조건 앞」★ 이 `nulls: 'last'` 의 뜻이다.
   *     SQL 로 옮기면 ★내 점수가 null 이면 점수 있는 사람이 전부 위★ 라는 뜻이 된다.
   */
  const myScore = leaguePlayer.scoreRating
  const [row] = await prisma.$queryRaw<{ rankCount: number; above: number }[]>`
    SELECT COUNT(*)::int AS "rankCount",
           COUNT(*) FILTER (
             WHERE
               CASE
                 /* 내가 점수를 못 쟀으면 — 점수 있는 사람은 전부 위다 */
                 WHEN ${myScore}::int IS NULL THEN
                   lp."scoreRating" IS NOT NULL
                   OR lp."rating" > ${leaguePlayer.rating}
                   OR (lp."rating" = ${leaguePlayer.rating} AND lp."id" < ${leaguePlayer.id})
                 /* 점수를 쟀으면 — 점수 없는 사람은 전부 아래다 */
                 ELSE
                   lp."scoreRating" > ${myScore}::int
                   OR (
                     lp."scoreRating" = ${myScore}::int
                     AND (
                       lp."rating" > ${leaguePlayer.rating}
                       OR (lp."rating" = ${leaguePlayer.rating} AND lp."id" < ${leaguePlayer.id})
                     )
                   )
               END
           )::int AS "above"
      FROM "LeaguePlayer" lp
     WHERE lp."leagueId" = ${leaguePlayer.leagueId}
       AND lp."placement" = false
  `
  const rankCount = row?.rankCount ?? 0
  if (leaguePlayer.placement) return { rank: null, rankCount: null }
  // 무소속리그 선수도 자기 리그 안에서 정상으로 순위를 받는다 (D-107)
  return { rank: (row?.above ?? 0) + 1, rankCount }
}
