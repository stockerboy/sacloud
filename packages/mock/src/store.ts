import { ADMIN_PIN_LIMIT, isAdminWriter } from '@sacloud/ui/adminPost'
import {
  decodeCursor,
  encodeCursor,
  type Board,
  type BoardListItem,
  type Clan,
  type ClanLeagueEntry,
  type ClanPlayer,
  type ClanRankRow,
  type ClanSummary,
  type Comment,
  type FormTop,
  type CommentReply,
  type CursorMetadata,
  type Infos,
  type League,
  type LeagueClan,
  type LeagueClanSeason,
  type LeagueClanShow,
  type LeagueListItem,
  type LeaguePlayerDetail,
  type LeaguePlayerSeason,
  type LeagueSummary,
  type MatchDetail,
  type MatchLineupEntry,
  type MatchListItem,
  type MatchPlayerStat,
  type MatchSummary,
  type OpponentSummaryEntry,
  type Player,
  type PlayerForm,
  type PlayerFormMonth,
  type PlayerLeagueEntry,
  type PlayerRankRow,
  type PlayerSearchItem,
  type RankWeapon,
  type TeammateStat,
  type TeamSide,
  type BoardWriter,
  type User,
  ANONYMOUS_LIST_LABEL,
  POST_WRITER_LABEL,
  FORM_BASELINE_GAMES,
  FORM_MONTHS,
  FORM_RECENT_GAMES,
  FORM_TOP_MIN_GAMES,
  FORM_TOP_SIZE,
  HOME_LEAGUES,
  HOME_TOP_SIZE,
  type HomeLeagueTop,
  type HomeTop,
  RANK_WEAPON_CODE,
  TRAIT_MIN_GAMES,
  assignAnonymousLabels,
  buildPlayerPlaystyle,
  buildPlayerTraits,
  isAnonymousDisclose,
  mainWeaponOf,
  percentileOf,
  buildTodayPerformance,
  formMonthKey,
  formMonthKeys,
  clanSlugFromBarracksUrl,
  isBarracksUrl,
  normalizePastedQuery,
  judgeFormTrend,
  dayLabelOf,
  kdRateOrNull,
  resolvePlayerPositionOf,
  kstDayKey,
  kstDayStart,
  winRateOrNull,
  buildTierBreakdown,
  type TierClanTally,
  type TierTally,
  type PlayerTierRecord,
  type PlayerDayRecord,
  playerRefsFromBarracksUrl,
  type TodayPerformance,
  type TodayTally,
  /* 클랜 지표 — 계산 규칙은 계약 한 곳에만 둔다 (SITE_SPEC_V2 5절) */
  buildClanMetrics as buildClanMetricsOf,
  clanBestWinStreak,
  type ClanMatchRow,
  type ClanMetrics,
  /* 배틀로그 지표 — 판정 규칙도 계약 한 곳에만 둔다 (SITE_SPEC_V2 5-5절) */
  CLAN_OUTNUMBERED_MIN_ROUNDS,
  CLAN_ROUND_MIN_ROUNDS,
  CLAN_TEMPO_MIN_ROUNDS,
  buildClanHexagon as buildClanHexagonOf,
  buildClanRoundMetrics as buildClanRoundMetricsOf,
  type ClanAxisInput,
  type ClanHexagon,
  type ClanTraitAxisKey,
  type ClanRoundMetrics,
  type ClanRoundTallyInput,
  /* 클랜 육각형 V2 — 합산·정규화 규칙도 계약 한 곳에만 둔다 (D-217 · D-235) */
  buildClanHexV2Raw,
  normalizeAgainstFoe,
  normalizeByPercentile,
  type ClanHexTallyLike,
  type ClanHexV2,
  /* 클랜원 정리 — 나누는 규칙도 계약 한 곳에만 둔다 (SITE_SPEC_V2 5-2 · D-199) */
  buildClanRoster as buildClanRosterOf,
  type ClanRoster,
  type ClanRosterInput,
  type PositionCode,
  type ResolvedPosition,
  foldWeekly,
  WEEKLY_MAX_WEEKS,
  type WeeklyRow,
  type WeeklyTrend,
} from '@sacloud/contract'
import { dataset, FIXTURE_NOW, toKstIso } from './dataset'
import { Rng } from './rng'
import { getMockRole } from './session'
import { kdRate, killPerMatch, percentOf, winRate } from './derive'
import type {
  MockBoard,
  MockClan,
  MockComment,
  MockLeague,
  MockLeagueClan,
  MockLeaguePlayer,
  MockMatch,
  MockMatchPlayer,
  MockPlayer,
  MockUser,
} from './types'

/* -------------------------------------------------------------------------- */
/* 색인                                                                         */
/* -------------------------------------------------------------------------- */

const playerById = new Map(dataset.players.map((entry) => [entry.id, entry]))
const clanById = new Map(dataset.clans.map((entry) => [entry.id, entry]))
const clanBySlug = new Map(dataset.clans.map((entry) => [entry.slug, entry]))
const userById = new Map(dataset.users.map((entry) => [entry.id, entry]))
const leagueById = new Map(dataset.leagues.map((entry) => [entry.id, entry]))
const leagueBySlug = new Map(dataset.leagues.map((entry) => [entry.slug, entry]))
const mapById = new Map(dataset.maps.map((entry) => [entry.id, entry]))
const leagueClanById = new Map(dataset.leagueClans.map((entry) => [entry.id, entry]))
const leaguePlayerById = new Map(dataset.leaguePlayers.map((entry) => [entry.id, entry]))
const boardById = new Map(dataset.boards.map((entry) => [entry.id, entry]))

const matchesDesc = [...dataset.matches].sort((a, b) => (a.startAt < b.startAt ? 1 : -1))

const matchesByLeagueClan = new Map<string, MockMatch[]>()
const matchesByPlayer = new Map<string, MockMatch[]>()
for (const match of matchesDesc) {
  for (const id of [match.redLeagueClanId, match.blueLeagueClanId]) {
    const list = matchesByLeagueClan.get(id) ?? []
    list.push(match)
    matchesByLeagueClan.set(id, list)
  }
  for (const stat of match.players) {
    const list = matchesByPlayer.get(`${match.leagueId}:${stat.playerId}`) ?? []
    list.push(match)
    matchesByPlayer.set(`${match.leagueId}:${stat.playerId}`, list)
  }
}

const leagueClansByLeague = new Map<string, MockLeagueClan[]>()
for (const leagueClan of dataset.leagueClans) {
  const list = leagueClansByLeague.get(leagueClan.leagueId) ?? []
  list.push(leagueClan)
  leagueClansByLeague.set(leagueClan.leagueId, list)
}

const leaguePlayersByLeague = new Map<string, MockLeaguePlayer[]>()
const leaguePlayerByLeagueAndPlayer = new Map<string, MockLeaguePlayer>()
for (const leaguePlayer of dataset.leaguePlayers) {
  const list = leaguePlayersByLeague.get(leaguePlayer.leagueId) ?? []
  list.push(leaguePlayer)
  leaguePlayersByLeague.set(leaguePlayer.leagueId, list)
  leaguePlayerByLeagueAndPlayer.set(`${leaguePlayer.leagueId}:${leaguePlayer.playerId}`, leaguePlayer)
}

const commentsByBoard = new Map<string, MockComment[]>()
for (const comment of dataset.comments) {
  const list = commentsByBoard.get(comment.boardId) ?? []
  list.push(comment)
  commentsByBoard.set(comment.boardId, list)
}

const matchCountByLeagueClan = new Map<string, number>()
for (const [id, list] of matchesByLeagueClan) matchCountByLeagueClan.set(id, list.length)

/** 무기별 누적 (leaguePlayerId → weapon → 합계). `packages/db/seed/seed.ts`와 **같은 규칙**이다.
    한쪽만 고치면 mock↔실제 대조가 깨진다 (실제로 깨졌다). */
interface MockWeaponBucket {
  win: number
  lose: number
  kill: number
  death: number
  /**
   * 그 무기로 뛴 경기에서 얻은 래더 증감의 합 (`LeaguePlayerWeaponStat.ratingDelta`).
   * 무기별 개인랭킹(D-169)의 정렬 기준이다. **무기별 공식은 없다** —
   * 통합 공식이 계산한 경기별 증감을 무기에 따라 나눠 담을 뿐이다 (`CLAUDE.md` 3-B 1번).
   */
  ratingDelta: number
  /** 그 무기로 뛴 경기 수. Mock 픽스처는 K/D 를 항상 알므로 `knownStatGames` 와 같다 */
  games: number
}

const weaponStatsByLeaguePlayer = new Map<string, Map<number, MockWeaponBucket>>()
for (const match of dataset.matches) {
  for (const stat of match.players) {
    const leaguePlayer = leaguePlayerByLeagueAndPlayer.get(`${match.leagueId}:${stat.playerId}`)
    if (!leaguePlayer) continue
    const byWeapon = weaponStatsByLeaguePlayer.get(leaguePlayer.id) ?? new Map()
    const bucket: MockWeaponBucket = byWeapon.get(stat.weapon) ?? {
      win: 0,
      lose: 0,
      kill: 0,
      death: 0,
      ratingDelta: 0,
      games: 0,
    }
    if (stat.win) bucket.win += 1
    else bucket.lose += 1
    bucket.kill += stat.kill
    bucket.death += stat.death
    bucket.ratingDelta += stat.ratingUpdate ?? 0
    bucket.games += 1
    byWeapon.set(stat.weapon, bucket)
    weaponStatsByLeaguePlayer.set(leaguePlayer.id, byWeapon)
  }
}

const matchCountByLeaguePlayer = new Map<string, number>()
for (const [key, list] of matchesByPlayer) matchCountByLeaguePlayer.set(key, list.length)

/**
 * 선수의 **고유 포지션** (D-199).
 *
 * 고르는 규칙은 여기 없다 — 실제 서버와 **같은 함수**(`resolvePlayerPositionOf`)를 쓴다.
 * 다르게 고르면 mock↔live 대조가 조용히 어긋난다.
 *
 * Mock 픽스처에는 **좌표 판정이 없다.** 그래서 사람이 정한 값과 주무기만 본다 —
 * 없는 판정을 지어내지 않는다 (D-106).
 */
function resolvePositionOf(leagueId: string, playerId: string): ResolvedPosition {
  const leaguePlayer = leaguePlayerByLeagueAndPlayer.get(`${leagueId}:${playerId}`)
  const byWeapon = leaguePlayer ? weaponStatsByLeaguePlayer.get(leaguePlayer.id) : undefined
  return resolvePlayerPositionOf({
    userSet: playerById.get(playerId)?.position ?? null,
    mainWeapon: mainWeaponOf(byWeapon?.get(0)?.games ?? 0, byWeapon?.get(1)?.games ?? 0),
    judged: null,
  })
}

/* -------------------------------------------------------------------------- */
/* 커서 페이지네이션                                                              */
/* -------------------------------------------------------------------------- */

export interface Page<T> {
  items: T[]
  cursor: CursorMetadata
}

/**
 * 표시 순서대로 정렬된 배열에서 커서 한 페이지를 잘라낸다.
 * 원본과 동일하게 페이지 번호 없이 `next`/`prev`만 제공한다.
 */
export function paginate<T>(
  ordered: readonly T[],
  cursor: string | null,
  size: number,
  getId: (item: T) => string,
): Page<T> {
  let start = 0
  const decoded = cursor ? decodeCursor(cursor) : null

  if (decoded) {
    const index = ordered.findIndex((item) => getId(item) === decoded.id)
    if (index >= 0) {
      start = decoded.direction === 'next' ? index + 1 : Math.max(0, index - size)
    }
  }

  const items = ordered.slice(start, start + size)
  const first = items[0]
  const last = items[items.length - 1]
  const hasPrev = start > 0
  const hasNext = start + size < ordered.length

  return {
    items,
    cursor: {
      prev: hasPrev && first ? encodeCursor('prev', getId(first)) : null,
      next: hasNext && last ? encodeCursor('next', getId(last)) : null,
    },
  }
}

/* -------------------------------------------------------------------------- */
/* 요약 매핑                                                                     */
/* -------------------------------------------------------------------------- */

function toClanSummary(clan: MockClan): ClanSummary {
  return {
    id: clan.id,
    slug: clan.slug,
    name: clan.name,
    mark: { bg: clan.markBg, front: clan.markFront },
    // Mock 의 클랜은 전부 리그에 등록된 클랜으로 본다 (D-146)
    is_official_clan: true,
  }
}

function toLeagueSummary(league: MockLeague): LeagueSummary {
  return {
    id: league.id,
    slug: league.slug,
    name: league.name,
    official: league.official,
    division_count: league.divisionCount,
    // 픽스처 리그는 전부 공식리그다. 무소속리그는 운영자가 만드는 실제 리그다 (D-107)
    hides_cumulative_kd: false,
    category: 'official',
  }
}

function toUserSummary(user: MockUser) {
  return {
    id: user.id,
    nickname: user.nickname,
    avatar_url: user.avatarUrl,
    role: user.role,
  }
}

function clanSummaryOf(clanId: string): ClanSummary | null {
  const clan = clanById.get(clanId)
  return clan ? toClanSummary(clan) : null
}

function playerClanSummary(player: MockPlayer): ClanSummary | null {
  return player.clanId ? clanSummaryOf(player.clanId) : null
}

/* -------------------------------------------------------------------------- */
/* 검색                                                                         */
/* -------------------------------------------------------------------------- */

/**
 * 검색은 **대소문자를 구분하지 않는다.**
 *
 * 예전에는 `===` / `String.includes` 를 그대로 썼다. 그랬더니 사용자가 `Huwho` 를
 * 넣었을 때 저장된 이름이 `huwho` 라 0건이 나왔다 — 검색이 사실상 동작하지 않았다.
 * 실제 API(`apps/web/lib/server/queries/search.ts`)도 같은 규칙으로 맞춰 두 모드의
 * 응답이 어긋나지 않게 했다. 원본의 정확한 조건은 **[미확인]** 이다.
 */
const fold = (value: string): string => value.toLowerCase()
const sameName = (a: string, b: string): boolean => fold(a) === fold(b)
const hasPart = (haystack: string, needle: string): boolean => fold(haystack).includes(fold(needle))

/**
 * 병영수첩 주소를 붙여 넣으면 그 선수를 찾는다 (D-162).
 *
 * 파서는 `@sacloud/contract` 에 있다 — 실제 API 와 **같은 규칙**을 써야
 * 두 모드 응답이 어긋나지 않는다. Mock 에는 `nexonOuid` 가 없어 닉네임 후보만 쓴다.
 */
function findPlayerByBarracksUrl(input: string): PlayerSearchItem | null {
  if (!isBarracksUrl(input)) return null
  for (const ref of playerRefsFromBarracksUrl(input)) {
    /* Mock 에는 `nexonOuid` 도 `PlayerPositionProfile` 도 없다. 계정 번호(D-254)는
       여기서 풀 수 없고, **못 찾는 게 맞다** — 가짜로 아무나 붙이지 않는다 */
    if (ref.kind !== 'nickname') continue
    const player = dataset.players.find((entry) => sameName(entry.name, ref.value))
    if (player) return { id: player.id, name: player.name, clan: playerClanSummary(player) }
  }
  return null
}

export function findPlayerByName(name: string): PlayerSearchItem | null {
  /* 붙여넣기에 딸려 온 공백·폭없는문자를 턴다. 실제 API 와 같은 규칙이다 (D-254) */
  const keyword = normalizePastedQuery(name)
  if (!keyword) return null

  const fromUrl = findPlayerByBarracksUrl(keyword)
  if (fromUrl) return fromUrl

  const player = dataset.players.find((entry) => sameName(entry.name, keyword))
  if (!player) return null
  return { id: player.id, name: player.name, clan: playerClanSummary(player) }
}

export function searchPlayers(query: string, limit = 10): PlayerSearchItem[] {
  const keyword = normalizePastedQuery(query)
  if (!keyword) return []
  /* 주소를 붙여 넣는 중에 부분일치가 끼어들면 방해가 되므로 그 결과만 준다 (D-162) */
  if (isBarracksUrl(keyword)) {
    const found = findPlayerByBarracksUrl(keyword)
    return found ? [found] : []
  }
  return dataset.players
    .filter((entry) => hasPart(entry.name, keyword))
    .slice(0, limit)
    .map((entry) => ({ id: entry.id, name: entry.name, clan: playerClanSummary(entry) }))
}

export function findClanByName(name: string): ClanSummary | null {
  const keyword = normalizePastedQuery(name)
  if (!keyword) return null

  /* 병영수첩 클랜 주소를 붙여 넣으면 그 클랜으로 간다 — 실제 API 와 같은 규칙 (D-254) */
  const slug = clanSlugFromBarracksUrl(keyword)
  if (slug) {
    const bySlug = dataset.clans.find((entry) => sameName(entry.slug, slug))
    return bySlug ? toClanSummary(bySlug) : null
  }

  const clan = dataset.clans.find((entry) => sameName(entry.name, keyword))
  return clan ? toClanSummary(clan) : null
}

export function searchClans(query: string, limit = 10): ClanSummary[] {
  const keyword = normalizePastedQuery(query)
  if (!keyword) return []

  /* 주소면 그 결과만 준다 (D-254) */
  const slug = clanSlugFromBarracksUrl(keyword)
  if (slug) {
    const bySlug = dataset.clans.find((entry) => sameName(entry.slug, slug))
    return bySlug ? [toClanSummary(bySlug)] : []
  }

  return dataset.clans
    .filter((entry) => hasPart(entry.name, keyword) || hasPart(entry.slug, keyword))
    .slice(0, limit)
    .map(toClanSummary)
}

export function findLeagueByName(name: string): LeagueSummary | null {
  const keyword = normalizePastedQuery(name)
  if (!keyword) return null
  const league = dataset.leagues.find((entry) => sameName(entry.name, keyword))
  return league ? toLeagueSummary(league) : null
}

export function searchLeagues(query: string, limit = 10): LeagueSummary[] {
  const keyword = normalizePastedQuery(query)
  if (!keyword) return []
  return dataset.leagues
    .filter((entry) => hasPart(entry.name, keyword) || hasPart(entry.slug, keyword))
    .slice(0, limit)
    .map(toLeagueSummary)
}

/* -------------------------------------------------------------------------- */
/* 플레이어 / 클랜                                                               */
/* -------------------------------------------------------------------------- */

export function getPlayer(playerId: string): Player | null {
  const player = playerById.get(playerId)
  if (!player) return null
  return {
    id: player.id,
    name: player.name,
    clan: playerClanSummary(player),
    position: player.position,
    note: player.note,
    renewed_at: player.renewedAt,
  }
}

export function getPlayerLeagues(playerId: string): PlayerLeagueEntry[] {
  const entries: PlayerLeagueEntry[] = []
  for (const leaguePlayer of dataset.leaguePlayers) {
    if (leaguePlayer.playerId !== playerId) continue
    const league = leagueById.get(leaguePlayer.leagueId)
    const leagueClan = leagueClanById.get(leaguePlayer.leagueClanId)
    if (!league || !leagueClan) continue
    const rank = playerRankOf(leaguePlayer)
    entries.push({
      league: toLeagueSummary(league),
      league_player_id: leaguePlayer.id,
      clan: clanSummaryOf(leagueClan.clanId),
      rating: leaguePlayer.rating,
      win: leaguePlayer.win,
      lose: leaguePlayer.lose,
      win_rate: winRate(leaguePlayer.win, leaguePlayer.lose),
      kill: leaguePlayer.kill,
      death: leaguePlayer.death,
      kd_rate: kdRate(leaguePlayer.kill, leaguePlayer.death),
      placement: leaguePlayer.placement,
      rank: rank.rank,
      rank_count: rank.rankCount,
    })
  }
  return entries
}

export function getClan(clanSlug: string): Clan | null {
  const clan = clanBySlug.get(clanSlug)
  if (!clan) return null
  const master = playerById.get(clan.masterPlayerId)
  return {
    id: clan.id,
    slug: clan.slug,
    name: clan.name,
    mark: { bg: clan.markBg, front: clan.markFront },
    master: master ? { id: master.id, name: master.name } : null,
    established_at: clan.establishedAt,
    notice: clan.notice,
    renewed_at: clan.renewedAt,
    member_count: clan.playerIds.length,
  }
}

export function getClanPlayers(clanSlug: string, cursor: string | null, size: number): Page<ClanPlayer> | null {
  const clan = clanBySlug.get(clanSlug)
  if (!clan) return null
  const members: ClanPlayer[] = clan.playerIds
    .map((id) => playerById.get(id))
    .filter((entry): entry is MockPlayer => Boolean(entry))
    .map((entry) => ({
      id: entry.id,
      name: entry.name,
      position: entry.position,
      master: entry.id === clan.masterPlayerId,
    }))
  return paginate(members, cursor, size, (item) => item.id)
}

export function getClanLeagues(clanSlug: string): ClanLeagueEntry[] | null {
  const clan = clanBySlug.get(clanSlug)
  if (!clan) return null
  const entries: ClanLeagueEntry[] = []
  for (const leagueClan of dataset.leagueClans) {
    if (leagueClan.clanId !== clan.id) continue
    const league = leagueById.get(leagueClan.leagueId)
    if (!league) continue
    const rank = clanRankOf(leagueClan)
    entries.push({
      league: toLeagueSummary(league),
      league_clan_id: leagueClan.id,
      rating: leagueClan.rating,
      division: leagueClan.division,
      win: leagueClan.win,
      lose: leagueClan.lose,
      win_rate: winRate(leagueClan.win, leagueClan.lose),
      placement: leagueClan.placement,
      status: leagueClan.status,
      joined_at: leagueClan.joinedAt,
      rank: rank.rank,
      rank_count: rank.rankCount,
    })
  }
  return entries
}

/* -------------------------------------------------------------------------- */
/* 리그                                                                         */
/* -------------------------------------------------------------------------- */

const leagueListOrdered: LeagueListItem[] = dataset.leagues.map((league) => {
  const joined = leagueClansByLeague.get(league.id) ?? []
  const owner = userById.get(league.ownerUserId)
  return {
    ...toLeagueSummary(league),
    user: owner ? toUserSummary(owner) : null,
    clan_count: joined.length,
    created_at: league.createdAt,
    // 목록에 노출되는 대표 클랜 (관측: 3개)
    clans: joined
      .slice(0, 3)
      .map((leagueClan) => clanSummaryOf(leagueClan.clanId))
      .filter((entry): entry is ClanSummary => Boolean(entry)),
  }
})

export function listLeagues(cursor: string | null, size: number): Page<LeagueListItem> {
  return paginate(leagueListOrdered, cursor, size, (item) => item.id)
}

export function getLeague(leagueSlug: string): League | null {
  const league = leagueBySlug.get(leagueSlug)
  if (!league) return null
  const owner = userById.get(league.ownerUserId)
  return {
    ...toLeagueSummary(league),
    description: league.description,
    user: owner ? toUserSummary(owner) : null,
    maps: league.mapIds
      .map((id) => mapById.get(id))
      .filter((entry): entry is { id: string; name: string } => Boolean(entry)),
    player_limits: league.playerLimits as (5 | 6)[],
    clan_count: (leagueClansByLeague.get(league.id) ?? []).length,
    status: league.status,
    created_at: league.createdAt,
    season: league.season,
    // mock 픽스처는 전부 정식 시즌이다. 베타 표기는 실제 운영 리그에서만 나온다 (D-098)
    season_type: 'official' as const,
    season_label: `시즌 ${league.season}`,
  }
}

function toLeagueClan(leagueClan: MockLeagueClan): LeagueClan | null {
  const clan = clanById.get(leagueClan.clanId)
  if (!clan) return null
  return {
    id: leagueClan.id,
    league_id: leagueClan.leagueId,
    clan: toClanSummary(clan),
    rating: leagueClan.rating,
    division: leagueClan.division,
    win: leagueClan.win,
    lose: leagueClan.lose,
    win_rate: winRate(leagueClan.win, leagueClan.lose),
    placement: leagueClan.placement,
    status: leagueClan.status,
    joined_at: leagueClan.joinedAt,
  }
}

export function getLeagueClans(leagueSlug: string, cursor: string | null, size: number): Page<LeagueClan> | null {
  const league = leagueBySlug.get(leagueSlug)
  if (!league) return null
  const ordered = (leagueClansByLeague.get(league.id) ?? [])
    .slice()
    .sort((a, b) => a.division - b.division || b.rating - a.rating)
    .map(toLeagueClan)
    .filter((entry): entry is LeagueClan => Boolean(entry))
  return paginate(ordered, cursor, size, (item) => item.id)
}

/* ------------------------------- 랭킹 -------------------------------- */

/**
 * 랭킹은 배치고사가 끝난 대상만 노출한다(관측).
 * 원본은 1시간 주기 배치로 만들지만, Mock은 요청 시 정렬한다.
 * 갱신 주기 재현은 Phase 9의 랭킹 배치에서 다룬다.
 */
/**
 * `division <= 0` 이면 **부리그를 나누지 않는다** (2026-09-01 · 실제 API 와 짝).
 *
 * 픽스처 리그는 전부 공식리그라 이때 정렬은 래더 순 한 가지다.
 * 실제 API 는 무소속리그에서 티어 오름차순을 유지하는데, Mock 에는 무소속리그가 없어
 * 그 갈래를 재현할 대상 자체가 없다 — **없는 데이터를 지어내지 않는다.**
 */
function rankedClans(leagueId: string, division: number): MockLeagueClan[] {
  return (leagueClansByLeague.get(leagueId) ?? [])
    .filter((entry) => (division <= 0 || entry.division === division) && !entry.placement)
    .sort((a, b) => b.rating - a.rating || a.id.localeCompare(b.id))
}

function rankedPlayers(leagueId: string): MockLeaguePlayer[] {
  return (leaguePlayersByLeague.get(leagueId) ?? [])
    .filter((entry) => !entry.placement)
    .sort((a, b) => b.rating - a.rating || a.id.localeCompare(b.id))
}

function clanRankOf(leagueClan: MockLeagueClan): { rank: number | null; rankCount: number | null } {
  if (leagueClan.placement) return { rank: null, rankCount: null }
  const ranked = rankedClans(leagueClan.leagueId, leagueClan.division)
  const index = ranked.findIndex((entry) => entry.id === leagueClan.id)
  return index < 0 ? { rank: null, rankCount: ranked.length } : { rank: index + 1, rankCount: ranked.length }
}

function playerRankOf(leaguePlayer: MockLeaguePlayer): { rank: number | null; rankCount: number | null } {
  if (leaguePlayer.placement) return { rank: null, rankCount: null }
  const ranked = rankedPlayers(leaguePlayer.leagueId)
  const index = ranked.findIndex((entry) => entry.id === leaguePlayer.id)
  return index < 0 ? { rank: null, rankCount: ranked.length } : { rank: index + 1, rankCount: ranked.length }
}

export function getClanRanks(
  leagueId: string,
  division: number,
  cursor: string | null,
  size: number,
): Page<ClanRankRow> | null {
  if (!leagueById.has(leagueId)) return null
  const rows: ClanRankRow[] = rankedClans(leagueId, division)
    .map((leagueClan, index) => {
      const clan = clanById.get(leagueClan.clanId)
      if (!clan) return null
      return {
        rank: index + 1,
        league_clan_id: leagueClan.id,
        clan: toClanSummary(clan),
        division: leagueClan.division,
        win: leagueClan.win,
        lose: leagueClan.lose,
        win_rate: winRate(leagueClan.win, leagueClan.lose),
        rating: leagueClan.rating,
        // 픽스처 클랜은 전부 공식리그 소속이다 (무소속은 실운영 데이터에서만 생긴다)
        category: 'official',
      }
    })
    .filter((entry): entry is ClanRankRow => Boolean(entry))
  return paginate(rows, cursor, size, (item) => item.league_clan_id)
}

/**
 * 전체 통합 클랜 래더 — 부리그를 **섞어서** rating 순 (D-104).
 *
 * 실제 서버의 `getOverallClanLadder` 와 짝이다. 메인 신전 히어로가 «IPL 1등» 을
 * 그릴 때 부른다. Mock 리그는 전부 부리그 1~N 짜리 공식리그라 `category` 는
 * `official` 고정이다 — `getClanRanks` 와 같은 이유다.
 *
 * @param limit 상위 N건만. 생략하면 전부.
 */
export function getOverallClanRanks(leagueId: string, limit?: number): ClanRankRow[] | null {
  if (!leagueById.has(leagueId)) return null
  const rows = (leagueClansByLeague.get(leagueId) ?? [])
    .filter((entry) => !entry.placement)
    .sort((a, b) => b.rating - a.rating || a.id.localeCompare(b.id))
    .map((leagueClan, index) => {
      const clan = clanById.get(leagueClan.clanId)
      if (!clan) return null
      return {
        rank: index + 1,
        league_clan_id: leagueClan.id,
        clan: toClanSummary(clan),
        division: leagueClan.division,
        win: leagueClan.win,
        lose: leagueClan.lose,
        win_rate: winRate(leagueClan.win, leagueClan.lose),
        rating: leagueClan.rating,
        category: 'official',
      }
    })
    .filter((entry): entry is ClanRankRow => Boolean(entry))
  return limit === undefined ? rows : rows.slice(0, limit)
}

export function getPlayerRanks(leagueId: string, cursor: string | null, size: number): Page<PlayerRankRow> | null {
  if (!leagueById.has(leagueId)) return null
  const rows: PlayerRankRow[] = rankedPlayers(leagueId)
    .map((leaguePlayer, index): PlayerRankRow | null => {
      const player = playerById.get(leaguePlayer.playerId)
      const leagueClan = leagueClanById.get(leaguePlayer.leagueClanId)
      if (!player || !leagueClan) return null
      const matchCount = matchCountByLeaguePlayer.get(`${leaguePlayer.leagueId}:${leaguePlayer.playerId}`) ?? 0
      return {
        rank: index + 1,
        league_player_id: leaguePlayer.id,
        player: { id: player.id, name: player.name },
        clan: clanSummaryOf(leagueClan.clanId),
        win: leaguePlayer.win,
        lose: leaguePlayer.lose,
        win_rate: winRate(leaguePlayer.win, leaguePlayer.lose),
        kd_rate: kdRate(leaguePlayer.kill, leaguePlayer.death),
        kill_per_match: killPerMatch(leaguePlayer.kill, matchCount),
        rating: leaguePlayer.rating,
        weapon: 'all',
        rating_delta: null,
      }
    })
    .filter((entry): entry is PlayerRankRow => Boolean(entry))
  return paginate(rows, cursor, size, (item) => item.league_player_id)
}

/* ------------------------- 무기별 개인랭킹 · 폼 TOP3 (D-169) ------------------------- */

/** 한 무기 축(스나·라플)만 가리키는 좁은 타입 — `all` 은 여기 오지 않는다 */
export type WeaponAxis = Exclude<RankWeapon, 'all'>

/**
 * 무기별 개인랭킹 — **원본에 없는 우리 신규 기능**이다 (D-169).
 *
 * 실제 API(`apps/web/lib/server/queries/rankings.ts`)와 **같은 규칙**이어야 한다.
 *   · 정렬: `ratingDelta` 내림차순, 동점이면 `leaguePlayerId` 오름차순
 *   · 모집단: 배치고사가 끝났고 그 무기로 뛴 기록이 있는 선수
 *   · 승·패·킬·데스는 **그 무기 버킷의 값**이다. 통합 누적을 섞지 않는다
 *   · 통합 래더(`rating`)는 무기 탭에서도 통합 래더 그대로다 (`CLAUDE.md` 3-B 2번)
 */
export function getPlayerRanksByWeapon(
  leagueId: string,
  weapon: WeaponAxis,
  cursor: string | null,
  size: number,
): Page<PlayerRankRow> | null {
  if (!leagueById.has(leagueId)) return null
  const code = RANK_WEAPON_CODE[weapon]

  const rows: PlayerRankRow[] = (leaguePlayersByLeague.get(leagueId) ?? [])
    .filter((entry) => !entry.placement)
    .flatMap((leaguePlayer) => {
      const bucket = weaponStatsByLeaguePlayer.get(leaguePlayer.id)?.get(code)
      if (!bucket || bucket.games === 0) return []
      const player = playerById.get(leaguePlayer.playerId)
      const leagueClan = leagueClanById.get(leaguePlayer.leagueClanId)
      if (!player || !leagueClan) return []
      return [{ leaguePlayer, bucket, player, leagueClan }]
    })
    .sort(
      (a, b) =>
        b.bucket.ratingDelta - a.bucket.ratingDelta ||
        a.leaguePlayer.id.localeCompare(b.leaguePlayer.id),
    )
    .map(({ leaguePlayer, bucket, player, leagueClan }, index) => ({
      rank: index + 1,
      league_player_id: leaguePlayer.id,
      player: { id: player.id, name: player.name },
      clan: clanSummaryOf(leagueClan.clanId),
      win: bucket.win,
      lose: bucket.lose,
      win_rate: winRate(bucket.win, bucket.lose),
      kd_rate: kdRate(bucket.kill, bucket.death),
      kill_per_match: killPerMatch(bucket.kill, bucket.games),
      rating: leaguePlayer.rating,
      weapon,
      rating_delta: bucket.ratingDelta,
    }))

  return paginate(rows, cursor, size, (item) => item.league_player_id)
}

/**
 * 폼 TOP3 — **원본에 없는 우리 신규 기능**이다 (D-169).
 *
 * 그날(KST 자정 기준) 하루 동안 얻은 래더 증감의 합이 큰 순서로 3명.
 * 최소 3경기, 동점이면 경기 수가 많은 쪽이 위.
 * 대상 날짜는 **가장 최근에 경기가 있었던 날**이다 (실제 API와 같은 규칙).
 *
 * Mock 픽스처의 `startAt` 은 이미 KST 고정 오프셋 문자열이라 앞 10글자가 곧 KST 날짜다.
 */
export function getFormTop(leagueId: string, weapon: RankWeapon): FormTop | null {
  if (!leagueById.has(leagueId)) return null
  const empty: FormTop = { date: null, is_today: false, weapon, rows: [] }

  const inLeague = matchesDesc.filter((match) => match.leagueId === leagueId)
  const latest = inLeague[0]
  if (!latest) return empty

  const day = latest.startAt.slice(0, 10)
  const isToday = day === kstToday()
  const code = weapon === 'all' ? null : RANK_WEAPON_CODE[weapon]

  const acc = new Map<string, { delta: number; games: number }>()
  for (const match of inLeague) {
    if (match.startAt.slice(0, 10) !== day) continue
    for (const stat of match.players) {
      if (code !== null && stat.weapon !== code) continue
      const entry = acc.get(stat.playerId) ?? { delta: 0, games: 0 }
      entry.delta += stat.ratingUpdate ?? 0
      entry.games += 1
      acc.set(stat.playerId, entry)
    }
  }

  const rows = [...acc.entries()]
    .filter(([, value]) => value.games >= FORM_TOP_MIN_GAMES)
    .sort(
      (a, b) => b[1].delta - a[1].delta || b[1].games - a[1].games || a[0].localeCompare(b[0]),
    )
    .slice(0, FORM_TOP_SIZE)
    .flatMap(([playerId, value], index) => {
      const leaguePlayer = leaguePlayerByLeagueAndPlayer.get(`${leagueId}:${playerId}`)
      const player = playerById.get(playerId)
      if (!leaguePlayer || !player) return []
      const leagueClan = leagueClanById.get(leaguePlayer.leagueClanId)
      return [
        {
          rank: index + 1,
          league_player_id: leaguePlayer.id,
          player: { id: player.id, name: player.name },
          clan: leagueClan ? clanSummaryOf(leagueClan.clanId) : null,
          rating_delta: value.delta,
          games: value.games,
        },
      ]
    })

  return { date: day, is_today: isToday, weapon, rows }
}

/** 오늘(KST) `YYYY-MM-DD` */
function kstToday(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/* -------------------------------------------------------------------------- */
/* 매치                                                                         */
/* -------------------------------------------------------------------------- */

/**
 * 경기 당시 소속 클랜 (D-131).
 *
 * Mock 픽스처에는 **이적이 없다.** 그래서 경기 당시 소속과 현재 소속이 같고,
 * 선수의 클랜을 그대로 쓴다. 실제 API는 `MatchPlayerStat`에 박아 둔 스냅샷을 읽는다.
 */
function matchTimeClanOf(playerId: string) {
  const clanId = playerById.get(playerId)?.clanId
  const clan = clanId ? clanById.get(clanId) : undefined
  if (!clan) return null
  const summary = toClanSummary(clan)
  return {
    league_clan_id: summary.id,
    slug: summary.slug,
    name: summary.name,
    mark: summary.mark,
    // Mock 의 클랜은 전부 등록 클랜으로 본다 (D-146)
    is_official_clan: true,
  }
}

function lineupOf(match: MockMatch, side: TeamSide): MatchLineupEntry[] {
  return match.players
    .filter((stat) => stat.side === side)
    .map((stat) => ({
      player_id: stat.playerId,
      name: playerById.get(stat.playerId)?.name ?? '알수없음',
      weapon: stat.weapon,
      dropout: stat.dropout,
      match_time_clan: matchTimeClanOf(stat.playerId),
    }))
}

function teamDamage(match: MockMatch, side: TeamSide): number {
  return match.players.reduce((sum, stat) => (stat.side === side ? sum + stat.damage : sum), 0)
}

/**
 * 결측 처리.
 * 원본은 상대 클랜 소속 플레이어의 딜량·헤드샷을 `알수없음`으로 표시한다.
 * Mock 데이터에는 양쪽 값이 모두 있지만, **보는 쪽이 아닌 팀**의 값을 응답에서 null로 지운다.
 * (원본의 노출 한계를 그대로 재현하기 위한 것으로, 데이터 자체가 없는 것은 아니다.)
 */
function toMatchPlayerStat(
  match: MockMatch,
  stat: MockMatchPlayer,
  visible: boolean,
  /**
   * 선수의 **고유 포지션** 표기 (D-199). 경기 **상세**에서만 채운다 —
   * 목록에서는 비어 있고(`null`) 화면은 이름만 적는다. 실제 서버와 같은 규칙이다.
   */
  positions?: Map<string, string | null>,
): MatchPlayerStat {
  const damage = visible ? stat.damage : null
  const headshot = visible ? stat.headshot : null
  return {
    player_id: stat.playerId,
    name: playerById.get(stat.playerId)?.name ?? '알수없음',
    side: stat.side,
    kill: stat.kill,
    death: stat.death,
    assist: stat.assist,
    headshot,
    damage,
    kd_rate: kdRate(stat.kill, stat.death),
    damage_percent: damage === null ? null : percentOf(damage, teamDamage(match, stat.side)),
    headshot_percent: headshot === null ? null : percentOf(headshot, stat.kill),
    weapon: stat.weapon,
    rating: stat.rating,
    rating_update: stat.ratingUpdate,
    placement: stat.placement,
    dropout: stat.dropout,
    win: stat.win,
    mvp: stat.mvp,
    match_time_clan: matchTimeClanOf(stat.playerId),
    /* 포지션은 이 경기의 사실이 아니라 **그 선수의 고유 자리**다 (D-199).
       그 판에 실제로 스나를 들었는지는 위 `weapon` 이 따로 말한다 */
    position_label: positions?.get(stat.playerId) ?? null,
  }
}

function snapshotOf(match: MockMatch, side: TeamSide) {
  const leagueClanId = side === 'red' ? match.redLeagueClanId : match.blueLeagueClanId
  const leagueClan = leagueClanById.get(leagueClanId)
  const clan = leagueClan ? clanById.get(leagueClan.clanId) : undefined
  if (!leagueClan || !clan) return null
  return {
    league_clan_id: leagueClan.id,
    clan: toClanSummary(clan),
    rating: side === 'red' ? match.redRating : match.blueRating,
    division: side === 'red' ? match.redDivision : match.blueDivision,
    placement: side === 'red' ? match.redPlacement : match.bluePlacement,
    // mock 경기는 재구성이 아니라 본클랜원/용병 구분이라는 개념이 없다
    members_confirmed: null,
    mercenaries_confirmed: null,
    /* Mock 픽스처는 재구성 경기가 아니라 구성 근거가 없다 (D-149) */
    composition_score: null,
    composition_members: null,
  }
}

function sideOfLeagueClan(match: MockMatch, leagueClanId: string): TeamSide | null {
  if (match.redLeagueClanId === leagueClanId) return 'red'
  if (match.blueLeagueClanId === leagueClanId) return 'blue'
  return null
}

function toMatchListItem(
  match: MockMatch,
  viewerLeagueClanId: string,
  viewerPlayerId: string | null,
): MatchListItem | null {
  const viewerSide = sideOfLeagueClan(match, viewerLeagueClanId)
  if (!viewerSide) return null
  const opponentSide: TeamSide = viewerSide === 'red' ? 'blue' : 'red'
  const own = snapshotOf(match, viewerSide)
  const opponent = snapshotOf(match, opponentSide)
  const map = mapById.get(match.mapId)
  if (!own || !opponent || !map) return null

  const viewerStat = viewerPlayerId
    ? match.players.find((stat) => stat.playerId === viewerPlayerId && stat.side === viewerSide)
    : undefined

  return {
    id: match.id,
    league_id: match.leagueId,
    map,
    player_count: match.playerCount,
    start_at: match.startAt,
    end_at: match.endAt,
    play_time: match.playTime,
    win: match.winnerSide === viewerSide,
    /* 보는 쪽이 전반에 선 진영 (D-207). 저장된 값은 **슬롯** 이름이라
       보는 쪽 슬롯과 같으면 `선레드`(= 'red'), 아니면 `선블루`(= 'blue') 다.
       실제 API(`apps/web/lib/server/queries/matches.ts` 의 `firstSideOf`)와 같은 규칙이다 */
    first_side:
      match.firstHalfAttackSide === null
        ? null
        : match.firstHalfAttackSide === viewerSide
          ? 'red'
          : 'blue',
    placement: viewerSide === 'red' ? match.redPlacement : match.bluePlacement,
    rating_update: viewerSide === 'red' ? match.redRatingUpdate : match.blueRatingUpdate,
    mvp_player_id: match.mvpPlayerId,
    league_clan: own,
    opponent,
    red: lineupOf(match, 'red'),
    blue: lineupOf(match, 'blue'),
    player_stat: viewerStat ? toMatchPlayerStat(match, viewerStat, true) : null,
    // mock 경기는 재구성이 아니다 — 확인 수준이라는 개념 자체가 없다
    participant_completeness: null,
    evidence_confidence: null,

  }
}

export function getLeaguePlayerMatches(
  leagueId: string,
  playerId: string,
  cursor: string | null,
  size: number,
): Page<MatchListItem> | null {
  const leaguePlayer = leaguePlayerByLeagueAndPlayer.get(`${leagueId}:${playerId}`)
  if (!leaguePlayer) return null
  const ordered = (matchesByPlayer.get(`${leagueId}:${playerId}`) ?? [])
    .map((match) => toMatchListItem(match, leaguePlayer.leagueClanId, playerId))
    .filter((entry): entry is MatchListItem => Boolean(entry))
  return paginate(ordered, cursor, size, (item) => item.id)
}

export function getLeagueClanMatches(
  leagueClanId: string,
  cursor: string | null,
  size: number,
): Page<MatchListItem> | null {
  if (!leagueClanById.has(leagueClanId)) return null
  const ordered = (matchesByLeagueClan.get(leagueClanId) ?? [])
    .map((match) => toMatchListItem(match, leagueClanId, null))
    .filter((entry): entry is MatchListItem => Boolean(entry))
  return paginate(ordered, cursor, size, (item) => item.id)
}

/**
 * 매치 상세.
 * `viewerLeagueClanId`는 어느 쪽 기록실에서 펼쳤는지를 나타낸다.
 * 원본 URL에는 이 정보가 없지만(아코디언이라 개별 URL이 없다), 결측 처리를 재현하려면 필요하다.
 * 계약에서는 선택적 쿼리 파라미터로 두고 `[자체 설계]`로 표시한다.
 */
export function getMatch(
  leagueId: string,
  matchId: string,
  viewerLeagueClanId: string | null,
): MatchDetail | null {
  const match = matchesDesc.find((entry) => entry.id === matchId && entry.leagueId === leagueId)
  if (!match) return null

  const viewerId = viewerLeagueClanId ?? match.redLeagueClanId
  const base = toMatchListItem(match, viewerId, null)
  if (!base) return null
  const viewerSide = sideOfLeagueClan(match, viewerId)
  if (!viewerSide) return null

  /* 참가자 포지션 — **여기서만** 채운다 (D-199). 목록에서는 비운다 (실제 서버와 같다) */
  const positions = new Map<string, string | null>(
    match.players.map((stat) => [stat.playerId, resolvePositionOf(leagueId, stat.playerId).label]),
  )

  const statsOf = (side: TeamSide): MatchPlayerStat[] =>
    match.players
      .filter((stat) => stat.side === side)
      .map((stat) => toMatchPlayerStat(match, stat, side === viewerSide, positions))

  /* 두 클랜의 육각형 V2 — 겹쳐 그리라고 양쪽 다 준다 (D-235 Q7). 각 칸이
     `league_clan_id` 를 들고 있어 어느 쪽이 우리인지는 짐작이 아니라 대조로 정해진다 */
  const hexV2 = buildMatchHexV2OfMock(match)

  return {
    ...base,
    red_stats: statsOf('red'),
    blue_stats: statsOf('blue'),
    red_hexagon_v2: hexV2.red
      ? { league_clan_id: match.redLeagueClanId, hexagon: hexV2.red }
      : null,
    blue_hexagon_v2: hexV2.blue
      ? { league_clan_id: match.blueLeagueClanId, hexagon: hexV2.blue }
      : null,
  }
}

/* ------------------------- 기록실 상단 요약 / 사이드 ------------------------ */

/** 관측: 최근 20전 기준 요약 */
const RECENT_MATCH_COUNT = 20

function buildMatchSummary(matches: MockMatch[], leagueClanId: string, playerId: string | null): MatchSummary {
  const recent = matches.slice(0, RECENT_MATCH_COUNT)
  let win = 0
  let lose = 0
  const opponentMap = new Map<string, { win: number; lose: number; kill: number; death: number }>()

  for (const match of recent) {
    const side = sideOfLeagueClan(match, leagueClanId)
    if (!side) continue
    const won = match.winnerSide === side
    if (won) win += 1
    else lose += 1

    const opponentId = side === 'red' ? match.blueLeagueClanId : match.redLeagueClanId
    const entry = opponentMap.get(opponentId) ?? { win: 0, lose: 0, kill: 0, death: 0 }
    if (won) entry.win += 1
    else entry.lose += 1
    for (const stat of match.players) {
      if (stat.side !== side) continue
      if (playerId && stat.playerId !== playerId) continue
      entry.kill += stat.kill
      entry.death += stat.death
    }
    opponentMap.set(opponentId, entry)
  }

  // 연승/연패 (최근 경기부터 같은 결과가 이어진 횟수)
  let streakCount = 0
  let streakType: 'win' | 'lose' | 'none' = 'none'
  for (const match of matches) {
    const side = sideOfLeagueClan(match, leagueClanId)
    if (!side) continue
    const won = match.winnerSide === side
    const type = won ? 'win' : 'lose'
    if (streakType === 'none') {
      streakType = type
      streakCount = 1
    } else if (streakType === type) {
      streakCount += 1
    } else {
      break
    }
  }

  const opponents: OpponentSummaryEntry[] = []
  for (const [opponentLeagueClanId, entry] of opponentMap) {
    const opponentLeagueClan = leagueClanById.get(opponentLeagueClanId)
    const clan = opponentLeagueClan ? clanById.get(opponentLeagueClan.clanId) : undefined
    if (!clan) continue
    opponents.push({
      clan: toClanSummary(clan),
      win: entry.win,
      lose: entry.lose,
      win_rate: winRate(entry.win, entry.lose),
      kd_rate: kdRate(entry.kill, entry.death),
    })
  }
  opponents.sort((a, b) => b.win + b.lose - (a.win + a.lose))

  return {
    recent_count: recent.length,
    win,
    lose,
    win_rate: winRate(win, lose),
    streak: { type: streakType, count: streakCount },
    opponents,
  }
}

function buildTeammates(matches: MockMatch[], leagueClanId: string, playerId: string | null): TeammateStat[] {
  const stats = new Map<string, { win: number; lose: number }>()
  for (const match of matches.slice(0, RECENT_MATCH_COUNT)) {
    const side = sideOfLeagueClan(match, leagueClanId)
    if (!side) continue
    const won = match.winnerSide === side
    for (const stat of match.players) {
      if (stat.side !== side) continue
      if (playerId && stat.playerId === playerId) continue
      const entry = stats.get(stat.playerId) ?? { win: 0, lose: 0 }
      if (won) entry.win += 1
      else entry.lose += 1
      stats.set(stat.playerId, entry)
    }
  }

  const rows: TeammateStat[] = []
  for (const [id, entry] of stats) {
    const player = playerById.get(id)
    if (!player) continue
    rows.push({
      player: { id: player.id, name: player.name },
      win: entry.win,
      lose: entry.lose,
      win_rate: winRate(entry.win, entry.lose),
    })
  }
  rows.sort((a, b) => b.win + b.lose - (a.win + a.lose))
  return rows.slice(0, 10)
}

/* ------------------------------ 오늘 퍼포먼스 ------------------------------ */

/**
 * `오늘 퍼포먼스` (10절 · D-182) — 오늘(KST) 뛴 경기를 센다.
 *
 * 판정과 문구는 `@sacloud/contract` 의 `buildTodayPerformance()` 가 전부 한다.
 * 실제 서버(`apps/web/lib/server/queries/todayPerformance.ts`)도 **같은 함수**를 쓴다.
 * 여기서 다르게 계산하면 mock↔live 대조가 어긋난다.
 *
 * 픽스처는 결정적이지만 `오늘` 은 그렇지 않다 — 픽스처 경기가 오늘 날짜에 걸리지 않으면
 * `오늘 경기기록 없음` 이 나온다. **그것이 정상이고, 가짜 오늘 경기를 지어내지 않는다.**
 */
function buildTodayPerf(
  matches: MockMatch[],
  playerId: string,
  seasonKdRate: number | null,
  now: Date,
): TodayPerformance {
  const from = kstDayStart(now).getTime()
  const tally: TodayTally = { games: 0, knownGames: 0, win: 0, lose: 0, kill: 0, death: 0 }

  for (const match of matches) {
    if (new Date(match.startAt).getTime() < from) continue
    const stat = match.players.find((row) => row.playerId === playerId)
    if (!stat) continue
    tally.games += 1
    /* Mock 픽스처는 K/D 가 항상 있다. 운영에서는 미러 경기에 결측이 섞인다 (D-148) */
    tally.knownGames += 1
    tally.kill += stat.kill
    tally.death += stat.death
    if (stat.side === match.winnerSide) tally.win += 1
    else tally.lose += 1
  }

  return buildTodayPerformance(tally, seasonKdRate)
}

/* ------------------------------ 최근 3일치 기록 ------------------------------ */

/**
 * 최근 3일치 **일별 기록** (D-198).
 *
 * 실제 서버(`apps/web/lib/server/queries/recentDays.ts`)와 **같은 규칙**이다 —
 * 첫 줄은 언제나 오늘, 그 아래는 실제로 뛴 날 두 개, 하루 경계는 오전 7시 KST.
 * 여기서 다르게 세면 mock ↔ live 대조가 어긋난다.
 */
function buildRecentDays(
  matches: MockMatch[],
  playerId: string,
  now: Date,
): PlayerDayRecord[] {
  interface Bucket {
    games: number
    win: number
    lose: number
    kill: number
    death: number
  }
  const byDay = new Map<string, Bucket>()
  for (const match of matches) {
    const stat = match.players.find((row) => row.playerId === playerId)
    if (!stat) continue
    const key = kstDayKey(new Date(match.startAt))
    const bucket = byDay.get(key) ?? { games: 0, win: 0, lose: 0, kill: 0, death: 0 }
    bucket.games += 1
    bucket.kill += stat.kill
    bucket.death += stat.death
    if (stat.side === match.winnerSide) bucket.win += 1
    else bucket.lose += 1
    byDay.set(key, bucket)
  }

  const todayKey = kstDayKey(now)
  const toRow = (key: string): PlayerDayRecord => {
    const bucket = byDay.get(key)
    const label = dayLabelOf(key, todayKey)
    if (!bucket || bucket.games === 0) {
      return {
        date: key,
        label,
        played: false,
        games: 0,
        win: 0,
        lose: 0,
        win_rate: null,
        kd_rate: null,
        kill_per_match: null,
      }
    }
    return {
      date: key,
      label,
      played: true,
      games: bucket.games,
      win: bucket.win,
      lose: bucket.lose,
      win_rate: winRateOrNull(bucket.win, bucket.lose),
      kd_rate: kdRateOrNull(bucket.kill, bucket.death),
      kill_per_match: killPerMatch(bucket.kill, bucket.games),
    }
  }

  const rest = [...byDay.keys()]
    .filter((key) => key !== todayKey)
    .sort()
    .reverse()
    .slice(0, 2)
  return [toRow(todayKey), ...rest.map(toRow)]
}

/* ------------------------- 티어별 게임빈도 + 천적 -------------------------- */

/**
 * 티어별 판수·승률 + 천적 (`docs/SITE_SPEC_V2.md` 4절).
 *
 * 임계값(10판 · 50판 · 70%)과 줄 만들기는 `@sacloud/contract` 의
 * `buildTierBreakdown()` 에 있고, 실제 서버
 * (`apps/web/lib/server/queries/tierBreakdown.ts`)도 **같은 함수**를 쓴다.
 * 여기서 다르게 판정하면 mock↔live 대조가 어긋난다.
 *
 * 티어는 **경기 당시** 상대 진영의 division 이다 — Mock 도 경기마다
 * `redDivision` / `blueDivision` 스냅샷을 들고 있어 현재 division 을 보지 않는다
 * (`CLAUDE.md` 3-B 4번).
 */
function buildTierBreakdownRows(
  matches: MockMatch[],
  playerId: string,
  divisionCount: number,
): PlayerTierRecord[] {
  interface Bucket {
    games: number
    win: number
    lose: number
    clans: Map<string, { games: number; win: number; lose: number }>
  }
  const byTier = new Map<number, Bucket>()

  for (const match of matches) {
    const stat = match.players.find((row) => row.playerId === playerId)
    if (!stat) continue
    const isRed = stat.side === 'red'
    const tier = isRed ? match.blueDivision : match.redDivision
    const opponentId = isRed ? match.blueLeagueClanId : match.redLeagueClanId
    const win = stat.side === match.winnerSide

    const bucket = byTier.get(tier) ?? { games: 0, win: 0, lose: 0, clans: new Map() }
    bucket.games += 1
    if (win) bucket.win += 1
    else bucket.lose += 1
    const clan = bucket.clans.get(opponentId) ?? { games: 0, win: 0, lose: 0 }
    clan.games += 1
    if (win) clan.win += 1
    else clan.lose += 1
    bucket.clans.set(opponentId, clan)
    byTier.set(tier, bucket)
  }

  const tallies: TierTally[] = [...byTier.entries()].map(([tier, bucket]) => {
    const clans: TierClanTally[] = []
    for (const [id, clan] of bucket.clans) {
      /* 이름을 모르는 상대는 천적 후보에서 뺀다. 판수에는 이미 들어가 있으므로
         경기가 사라지지는 않는다 — `알수없음 의 천적` 을 만들지 않으려는 것이다 (D-106) */
      const leagueClan = leagueClanById.get(id)
      const namedClan = leagueClan ? clanById.get(leagueClan.clanId) : undefined
      if (!namedClan) continue
      clans.push({ key: id, name: namedClan.name, slug: namedClan.slug, ...clan })
    }
    return { tier, games: bucket.games, win: bucket.win, lose: bucket.lose, clans }
  })

  return buildTierBreakdown(divisionCount, tallies).map((row) => ({
    tier: row.tier,
    games: row.games,
    win: row.win,
    lose: row.lose,
    win_rate: row.winRate,
    nemeses: row.nemeses.map((nemesis) => ({
      name: nemesis.name,
      slug: nemesis.slug,
      games: nemesis.games,
      win: nemesis.win,
      lose: nemesis.lose,
      win_rate: nemesis.winRate,
    })),
  }))
}

/* -------------------------------- 주간 추이 -------------------------------- */

/**
 * 선수 프로필 **주간 추이 그래프** (2026-09-02 사용자 지시).
 *
 * 접는 규칙은 `@sacloud/contract` 의 `foldWeekly()` 하나에 있고, 실제 서버
 * (`apps/web/lib/server/queries/playerWeekly.ts`)도 **같은 함수**를 부른다.
 * 여기서 다르게 계산하면 mock↔live 대조가 어긋난다 (최근 폼과 같은 태도).
 *
 * `now` 를 밖에서 받는다 — 안 그러면 돌릴 때마다 주 경계가 움직여 픽스처가 흔들린다.
 */
function buildMockWeekly(matches: MockMatch[], playerId: string, now: Date): WeeklyTrend {
  const rows: WeeklyRow[] = []
  for (const match of matches) {
    const stat = match.players.find((row) => row.playerId === playerId)
    if (!stat) continue
    rows.push({
      matchId: match.id,
      startAt: new Date(match.startAt),
      side: stat.side,
      winnerSide: match.winnerSide,
      weapon: stat.weapon,
      kill: stat.kill,
      death: stat.death,
    })
  }
  return foldWeekly(rows, now, WEEKLY_MAX_WEEKS, kstDayStart, kdRateOrNull, winRateOrNull)
}

/* --------------------------------- 최근 폼 --------------------------------- */

/**
 * 선수 프로필 `최근 폼` (D-167) — 6개월 월별 킬뎃 + 최근 10경기 판정.
 *
 * 계산 규칙·상수는 `@sacloud/contract` 의 `form.ts` 에 있고, 실제 서버
 * (`apps/web/lib/server/queries/playerForm.ts`)도 **같은 함수**를 쓴다.
 * 여기서 다르게 계산하면 mock↔live 대조가 어긋난다.
 *
 * Mock 픽스처는 K/D 가 항상 있으므로 결측 제외 규칙(D-148)이 눈에 띄지 않는다.
 * 운영에서는 미러 경기에 KDA 없는 참가 기록이 섞여 있어 그쪽에서만 갈린다.
 */
function buildPlayerForm(matches: MockMatch[], playerId: string, now: Date): PlayerForm {
  const keys = formMonthKeys(now, FORM_MONTHS)
  const buckets = new Map(keys.map((key) => [key, { games: 0, kill: 0, death: 0 }]))

  /** 이 선수가 그 경기에서 남긴 기록 */
  const statOf = (match: MockMatch): MockMatchPlayer | undefined =>
    match.players.find((stat) => stat.playerId === playerId)

  for (const match of matches) {
    const stat = statOf(match)
    if (!stat) continue
    const bucket = buckets.get(formMonthKey(new Date(match.startAt)))
    if (!bucket) continue
    bucket.games += 1
    bucket.kill += stat.kill
    bucket.death += stat.death
  }

  const months: PlayerFormMonth[] = keys.map((month) => {
    const bucket = buckets.get(month) ?? { games: 0, kill: 0, death: 0 }
    return {
      month,
      games: bucket.games,
      kill: bucket.kill,
      death: bucket.death,
      /* 경기가 없던 달은 `null` — 0% 로 채우지 않는다 (D-106) */
      kd_rate: bucket.games === 0 ? null : kdRate(bucket.kill, bucket.death),
    }
  })

  /* `matchesByPlayer` 는 이미 최신순이다 */
  const window = matches
    .slice(0, FORM_RECENT_GAMES + FORM_BASELINE_GAMES)
    .map(statOf)
    .filter((stat): stat is MockMatchPlayer => stat !== undefined)

  const tally = (rows: MockMatchPlayer[]) => ({
    games: rows.length,
    kill: rows.reduce((sum, row) => sum + row.kill, 0),
    death: rows.reduce((sum, row) => sum + row.death, 0),
  })
  const recent = tally(window.slice(0, FORM_RECENT_GAMES))
  const baseline = tally(window.slice(FORM_RECENT_GAMES))
  const judged = judgeFormTrend(recent, baseline)

  return {
    months,
    trend: judged.trend,
    recent_games: recent.games,
    recent_kd_rate: judged.recentKdRate,
    baseline_games: baseline.games,
    baseline_kd_rate: judged.baselineKdRate,
    delta: judged.delta,
  }
}

/* --------------------------- 전투력 육각형 (4절) --------------------------- */

/**
 * 리그 안 **같은 주무기 선수 전원**의 판당 킬 · 판당 딜량 분포 (D-185).
 *
 * 판정과 라벨은 `@sacloud/contract` 의 `buildPlayerTraits()` 가 전부 한다.
 * 실제 서버(`apps/web/lib/server/queries/playerTraits.ts`)도 **같은 함수**를 쓴다.
 *
 * 픽스처는 결정적이고 변하지 않으므로 한 번 세서 그대로 들고 있는다 —
 * 실제 서버가 TTL 캐시를 두는 이유(0.5초짜리 스캔)가 여기엔 없다.
 */
interface MockCohort {
  values: Map<string, { knownGames: number; killPerGame: number; damagePerGame: number }>
  killSorted: number[]
  damageSorted: number[]
}

const traitCohortCache = new Map<
  string,
  { rifle: MockCohort; sniper: MockCohort; belowMin: Map<string, { weapon: 0 | 1; games: number }> }
>()

function emptyMockCohort(): MockCohort {
  return { values: new Map(), killSorted: [], damageSorted: [] }
}

function traitCohortsOf(leagueId: string): {
  rifle: MockCohort
  sniper: MockCohort
  /** 주무기는 정해졌는데 판수가 모자란 선수. 실제 서버와 같은 이유로 따로 담는다 */
  belowMin: Map<string, { weapon: 0 | 1; games: number }>
} {
  const hit = traitCohortCache.get(leagueId)
  if (hit) return hit

  /* playerId → 무기별 합계. Mock 은 무기·K/D·딜량이 항상 함께 있다 (운영은 결측이 섞인다) */
  const acc = new Map<string, { games: [number, number]; kill: [number, number]; damage: [number, number] }>()
  for (const match of dataset.matches) {
    if (match.leagueId !== leagueId) continue
    for (const row of match.players) {
      const weapon = row.weapon === 1 ? 1 : 0
      let entry = acc.get(row.playerId)
      if (!entry) {
        entry = { games: [0, 0], kill: [0, 0], damage: [0, 0] }
        acc.set(row.playerId, entry)
      }
      entry.games[weapon] += 1
      entry.kill[weapon] += row.kill
      entry.damage[weapon] += row.damage
    }
  }

  const rifle = emptyMockCohort()
  const sniper = emptyMockCohort()
  const belowMin = new Map<string, { weapon: 0 | 1; games: number }>()
  for (const [id, entry] of acc) {
    const weapon = mainWeaponOf(entry.games[0], entry.games[1])
    if (weapon === null) continue
    const games = entry.games[weapon]
    /* 표본이 모자란 선수는 모집단에도 넣지 않는다 — 실제 서버와 같은 규칙이다.
       다만 무기와 판수는 남겨 둔다. 그래야 화면이 `주무기 미정` 이 아니라
       `경기 부족` 이라고 정확히 말한다 */
    if (games < TRAIT_MIN_GAMES) {
      belowMin.set(id, { weapon, games })
      continue
    }
    const value = {
      knownGames: games,
      killPerGame: entry.kill[weapon] / games,
      damagePerGame: entry.damage[weapon] / games,
    }
    const cohort = weapon === 1 ? sniper : rifle
    cohort.values.set(id, value)
    cohort.killSorted.push(value.killPerGame)
    cohort.damageSorted.push(value.damagePerGame)
  }
  for (const cohort of [rifle, sniper]) {
    cohort.killSorted.sort((a, b) => a - b)
    cohort.damageSorted.sort((a, b) => a - b)
  }

  const built = { rifle, sniper, belowMin }
  traitCohortCache.set(leagueId, built)
  return built
}

function buildTraits(leagueId: string, playerId: string) {
  const cohorts = traitCohortsOf(leagueId)
  const rifleValue = cohorts.rifle.values.get(playerId)
  const sniperValue = cohorts.sniper.values.get(playerId)
  const below = cohorts.belowMin.get(playerId)
  const weapon: 0 | 1 | null = rifleValue ? 0 : sniperValue ? 1 : (below?.weapon ?? null)
  const cohort = weapon === 1 ? cohorts.sniper : cohorts.rifle
  const value = weapon === 1 ? sniperValue : rifleValue

  return buildPlayerTraits({
    weapon,
    knownGames: value?.knownGames ?? below?.games ?? 0,
    cohort: weapon === null ? null : cohort.killSorted.length,
    carryPercentile: value ? percentileOf(cohort.killSorted, value.killPerGame) : null,
    damagePercentile: value ? percentileOf(cohort.damageSorted, value.damagePerGame) : null,
  })
}

export function getLeaguePlayerDetail(leagueSlug: string, playerId: string): LeaguePlayerDetail | null {
  const league = leagueBySlug.get(leagueSlug)
  if (!league) return null
  const leaguePlayer = leaguePlayerByLeagueAndPlayer.get(`${league.id}:${playerId}`)
  const player = playerById.get(playerId)
  if (!leaguePlayer || !player) return null
  const leagueClan = leagueClanById.get(leaguePlayer.leagueClanId)
  if (!leagueClan) return null

  const matches = matchesByPlayer.get(`${league.id}:${playerId}`) ?? []
  const matchCount = matches.length
  const rank = playerRankOf(leaguePlayer)
  /* Mock 은 무기와 K/D 가 항상 함께 있으므로 games === known_games 다 (D-149).
     운영은 무기(3rd.supply)와 KDA(넥슨) 출처가 달라 다를 수 있다 */
  const weaponBuckets = weaponStatsOf(leaguePlayer.id)
  const sniperBucket = weaponBuckets.find((row) => row.weapon === 1) ?? null
  const rifleBucket = weaponBuckets.find((row) => row.weapon === 0) ?? null

  return {
    id: leaguePlayer.id,
    league_id: league.id,
    league: toLeagueSummary(league),
    /* 선수가 직접 설정하는 값이라 픽스처도 **일부만** 채운다 (D-161).
       원본 실측에서도 21,107명 중 대부분이 `null` 이다 — 화면은 그때 줄을 그리지 않는다 */
    player: { id: player.id, name: player.name, position: player.position, note: player.note },
    clan: clanSummaryOf(leagueClan.clanId),
    rating: leaguePlayer.rating,
    win: leaguePlayer.win,
    lose: leaguePlayer.lose,
    win_rate: winRate(leaguePlayer.win, leaguePlayer.lose),
    kill: leaguePlayer.kill,
    death: leaguePlayer.death,
    assist: leaguePlayer.assist,
    headshot: leaguePlayer.headshot,
    kd_rate: kdRate(leaguePlayer.kill, leaguePlayer.death),
    kill_per_match: killPerMatch(leaguePlayer.kill, matchCount),
    mvp_count: leaguePlayer.mvpCount,
    placement: leaguePlayer.placement,
    rank: rank.rank,
    rank_count: rank.rankCount,
    /* Mock 은 무기 기록이 항상 있으므로 무기별 전적도 채운다 (D-146 · D-149).
       실제 운영에서는 무기(3rd.supply)와 KDA(넥슨) 출처가 달라 한쪽만 있는 경우가 있다.
       Mock 은 둘 다 있으므로 `games === known_games` 다 */
    sniper_rank: sniperBucket === null ? null : rank.rank,
    sniper_rank_count: sniperBucket === null ? null : rank.rankCount,
    sniper_games: sniperBucket?.games ?? 0,
    sniper_known_games: sniperBucket?.games ?? 0,
    sniper_kill: sniperBucket?.kill ?? 0,
    sniper_death: sniperBucket?.death ?? 0,
    sniper_assist: 0,
    sniper_kd_rate: sniperBucket?.kd_rate ?? null,
    rifle_rank: rifleBucket === null ? null : rank.rank,
    rifle_rank_count: rifleBucket === null ? null : rank.rankCount,
    rifle_games: rifleBucket?.games ?? 0,
    rifle_known_games: rifleBucket?.games ?? 0,
    rifle_kill: rifleBucket?.kill ?? 0,
    rifle_death: rifleBucket?.death ?? 0,
    rifle_assist: 0,
    rifle_kd_rate: rifleBucket?.kd_rate ?? null,
    match_summary: buildMatchSummary(matches, leaguePlayer.leagueClanId, playerId),
    /* 최근 폼 (D-167). 원본에 없는 화면이다 — 사용자 요구로 추가했다 */
    form: buildPlayerForm(matches, playerId, new Date()),
    /* 오늘 퍼포먼스 (10절 · D-182). 기준은 상세정보와 **같은** 시즌 킬뎃이다 */
    /* 최근 3일치 일별 기록 (D-198). 첫 줄은 언제나 오늘이다 */
    recent_days: buildRecentDays(matches, playerId, new Date()),
    /* 티어별 게임빈도 + 천적 (SITE_SPEC_V2 4절). 판수 0인 티어도 줄이 온다 */
    tier_breakdown: buildTierBreakdownRows(matches, playerId, league.divisionCount),
    /* 주간 추이 그래프 (2026-09-02).
       Mock 은 **결정적**이어야 하므로 실제 서버와 **같은 함수**를 쓴다 —
       접는 규칙이 두 곳에 생기면 mock↔live 값 대조가 어긋난다 (D-023 의 태도).
       `now` 를 넘기지 않으면 돌릴 때마다 주 경계가 움직여 픽스처가 흔들린다 */
    weekly: buildMockWeekly(matches, playerId, new Date()),
    /* 포지션 (D-199). Mock 에는 좌표 판정이 없으므로 사람이 정한 값과 주무기만 본다 —
       실제 서버와 **같은 함수**를 쓴다. 다르게 고르면 mock↔live 대조가 어긋난다 */
    ...(() => {
      const resolved = resolvePlayerPositionOf({
        userSet: player.position,
        mainWeapon:
          sniperBucket && rifleBucket && sniperBucket.games !== rifleBucket.games
            ? sniperBucket.games > rifleBucket.games
              ? 1
              : 0
            : null,
        judged: null,
      })
      return { position_label: resolved.label, position_source: resolved.source }
    })(),
    today: (() => {
      const perf = buildTodayPerf(
        matches,
        playerId,
        kdRate(leaguePlayer.kill, leaguePlayer.death),
        new Date(),
      )
      return {
        games: perf.games,
        known_games: perf.knownGames,
        win: perf.win,
        lose: perf.lose,
        win_rate: perf.winRate,
        kd_rate: perf.kdRate,
        season_kd_rate: perf.seasonKdRate,
        delta: perf.delta,
        trend: perf.trend,
        sentence: perf.sentence,
      }
    })(),
    /* 전투력 육각형 · 플레이스타일 바 (4절 · 8절 · D-185).
       바 두 줄은 재료(라운드별 진영)가 없어 Mock 에서도 `측정중` 이다 —
       픽스처에 가짜 성향값을 지어내지 않는다 */
    traits: buildTraits(league.id, playerId),
    playstyle: buildPlayerPlaystyle(),
    teammates: buildTeammates(matches, leaguePlayer.leagueClanId, playerId),
    weapon_stats: weaponStatsOf(leaguePlayer.id),
  }
}

/* -------------------------------------------------------------------------- */
/* 클랜 지표 (SITE_SPEC_V2 5절)                                                  */
/* -------------------------------------------------------------------------- */

/**
 * 세는 규칙은 계약(`@sacloud/contract` 의 `clanMetrics`)에 있고 실제 서버
 * (`apps/web/lib/server/queries/clanMetrics.ts`)도 **같은 함수**를 부른다.
 * 여기서는 픽스처를 그 함수가 원하는 모양으로 맞춰 주기만 한다.
 *
 * ⚠ **추이 구간의 시작점만 실제 서버와 다르다.**
 *   실제 서버는 시즌0 창(`SEASON0_FROM` = 2026-04-01 KST · D-175)에서 15일씩 자른다.
 *   그 상수는 `apps/worker/src/lib/season0Window.ts` 한 곳에만 있고(값을 두 번 적으면
 *   창이 바뀔 때 한쪽만 고쳐져 갈라진다 — D-176), **Mock 은 브라우저에서도 도는 순수
 *   패키지라 worker 를 가져올 수 없다.** 그래서 픽스처는 **그 리그의 첫 경기**를 시작점으로
 *   삼는다. Mock 이 시즌 창 자체를 모델링하지 않는 것은 이 필드만의 문제가 아니라
 *   `match_summary` 부터 그렇다 — 창을 계약으로 올리기 전까지 남는 알려진 차이다.
 */
function buildClanMetrics(leagueClan: MockLeagueClan): ClanMetrics | null {
  const matches = [...(matchesByLeagueClan.get(leagueClan.id) ?? [])].sort((a, b) =>
    a.startAt < b.startAt ? -1 : a.startAt > b.startAt ? 1 : a.id < b.id ? -1 : 1,
  )
  if (matches.length === 0) return null

  const league = leagueById.get(leagueClan.leagueId)
  if (!league) return null

  const sideOf = new Map<string, TeamSide>()
  const rows: ClanMatchRow[] = []
  for (const match of matches) {
    const side = sideOfLeagueClan(match, leagueClan.id)
    if (!side) continue
    sideOf.set(match.id, side)
    /* 우리 다섯 명 딜량의 합. 다섯이 아니면 합이 거짓이라 `null` 이다 (D-034 · D-148) */
    const ours = match.players.filter((stat) => stat.side === side)
    rows.push({
      id: match.id,
      startAt: new Date(match.startAt),
      won: match.winnerSide === side,
      /* **경기 당시** 상대 부리그 스냅샷 (CLAUDE.md 3-B 4번) */
      opponentDivision: side === 'red' ? match.blueDivision : match.redDivision,
      teamDamage:
        ours.length === 5 ? ours.reduce((sum, stat) => sum + stat.damage, 0) : null,
    })
  }
  if (rows.length === 0) return null

  /* 리그 전체의 첫·마지막 경기. 클랜이 쉰 구간도 **빈 칸으로 보여야** 하므로
     이 클랜의 경기로 자르지 않는다 */
  const leagueMatches = dataset.matches.filter((match) => match.leagueId === league.id)
  const times = leagueMatches.map((match) => Date.parse(match.startAt))
  const windowFrom = new Date(Math.min(...times))
  const windowUntil = new Date(Math.max(...times))

  const streak = clanBestWinStreak(rows)
  const streakIds = new Set(streak.matchIds)
  const tally = new Map<string, { name: string; games: number }>()
  for (const match of matches) {
    if (!streakIds.has(match.id)) continue
    for (const stat of match.players) {
      /* 우리 쪽 라인업만. 상대를 우리 멤버로 세면 안 된다 */
      if (stat.side !== sideOf.get(match.id)) continue
      const player = playerById.get(stat.playerId)
      if (!player) continue
      const entry = tally.get(player.id) ?? { name: player.name, games: 0 }
      entry.games += 1
      tally.set(player.id, entry)
    }
  }
  const streakMembers = [...tally.entries()]
    .map(([id, entry]) => ({ player: { id, name: entry.name }, games: entry.games }))
    .sort((a, b) => b.games - a.games || a.player.name.localeCompare(b.player.name))

  return buildClanMetricsOf({
    rows,
    divisionCount: league.divisionCount,
    windowFrom,
    windowUntil,
    streakMembers,
    toIso: (at) => toKstIso(at.getTime()),
  })
}

/**
 * 클랜원 정리 — 포지션별 · 1군/2군 (SITE_SPEC_V2 5-2).
 *
 * 나누는 규칙은 계약(`buildClanRoster`)이 정한다. 여기서는 재료만 맞춰 준다 —
 * 실제 서버(`apps/web/lib/server/queries/clanRoster.ts`)와 **같은 함수**를 부른다.
 *
 * 판수는 실제 서버와 같은 뜻(그 리그에서 뛴 판수)이다. Mock 픽스처의 경기는
 * 전부 래더 경기이고 시즌 창 밖 경기가 없어, 창을 따로 걸지 않아도 같은 값이 나온다.
 */
function buildClanRoster(leagueClan: MockLeagueClan): ClanRoster | null {
  const rows: ClanRosterInput[] = (leaguePlayersByLeague.get(leagueClan.leagueId) ?? [])
    .filter((entry) => entry.leagueClanId === leagueClan.id)
    .map((leaguePlayer): ClanRosterInput | null => {
      const player = playerById.get(leaguePlayer.playerId)
      if (!player) return null
      const position = resolvePositionOf(leagueClan.leagueId, leaguePlayer.playerId)
      return {
        leaguePlayerId: leaguePlayer.id,
        playerId: player.id,
        playerName: player.name,
        rating: leaguePlayer.rating,
        placement: leaguePlayer.placement,
        games:
          matchCountByLeaguePlayer.get(`${leagueClan.leagueId}:${leaguePlayer.playerId}`) ?? 0,
        /* 사람이 우리 코드가 아닌 말로 적었으면 `code` 는 `null` 이고 글자만 남는다 */
        position: (position.code ?? null) as PositionCode | null,
        positionLabel: position.label,
        positionSource: position.source,
        online: mockOnlineOf(leaguePlayer.id),
      }
    })
    .filter((entry): entry is ClanRosterInput => Boolean(entry))

  /* 픽스처의 「지금」을 관측 시각으로 쓴다. 실제 서버는 병영수첩을 마지막으로 긁은 때다 */
  return buildClanRosterOf(rows, FIXTURE_NOW)
}

/**
 * **접속 여부(Mock)** — 결정적 가짜값이다.
 *
 * ⚠ **이 값은 실제 서버와 일치하지 않는다. 일치할 수 없다.**
 *   운영은 병영수첩 클랜원 명단(`BarracksClanMember.connFlag`)에서 읽는다.
 *   Mock 픽스처에는 병영수첩이 아예 없다.
 *   `clanRoundMetrics` 와 같은 성격의 **알려진 차이**다.
 *
 * ── 세 상태를 **한 화면에서 다 보이게** 만든다
 *   화면이 `접속중` · `미접속` · `알수없음`(양쪽 불 꺼짐) 셋을 그리는데,
 *   전부 같은 값이면 Mock 모드에서 나머지 두 모양을 영영 못 본다.
 *   그래서 다섯에 하나는 `null` 로 둔다 — 실제로도 이어지지 않은 선수가 나온다.
 *
 * id 가 같으면 언제나 같은 값이다 (시드 고정).
 */
function mockOnlineOf(leaguePlayerId: string): boolean | null {
  let hash = 0
  for (let index = 0; index < leaguePlayerId.length; index += 1) {
    hash = (hash * 31 + leaguePlayerId.charCodeAt(index)) % 997
  }
  if (hash % 5 === 0) return null
  return hash % 2 === 0
}

/* ------------------- 클랜 배틀로그 지표 (SITE_SPEC_V2 5-5절) ------------------- */

/**
 * 블루방어율 · 어택성공률 · 조직력 · 폭발력 · 게임템포 · 클린시트 · 소수싸움.
 *
 * 판정은 `@sacloud/contract` 의 `buildClanRoundMetrics()` 가 전부 한다.
 * 실제 서버(`apps/web/lib/server/queries/clanRoundMetrics.ts`)도 **같은 함수**를 쓴다.
 *
 * ⚠ **이 값은 실제 서버와 일치하지 않는다. 일치할 수 없다.**
 *   운영은 병영수첩 **배틀로그 원문**에서 라운드를 복원해 센다 (D-184 · D-194).
 *   Mock 픽스처에는 배틀로그가 없다 — 경기 한 건이 라인업과 합계 스탯뿐이라
 *   "몇 라운드째에 누가 죽었나" 가 아예 없다. 그래서 여기서는 **화면을 보기 위한
 *   결정적 가짜값**을 만든다. 시드가 같으면 언제나 같은 값이 나온다.
 *
 *   `metrics`(추이 시작점)와 같은 성격의 **알려진 차이**다. 배틀로그를 계약으로
 *   올리기 전까지 남는다.
 *
 * ── 그래도 **모양은 실측을 따라간다**
 *   2026-08-30 로컬 실측을 흉내 낸다 — 배틀로그가 있는 경기 중 진영 교대를 확인한
 *   것이 1/7 남짓이고, 블루가 5라운드중 1.6라운드를 내주며, 레드가 2.4라운드를 따고
 *   폭탄을 2.1번 심는다. 화면이 현실적인 자릿수를 받게 하려는 것이다.
 */
/**
 * 진영 교대까지 확인되는 경기의 비율.
 *
 * 실측은 1/7 남짓이지만 Mock 은 **0.45** 로 잡았다. 픽스처 클랜은 경기가 마흔 판쯤이라
 * 실측 비율을 그대로 쓰면 라운드가 스무 개도 안 돼 **모든 축이 `측정중`** 으로 나온다.
 * 그러면 화면을 볼 수 없다. 비율(방어·공격·설치)은 실측을 그대로 따르고 **표본 크기만**
 * 키운다 — 어차피 가짜값이고, Mock 의 목적은 화면을 그려 보는 것이다.
 */
const MOCK_ROUND_SIDED_SHARE = 0.45
const MOCK_ROUND_PER_MATCH = 11

/** 문자열 → 32비트 정수 (FNV-1a). 같은 클랜은 언제나 같은 값이 나온다 */
function mockSeedOf(text: string): number {
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function mockRoundTallyOf(leagueClan: MockLeagueClan): ClanRoundTallyInput {
  const matchCount = (matchesByLeagueClan.get(leagueClan.id) ?? []).length
  const rng = new Rng(mockSeedOf(leagueClan.id))

  /* 배틀로그를 받은 경기는 일부뿐이고, 그중 진영 교대까지 확인된 것은 다시 일부다 */
  const seen = Math.floor(matchCount * rng.float(0.5, 0.9, 3))
  const sided = Math.floor(seen * MOCK_ROUND_SIDED_SHARE * rng.float(0.6, 1.4, 3))

  const attackSide = sided * rng.int(3, 5)
  const defense = sided * rng.int(3, 5)
  const attack = Math.round(attackSide * rng.float(0.9, 1, 3))

  /* ⚠ 아래 `rng` 호출 **순서가 곧 값**이다. 새 축은 반드시 **맨 뒤**에 붙인다 —
     가운데에 끼워 넣으면 그 뒤의 모든 픽스처 값이 통째로 바뀐다 */
  const tally: ClanRoundTallyInput = {
    matches: seen,
    sidedMatches: sided,
    roundsTotal: seen * MOCK_ROUND_PER_MATCH,
    roundsKnown: attackSide + defense,
    defenseRounds: defense,
    /* 실측 1.60/5 = 32% 언저리 */
    defenseConceded: Math.round(defense * rng.float(0.24, 0.42, 3)),
    attackRounds: attack,
    /* 실측 2.42/5 = 48% 언저리 */
    attackWon: Math.round(attack * rng.float(0.4, 0.58, 3)),
    attackSideRounds: attackSide,
    /* 실측 2.08/5 = 42% 언저리 */
    plantRounds: Math.round(attackSide * rng.float(0.33, 0.5, 3)),
    organizedRounds: attackSide,
    /* 30초를 넘긴 라운드는 실측에서 4% 언저리다 */
    organizedHeld: Math.round(attackSide * rng.float(0.01, 0.08, 3)),
    burstRounds: attackSide,
    bursts: Math.round(attackSide * rng.float(0.01, 0.08, 3)),
    tempoRounds: Math.round(attackSide * rng.float(0.7, 0.95, 3)),
    /* 실측 중앙값 분포는 66~104초였다 */
    tempoMedian: sided === 0 ? null : rng.float(64, 106, 1),
    cleanSheetMatches: Math.round(sided * rng.float(0.5, 0.9, 3)),
    /* 분자는 분모가 정해진 뒤에 채운다 — 분모를 넘지 않게 */
    cleanSheets: 0,
    /* 분모부터 정하고 아래에서 채운다 */
    outnumberedRounds: 0,
    outnumberedWon: 0,
  }

  /* 소수싸움은 **진영을 안 보는 축**이라 교대를 못 본 경기에서도 쌓인다.
     그래서 분모가 `sided` 가 아니라 **본 경기 전체(`seen`)** 기준이고, 위의 축들보다
     훨씬 크다 — 화면에서 `수비 40라운드` 옆에 `소수싸움 300회` 가 서는 것이 정상이다 */
  tally.outnumberedRounds = Math.round(seen * MOCK_ROUND_PER_MATCH * rng.float(0.3, 0.5, 3))
  /* 밀리고도 이기는 비율. 사양 원문 `839회중 432회 승리` 가 51.5% 다 */
  tally.outnumberedWon = Math.round(tally.outnumberedRounds * rng.float(0.42, 0.58, 3))

  return tally
}

/** 같은 리그 클랜들의 템포 중앙값. 픽스처는 변하지 않으므로 한 번 세서 들고 있는다 */
const mockTempoCohortCache = new Map<string, number[]>()

function mockTempoCohortOf(leagueId: string): number[] {
  const hit = mockTempoCohortCache.get(leagueId)
  if (hit) return hit
  const cohort: number[] = []
  for (const entry of leagueClansByLeague.get(leagueId) ?? []) {
    const tally = mockRoundTallyOf(entry)
    /* 표본이 모자란 클랜은 분포에도 넣지 않는다 — 실제 서버와 같은 규칙이다 */
    if (tally.tempoMedian !== null && tally.tempoRounds >= CLAN_TEMPO_MIN_ROUNDS) {
      cohort.push(tally.tempoMedian)
    }
  }
  mockTempoCohortCache.set(leagueId, cohort)
  return cohort
}

function buildClanRoundMetrics(leagueClan: MockLeagueClan): ClanRoundMetrics | null {
  const tally = mockRoundTallyOf(leagueClan)
  const rng = new Rng(mockSeedOf(`${leagueClan.id}:cleansheet`))
  tally.cleanSheets = Math.round(tally.cleanSheetMatches * rng.float(0, 0.12, 3))
  return buildClanRoundMetricsOf({
    tally,
    tempoCohort: mockTempoCohortOf(leagueClan.leagueId),
  })
}


/**
 * 클랜 육각형 (SITE_SPEC_V2 5-5절) — 실제 서버(`apps/web/lib/server/queries/clanRoundMetrics.ts`)와
 * **같은 계약 함수**를 부른다. 재료도 배틀로그 지표와 같은 것을 쓴다.
 */
function buildClanHexagonOfMock(leagueClan: MockLeagueClan): ClanHexagon | null {
  const values = (entry: MockLeagueClan): Record<ClanTraitAxisKey, number | null> => {
    const t = mockRoundTallyOf(entry)
    const rate = (num: number, den: number, min: number): number | null =>
      den < min ? null : (num / den) * 100
    return {
      outnumbered: rate(t.outnumberedWon, t.outnumberedRounds, CLAN_OUTNUMBERED_MIN_ROUNDS),
      defense: rate(t.defenseRounds - t.defenseConceded, t.defenseRounds, CLAN_ROUND_MIN_ROUNDS),
      attack: rate(t.attackWon, t.attackRounds, CLAN_ROUND_MIN_ROUNDS),
      organized: rate(t.organizedHeld, t.organizedRounds, CLAN_ROUND_MIN_ROUNDS),
      burst: rate(t.bursts, t.burstRounds, CLAN_ROUND_MIN_ROUNDS),
      tempo:
        t.tempoRounds >= CLAN_TEMPO_MIN_ROUNDS && t.tempoMedian !== null ? t.tempoMedian : null,
    }
  }

  const keys: ClanTraitAxisKey[] = [
    'outnumbered',
    'defense',
    'attack',
    'organized',
    'burst',
    'tempo',
  ]
  const cohorts = new Map<ClanTraitAxisKey, number[]>(keys.map((key) => [key, []]))
  for (const entry of leagueClansByLeague.get(leagueClan.leagueId) ?? []) {
    const other = values(entry)
    for (const key of keys) {
      const value = other[key]
      if (value !== null) (cohorts.get(key) as number[]).push(value)
    }
  }

  const mine = values(leagueClan)
  const inputs = {} as Record<ClanTraitAxisKey, ClanAxisInput>
  for (const key of keys) {
    inputs[key] = {
      value: mine[key],
      cohort: cohorts.get(key) ?? [],
      pending: key === 'outnumbered' ? 'matches' : 'side',
      lowerIsBetter: key === 'tempo',
    }
  }
  return buildClanHexagonOf(inputs)
}

/* ------------------- 클랜 육각형 V2 (D-217 · D-235) ------------------- */

/**
 * 스나싸움 · 소수싸움 · 세이브 · 게임템포 · B어택성공 · A어택성공.
 *
 * 합산(`sumClanHexTallies`)·비율(`buildClanHexV2Raw`)·정규화(`normalizeAgainstFoe` ·
 * `normalizeByPercentile`)는 전부 `@sacloud/contract` 가 한다. 실제 서버
 * (`apps/web/lib/server/queries/clanHexV2.ts`)도 **같은 함수**를 부른다.
 *
 * ⚠ **이 값은 실제 서버와 일치하지 않는다. 일치할 수 없다.**
 *   운영은 병영수첩 **배틀로그 원문**에서 라운드를 복원해 센다 (D-184 · D-194).
 *   Mock 픽스처에는 배틀로그가 아예 없다 — 경기 한 건이 라인업과 합계 스탯뿐이라
 *   "몇 라운드째에 누가 어디서 죽었나" 가 없다. 그래서 여기서는 **화면을 보기 위한
 *   결정적 가짜값**을 만든다. 시드가 같으면 언제나 같은 값이 나온다.
 *   `round_metrics` · `hexagon`(옛 판) · `online` 과 같은 성격의 **알려진 차이**다.
 *
 * ── **네 모양을 Mock 에서 다 보이게 만든다**
 *   배틀로그가 전체의 1.4% 뿐이라(D-205 · D-218) 운영에서는 「측정중」이 흔한 값이다.
 *   Mock 이 전부 「다 쟀다」로 나오면 화면은 나머지 모양을 **영영 못 본다**.
 *   `mockOnlineOf` 가 같은 이유로 다섯에 하나를 `null` 로 두는 것과 같은 관례다.
 *
 *   ```
 *   none  카드 자체가 없다 (배틀로그 행이 0건) → 화면은 카드를 안 그린다
 *   blank 행은 있는데 여섯 축이 전부 측정중     → 빈 육각형 + 못 잰 이유
 *   part  셋만 쟀다                              → 도형을 잇지 않는다 (D-106)
 *   full  여섯을 다 쟀다
 *   ```
 */
type MockHexV2Shape = 'none' | 'blank' | 'part' | 'full'

function mockHexV2ShapeOf(seedText: string): MockHexV2Shape {
  const bucket = mockSeedOf(seedText) % 7
  if (bucket === 0) return 'none'
  if (bucket === 1) return 'blank'
  if (bucket === 2) return 'part'
  return 'full'
}

/** 한 경기의 라운드 수. 실측(13~18)의 가운데를 잡았다 */
const MOCK_HEX_V2_ROUNDS_PER_MATCH = 16

/**
 * 가짜 tally 한 벌.
 *
 * ⚠ 아래 `rng` 호출 **순서가 곧 값**이다. 새 축은 반드시 **맨 뒤**에 붙인다 —
 * 가운데에 끼워 넣으면 그 뒤의 모든 픽스처 값이 통째로 바뀐다.
 *
 * `blank` 는 여섯 축을 전부 `null` 로 두고 `foeSnipers` 도 0 으로 만든다. 그러면
 * 계약이 못 잰 이유를 두 가지(`battlelog` · `foeSniper`)로 갈라 붙여, 화면이 그 문구가
 * 섞여 나오는 모습을 볼 수 있다.
 */
function mockHexV2TallyOf(
  seedText: string,
  matches: number,
  shape: MockHexV2Shape,
): ClanHexTallyLike | null {
  if (shape === 'none') return null

  const rounds = matches * MOCK_HEX_V2_ROUNDS_PER_MATCH
  const redRounds = Math.round(rounds / 2)
  const base: ClanHexTallyLike = {
    teamNo: '0',
    /* 시즌 전체를 합치면 상대가 여럿이라 운영에서도 `null` 이다 */
    foeTeamNo: null,
    rounds,
    sidedRounds: rounds,
    redRounds,
    foeSnipers: 0,
    sniperDuel: null,
    firstBlood: null,
    trade: null,
    outnumbered: null,
    save: null,
    tempo: null,
    sniperFight: null,
    lastSniper: null,
    attackZone: null,
  }
  if (shape === 'blank') return base

  const rng = new Rng(mockSeedOf(`${seedText}:hexv2`))
  base.foeSnipers = matches

  const aSide = Math.round(redRounds * rng.float(0.1, 0.3, 3))
  const bLong = Math.round(redRounds * rng.float(0.05, 0.2, 3))
  const unzoned = Math.round(redRounds * rng.float(0.1, 0.35, 3))
  const sniperKills = aSide + bLong + unzoned
  base.sniperFight = {
    redRounds,
    foeSniperKills: sniperKills,
    killsWithPosition: { byKiller: sniperKills, byVictim: sniperKills },
    aSideKills: { byKiller: aSide, byVictim: Math.round(aSide * 0.9) },
    bLongKills: { byKiller: bLong, byVictim: Math.round(bLong * 1.1) },
    unzonedKills: { byKiller: unzoned, byVictim: unzoned },
  }

  /* ② 는 진영을 보지 않는 축이라 분모가 전체 라운드 기준이다 (D-202) */
  const outnumberedRounds = Math.round(rounds * rng.float(0.3, 0.5, 3))
  base.outnumbered = {
    rounds: outnumberedRounds,
    won: Math.round(outnumberedRounds * rng.float(0.42, 0.58, 3)),
  }

  /* ③ 우리 생존자가 1명이 된 적이 있는 라운드 — ② 보다 훨씬 드물다 (D-235 Q3) */
  const saveRounds = Math.round(rounds * rng.float(0.12, 0.24, 3))
  base.save = { rounds: saveRounds, won: Math.round(saveRounds * rng.float(0.2, 0.45, 3)) }

  const clearThree = Math.max(1, Math.round(redRounds * rng.float(0.4, 0.7, 3)))
  const seconds = rng.float(14, 32, 1)
  base.tempo = {
    redRounds,
    redClearThreeRounds: clearThree,
    /* 라운드별 초는 운영에서 라운드마다 한 칸씩 쌓인다. Mock 은 합만 맞춰 둔다 */
    redClearThreeSecondsLowerBound: [],
    redClearThreeSecondsLowerBoundSum: Math.round(clearThree * seconds),
    redRoundsWithoutThreeClears: redRounds - clearThree,
  }

  const redWon = Math.max(1, Math.round(redRounds * rng.float(0.38, 0.58, 3)))
  const wonRounds = Math.round(rounds * rng.float(0.4, 0.6, 3))
  base.lastSniper = {
    redWonRounds: redWon,
    redWonSniperLast: Math.round(redWon * rng.float(0.2, 0.55, 3)),
    wonRounds,
    wonSniperLast: Math.round(wonRounds * rng.float(0.2, 0.55, 3)),
    noFoeDeathRounds: 0,
    unknownLastWeaponRounds: 0,
    ambiguousLastRounds: 0,
  }

  base.attackZone = {
    redRounds,
    redWonRounds: redWon,
    redWonZoneSniperRounds: {
      byKiller: Math.round(redWon * rng.float(0.1, 0.4, 3)),
      byVictim: Math.round(redWon * rng.float(0.1, 0.4, 3)),
    },
    redLostZoneSniperRounds: { byKiller: 0, byVictim: 0 },
    sniperKillsWithPosition: { byKiller: sniperKills, byVictim: sniperKills },
    sniperKillsInNamedZone: { byKiller: aSide + bLong, byVictim: aSide + bLong },
    sniperKillsOutsideNamedZone: { byKiller: unzoned, byVictim: unzoned },
    /* ⚠ 정정 (2026-09-02 · D-256) — 이 줄은 «D-235 Q6 — `녹뒤`·`머리` 좌표가 아직 없어
       넷 중 둘뿐이다. 화면은 `구역 2/4` 를 적는다» 였다. 좌표는 2026-08-29 에 사용자가
       직접 칠했다. Mock 도 **넷**으로 맞춘다 — 안 맞추면 `pnpm compare` 에서 mock 과 live 가
       갈리고, Mock 화면에만 「구역 2/4」가 남는다 */
    zoneLabels: ['CONDWI', 'SEOLDAE', 'NOKDWI', 'MERI'],
  }

  /* ────────────────────────────────────────────────────────────────────────
   * 2026-09-02 · D-256 — 지금 화면이 쓰는 축 셋. **맨 뒤에 붙였다.**
   *
   * 위 머리말이 못 박아 둔 규칙이다 — `rng` 호출 순서가 곧 값이라, 가운데에 끼워 넣으면
   * 그 뒤 픽스처가 통째로 바뀐다. 그래서 옛 축의 난수를 다 뽑은 **다음에** 뽑는다.
   * ①⑤⑥ 은 실제로도 양 팀 합이 1 에 가까운 지표라 0.5 언저리로 잡는다 (실측 중앙값
   * ① 0.502 · ⑤ 0.499 · ⑥ 0.176).
   * ──────────────────────────────────────────────────────────────────────── */
  const duelWon = Math.max(1, Math.round(redRounds * rng.float(0.2, 0.5, 3)))
  const duelLost = Math.max(1, Math.round(duelWon * rng.float(0.7, 1.4, 3)))
  base.sniperDuel = { rounds, won: duelWon, lost: duelLost }

  /* 첫 킬이 없는 라운드가 있으므로 분모는 라운드보다 조금 작다 */
  const fbRounds = Math.max(1, Math.round(rounds * rng.float(0.9, 0.98, 3)))
  base.firstBlood = {
    rounds: fbRounds,
    won: Math.round(fbRounds * rng.float(0.42, 0.58, 3)),
    /* 동시각 첫 킬 — 실측 4.48% */
    tiedRounds: Math.round(rounds * 0.045),
  }

  /* 창 넷은 **포함 관계**다: 3초 ⊆ 5초 ⊆ 10초 ⊆ 같은 라운드. Mock 도 그 순서를 지킨다 */
  const deaths = Math.max(1, Math.round(rounds * rng.float(1.6, 2.4, 3)))
  const within3 = Math.round(deaths * rng.float(0.1, 0.15, 3))
  const within5 = within3 + Math.round(deaths * rng.float(0.03, 0.07, 3))
  const within10 = within5 + Math.round(deaths * rng.float(0.06, 0.1, 3))
  base.trade = {
    deaths,
    within3,
    within5,
    within10,
    sameRound: within10 + Math.round(deaths * rng.float(0.18, 0.26, 3)),
  }

  if (shape === 'part') {
    /* 셋만 남긴다 — 재료가 없는 축은 **0 이 아니라 측정중**이다 (D-106).
       ⚠ 옛 `lastSniper` 대신 **지금 화면이 쓰는 `trade`** 를 비운다. 옛 축을 비워 봐야
       화면에는 아무 변화가 없어서 「측정중이 섞인 모습」을 볼 수 없다 */
    base.save = null
    base.tempo = null
    base.trade = null
    base.lastSniper = null
  }
  return base
}

/** 그 클랜의 합계 육각형(정규화 전). 행이 아예 없으면 `null` — 실제 서버와 같은 규칙 */
function mockHexV2RawOf(leagueClan: MockLeagueClan): ClanHexV2 | null {
  const matches = (matchesByLeagueClan.get(leagueClan.id) ?? []).length
  if (matches === 0) return null
  const shape = mockHexV2ShapeOf(leagueClan.id)
  if (shape === 'none') return null
  return buildClanHexV2Raw({ tally: mockHexV2TallyOf(leagueClan.id, matches, shape), matches })
}

/** 같은 리그 클랜들의 원값. 픽스처는 변하지 않으므로 한 번 세서 들고 있는다 */
const mockHexV2CohortCache = new Map<string, ClanHexV2[]>()

function mockHexV2CohortOf(leagueId: string): ClanHexV2[] {
  const hit = mockHexV2CohortCache.get(leagueId)
  if (hit) return hit
  const cohort: ClanHexV2[] = []
  for (const entry of leagueClansByLeague.get(leagueId) ?? []) {
    const raw = mockHexV2RawOf(entry)
    if (raw !== null) cohort.push(raw)
  }
  mockHexV2CohortCache.set(leagueId, cohort)
  return cohort
}

/**
 * 클랜 페이지 육각형 V2 — 같은 리그 안에서의 **백분위** (D-235 Q8).
 *
 * 모집단에 그 클랜 자신도 넣는다. 실제 서버와 **같은 규칙**이다.
 */
function buildClanHexV2OfMock(leagueClan: MockLeagueClan): ClanHexV2 | null {
  const raw = mockHexV2RawOf(leagueClan)
  if (raw === null) return null
  return normalizeByPercentile(raw, mockHexV2CohortOf(leagueClan.leagueId))
}

/**
 * 경기 상세 육각형 V2 — 그 경기 **두 클랜의 상대 비교** (D-235 Q7).
 *
 * 한 경기는 표본이 1이라 리그 백분위를 못 쓴다. 큰 쪽이 1.0 이고 게임템포만 반대다.
 * 한쪽만 잰 축은 **양쪽 다** 측정중(`pending='compare'`)이다 — 혼자만 꽉 찬 육각형은
 * 「잘한다」가 아니라 「상대를 못 쟀다」이기 때문이다.
 */
function buildMatchHexV2OfMock(match: MockMatch): {
  red: ClanHexV2 | null
  blue: ClanHexV2 | null
} {
  const rawOf = (leagueClanId: string): ClanHexV2 | null => {
    const seed = `${match.id}:${leagueClanId}`
    const shape = mockHexV2ShapeOf(seed)
    if (shape === 'none') return null
    return buildClanHexV2Raw({ tally: mockHexV2TallyOf(seed, 1, shape), matches: 1 })
  }
  const redRaw = rawOf(match.redLeagueClanId)
  const blueRaw = rawOf(match.blueLeagueClanId)
  if (redRaw === null && blueRaw === null) return { red: null, blue: null }

  /* 빈 육각형 = 「재료가 아예 없다」. 상대 자리에 세우면 우리 축이 `compare` 로 내려간다 */
  const empty = (): ClanHexV2 => buildClanHexV2Raw({ tally: null, matches: 0 })
  const [red, blue] = normalizeAgainstFoe(redRaw ?? empty(), blueRaw ?? empty())
  return { red: redRaw === null ? null : red, blue: blueRaw === null ? null : blue }
}

export function getLeagueClanShow(leagueSlug: string, clanSlug: string): LeagueClanShow | null {
  const league = leagueBySlug.get(leagueSlug)
  const clan = clanBySlug.get(clanSlug)
  if (!league || !clan) return null
  const leagueClan = (leagueClansByLeague.get(league.id) ?? []).find((entry) => entry.clanId === clan.id)
  if (!leagueClan) return null
  const base = toLeagueClan(leagueClan)
  if (!base) return null

  const matches = matchesByLeagueClan.get(leagueClan.id) ?? []
  const rank = clanRankOf(leagueClan)

  return {
    ...base,
    league: toLeagueSummary(league),
    rank: rank.rank,
    rank_count: rank.rankCount,
    member_count: clan.playerIds.length,
    match_summary: buildMatchSummary(matches, leagueClan.id, null),
    teammates: buildTeammates(matches, leagueClan.id, null),
    metrics: buildClanMetrics(leagueClan),
    round_metrics: buildClanRoundMetrics(leagueClan),
    hexagon: buildClanHexagonOfMock(leagueClan),
    /* 클랜 육각형 **V2** (D-217 · D-235). 옛 `hexagon` 은 그대로 둔다 (Q9 · 10-4) */
    hexagon_v2: buildClanHexV2OfMock(leagueClan),
    /* 클랜원 정리 (SITE_SPEC_V2 5-2 · D-199). 기존 클랜원 목록은 그대로 둔다 */
    roster: buildClanRoster(leagueClan),
  }
}

export function getLeagueClanPlayers(
  leagueSlug: string,
  clanSlug: string,
  cursor: string | null,
  size: number,
): Page<PlayerRankRow> | null {
  const league = leagueBySlug.get(leagueSlug)
  const clan = clanBySlug.get(clanSlug)
  if (!league || !clan) return null
  const leagueClan = (leagueClansByLeague.get(league.id) ?? []).find((entry) => entry.clanId === clan.id)
  if (!leagueClan) return null

  const rows: PlayerRankRow[] = (leaguePlayersByLeague.get(league.id) ?? [])
    .filter((entry) => entry.leagueClanId === leagueClan.id)
    .sort((a, b) => b.rating - a.rating)
    .map((leaguePlayer, index): PlayerRankRow | null => {
      const player = playerById.get(leaguePlayer.playerId)
      if (!player) return null
      const matchCount = matchCountByLeaguePlayer.get(`${league.id}:${leaguePlayer.playerId}`) ?? 0
      return {
        rank: index + 1,
        league_player_id: leaguePlayer.id,
        player: { id: player.id, name: player.name },
        clan: clanSummaryOf(leagueClan.clanId),
        win: leaguePlayer.win,
        lose: leaguePlayer.lose,
        win_rate: winRate(leaguePlayer.win, leaguePlayer.lose),
        kd_rate: kdRate(leaguePlayer.kill, leaguePlayer.death),
        kill_per_match: killPerMatch(leaguePlayer.kill, matchCount),
        rating: leaguePlayer.rating,
      }
    })
    .filter((entry): entry is PlayerRankRow => Boolean(entry))

  return paginate(rows, cursor, size, (item) => item.league_player_id)
}

/* ------------------------------ 지난시즌 ------------------------------ */

/** 무기별 누적 → 응답 형태 (D-115). 판정된 경기가 없으면 빈 배열이다 */
function weaponStatsOf(leaguePlayerId: string) {
  const byWeapon = weaponStatsByLeaguePlayer.get(leaguePlayerId)
  if (!byWeapon) return []
  return [...byWeapon.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([weapon, bucket]) => {
      const games = bucket.win + bucket.lose
      return {
        weapon: weapon as 0 | 1,
        games,
        win: bucket.win,
        lose: bucket.lose,
        kill: bucket.kill,
        death: bucket.death,
        kd_rate: kdRate(bucket.kill, bucket.death),
        kill_per_match: killPerMatch(bucket.kill, games),
      }
    })
}

export function getLeaguePlayerSeasons(leaguePlayerId: string): LeaguePlayerSeason[] | null {
  if (!leaguePlayerById.has(leaguePlayerId)) return null
  return dataset.leaguePlayerSeasons
    .filter((entry) => entry.leaguePlayerId === leaguePlayerId)
    .sort((a, b) => b.season - a.season)
    .map((entry) => ({
      season: entry.season,
      season_label: `시즌 ${entry.season}`,
      season_type: 'official' as const,
      rank: entry.rank,
      rank_count: entry.rankCount,
      rating: entry.rating,
      win: entry.win,
      lose: entry.lose,
      win_rate: winRate(entry.win, entry.lose),
      kill: entry.kill,
      death: entry.death,
      kd_rate: kdRate(entry.kill, entry.death),
      // 픽스처에는 아래 값이 없다. **0으로 채우지 않는다** (D-099)
      assist: null,
      headshot: null,
      kill_per_match: null,
      mvp_count: null,
      nickname_at_season: null,
      clan_name_at_season: null,
      division_at_season: null,
      source: null,
    }))
}

export function getLeagueClanSeasons(leagueClanId: string): LeagueClanSeason[] | null {
  if (!leagueClanById.has(leagueClanId)) return null
  return dataset.leagueClanSeasons
    .filter((entry) => entry.leagueClanId === leagueClanId)
    .sort((a, b) => b.season - a.season)
    .map((entry) => ({
      season: entry.season,
      season_label: `시즌 ${entry.season}`,
      season_type: 'official' as const,
      rank: entry.rank,
      rank_count: entry.rankCount,
      rating: entry.rating,
      division: entry.division,
      win: entry.win,
      lose: entry.lose,
      win_rate: winRate(entry.win, entry.lose),
    }))
}

/* -------------------------------------------------------------------------- */
/* 게시판                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * 게시글·댓글 작성자 (반익명 — SITE_SPEC_V2 2절 · 에브리타임 방식).
 *
 * **실제 서버(`apps/web/lib/server/queries/boards.ts`의 `toBoardWriter`)와 같은 규칙이다.**
 * 한쪽을 고치면 다른 쪽도 함께 고친다.
 *
 * - 익명이면 `id`·`avatar_url`·`role`·`player` 를 비우고 표시 이름만 내보낸다.
 *   아바타와 운영자 배지도 신원이므로 함께 지운다.
 * - 소속 클랜만은 익명이어도 내보낸다 (에브리타임의 학교 이름에 해당).
 *
 * @param anonLabel 익명일 때 쓸 표시 이름 (`글쓴이` · `익명3` · 목록이면 `익명`)
 */
function toWriter(
  board: Pick<MockBoard, 'userId' | 'anonAlias' | 'discloseType'>,
  anonLabel: string = ANONYMOUS_LIST_LABEL,
): BoardWriter {
  const user = board.userId ? userById.get(board.userId) : undefined

  // 비로그인 글 — 원본 3rd.supply 방식의 자동 별칭을 그대로 둔다 (앞 버전 보존)
  if (!user) {
    return {
      id: null,
      nickname: board.anonAlias ?? ANONYMOUS_LIST_LABEL,
      avatar_url: null,
      role: 0,
      anonymous: true,
      clan: null,
      player: null,
    }
  }

  const player = user.playerId ? playerById.get(user.playerId) : undefined
  const clan = player?.clanId ? clanSummaryOf(player.clanId) : null

  if (isAnonymousDisclose(board.discloseType)) {
    return {
      id: null,
      nickname: anonLabel,
      avatar_url: null,
      role: 0,
      anonymous: true,
      clan,
      player: null,
    }
  }

  return {
    id: user.id,
    nickname: user.nickname,
    avatar_url: user.avatarUrl,
    role: user.role,
    anonymous: false,
    clan,
    player: player ? { id: player.id, name: player.name } : null,
  }
}

/**
 * 글 하나 안의 익명 번호표. 번호는 **그 글 안에서만** 유효하다.
 * 화면에 보이는 댓글 순서(`listComments`)와 같은 순서로 매긴다.
 */
function commentAnonLabels(boardId: string): Map<string, string> {
  const board = boardById.get(boardId)
  return assignAnonymousLabels({
    postAuthorKey: board?.userId ?? null,
    subjects: nestedOrder(commentsInOrder(boardId))
      // 공개 댓글은 번호를 소비하지 않는다
      .filter((comment) => isAnonymousDisclose(comment.discloseType))
      .map((comment) => ({ id: comment.id, authorKey: comment.userId })),
  })
}

/**
 * 번호를 매길 차례를 **화면에 그려지는 순서**로 맞춘다 (교차검증 [중간 5]).
 * 실제 API(`apps/web/lib/server/queries/boards.ts`)의 `nestedOrder` 와 같은 규칙이다.
 */
function nestedOrder(all: MockComment[]): MockComment[] {
  const roots = all.filter((comment) => comment.parentId === null)
  return roots.flatMap((root) => [root, ...all.filter((child) => child.parentId === root.id)])
}

/** 댓글을 화면 순서(숫자 id 오름차순)로 (`listComments`와 같은 정렬) */
function commentsInOrder(boardId: string): MockComment[] {
  return (commentsByBoard.get(boardId) ?? []).slice().sort((a, b) => Number(a.id) - Number(b.id))
}

function commentCountOf(boardId: string): number {
  return (commentsByBoard.get(boardId) ?? []).length
}

/**
 * @param anonLabel 익명 글의 표시 이름.
 *   목록은 번호 없는 `익명`(번호는 글 안에서만 뜻이 있다), 글 상세는 `글쓴이` 다.
 */
function toBoardListItem(board: MockBoard, anonLabel: string = ANONYMOUS_LIST_LABEL): BoardListItem {
  return {
    id: board.id,
    category: board.category,
    title: board.title,
    writer: toWriter(board, anonLabel),
    writer_app: board.writerApp === 1 ? 1 : 0,
    disclose_type: board.discloseType,
    comment_count: commentCountOf(board.id),
    view_count: board.viewCount,
    like_count: board.likeCount,
    dislike_count: board.dislikeCount,
    has_image: board.hasImage,
    created_at: board.createdAt,
    last_edited: board.lastEdited,
    notice: board.notice,
  }
}

/**
 * `hot`(인기) 카테고리는 저장된 카테고리가 아니라 집계 결과다.
 * 원본의 선정 알고리즘은 [미확인] — 아래 가중치는 우리가 정한 임시 규칙이며 Phase 7에서 재검토한다.
 */
function hotScore(board: MockBoard): number {
  return board.likeCount * 3 + commentCountOf(board.id) * 2 + board.viewCount / 100
}

const boardsNewestFirst = [...dataset.boards].sort((a, b) => Number(b.id) - Number(a.id))

export interface BoardListQuery {
  category: string
  cursor: string | null
  size: number
  type?: string | null
  q?: string | null
}

/**
 * 이 목록에 관리자 글을 고정하는가 — 실제 서버(`queries/boards.ts` 의 `pinsAdminPosts`)와 같은 규칙.
 *
 * 검색 중에는 고정하지 않고(그래서 목록에서 빼지도 않는다), `notice` 목록에도 고정하지 않는다
 * (거기가 이미 고정의 출처다).
 */
function pinsAdminPosts(query: BoardListQuery): boolean {
  return !query.q?.trim() && query.category !== 'notice'
}

/** 관리자가 **공개로** 쓴 글인가 (D-261). 판정 규칙은 `@sacloud/ui/adminPost` 한 곳에 있다 */
function isAdminBoard(board: MockBoard): boolean {
  return isAdminWriter(toWriter(board))
}

export function listBoards(query: BoardListQuery): Page<BoardListItem> {
  /* 먼저 **최신순**으로 범위를 잡는다. `hot` 의 점수 정렬은 고정 줄을 뽑은 뒤에 한다 —
     고정 줄은 점수가 아니라 최신순이기 때문이다 (실제 서버 `pinnedAdminIds` 와 같다). */
  let scope: MockBoard[]

  if (query.category === 'hot') {
    scope = boardsNewestFirst.filter((board) => !board.notice)
  } else if (query.category === 'notice') {
    scope = boardsNewestFirst.filter((board) => board.notice)
  } else {
    scope = boardsNewestFirst.filter((board) => board.category === query.category && !board.notice)
  }

  const keyword = query.q?.trim()
  if (keyword) {
    const type = query.type ?? 'board'
    scope = scope.filter((board) => {
      const writer = toWriter(board)
      if (type === 'ipname') return board.anonAlias?.includes(keyword) ?? false
      /* 닉네임 검색은 **공개 글만** 본다 — 익명 글까지 걸리면 닉네임을 넣어 보는 것만으로
         익명이 풀린다 (실제 서버 `boardFilter`와 같은 규칙). */
      if (type === 'nickname') {
        return (
          board.userId !== null && !isAnonymousDisclose(board.discloseType) && writer.nickname.includes(keyword)
        )
      }
      return board.title.includes(keyword) || board.content.includes(keyword)
    })
  }

  /*
   * 관리자 글 상단 고정 (D-261) — 고정한 글은 **모든 쪽의 평소 목록에서 뺀다.**
   * 1쪽 위에 한 번, 2쪽 본문에 또 한 번 나오면 같은 글을 두 번 읽게 된다.
   * 상한을 넘긴 관리자 글은 평소 목록에 그대로 남는다 — 사라지지 않는다.
   */
  const pinned = pinsAdminPosts(query) ? scope.filter(isAdminBoard).slice(0, ADMIN_PIN_LIMIT) : []
  if (pinned.length > 0) {
    const pinnedIds = new Set(pinned.map((board) => board.id))
    scope = scope.filter((board) => !pinnedIds.has(board.id))
  }

  /* `hot` 만 여기서 점수순으로 다시 세운다. **산정식(`hotScore`)은 건드리지 않았다** */
  const source =
    query.category === 'hot' ? scope.slice().sort((a, b) => hotScore(b) - hotScore(a)) : scope

  const page = paginate(
    source.map((board) => toBoardListItem(board)),
    query.cursor,
    query.size,
    (item) => item.id,
  )

  /* 고정 줄은 **첫 쪽에만** 얹는다. 커서는 평소 목록만 가리키므로 페이지가 밀리지 않는다 */
  if (query.cursor) return page
  return { ...page, items: [...pinned.map((board) => toBoardListItem(board)), ...page.items] }
}

export function getBoard(boardId: string): Board | null {
  const board = boardById.get(boardId)
  if (!board) return null
  return {
    // 글 상세에서는 익명 작성자가 `글쓴이` 다 (`익명1` 부터는 댓글 차례)
    ...toBoardListItem(board, POST_WRITER_LABEL),
    content: board.content,
    login: board.userId !== null,
    me: false,
    like_type: 0,
  }
}

function toCommentReply(comment: MockComment, anonLabel: string = ANONYMOUS_LIST_LABEL): CommentReply {
  return {
    id: comment.id,
    board_id: comment.boardId,
    parent_id: comment.parentId ?? comment.id,
    content: comment.deleted ? '' : comment.content,
    writer: toWriter(comment, anonLabel),
    writer_app: comment.writerApp === 1 ? 1 : 0,
    disclose_type: comment.discloseType,
    like_count: comment.likeCount,
    dislike_count: comment.dislikeCount,
    like_type: 0,
    deleted: comment.deleted,
    board_writer: isBoardWriter(comment),
    login: comment.userId !== null,
    me: false,
    created_at: comment.createdAt,
    last_edited: null,
  }
}

function isBoardWriter(comment: MockComment): boolean {
  const board = boardById.get(comment.boardId)
  if (!board || !board.userId || !comment.userId) return false
  return board.userId === comment.userId
}

export function listComments(boardId: string): Comment[] {
  const all = commentsInOrder(boardId)
  const labels = commentAnonLabels(boardId)
  const map = (comment: MockComment) =>
    toCommentReply(comment, labels.get(comment.id) ?? ANONYMOUS_LIST_LABEL)
  const roots = all.filter((comment) => comment.parentId === null)
  return roots.map((comment) => ({
    ...map(comment),
    parent_id: null,
    comments: all.filter((child) => child.parentId === comment.id).map(map),
  }))
}

/* -------------------------------------------------------------------------- */
/* 부트스트랩                                                                    */
/* -------------------------------------------------------------------------- */

export function toUser(user: MockUser): User {
  const player = user.playerId ? playerById.get(user.playerId) : undefined
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    nickname: user.nickname,
    avatar_url: user.avatarUrl,
    role: user.role,
    email_verified_at: user.emailVerifiedAt,
    player: player ? { id: player.id, name: player.name } : null,
    clan: player?.clanId ? clanSummaryOf(player.clanId) : null,
    created_at: user.createdAt,
  }
}

/**
 * 부트스트랩 응답.
 * 로그인 상태는 개발용 세션 스위치(`session.ts`)가 정한 역할을 따른다.
 */
export function getInfos(): Infos {
  return {
    configs: dataset.configs,
    categories: dataset.categories,
    user: currentUser(),
  }
}

/**
 * 개발용 세션 역할에 해당하는 사용자.
 *
 * - `guest` → null (비로그인)
 * - `user` → 일반 회원 (픽스처 users[1])
 * - `leagueAdmin` → 리그 관리자 (픽스처 users[0], `role: 2`)
 */
export function currentUser(): User | null {
  const role = getMockRole()
  if (role === 'guest') return null
  const user = role === 'leagueAdmin' ? dataset.users[0] : dataset.users[1]
  return user ? toUser(user) : null
}

/** 리그 관리자인지 (리그 관리 화면 접근 판정용) */
export function isLeagueAdmin(leagueSlug: string): boolean {
  if (getMockRole() !== 'leagueAdmin') return false
  const league = leagueBySlug.get(leagueSlug)
  if (!league) return false
  return league.ownerUserId === dataset.users[0]?.id
}

export function getMaps() {
  return dataset.maps
}

export function getLeagueIdBySlug(leagueSlug: string): string | null {
  return leagueBySlug.get(leagueSlug)?.id ?? null
}

export function isSlugTaken(slug: string): boolean {
  return leagueBySlug.has(slug)
}

/* ------------------------- 메인 · 리그별 개인랭킹 TOP3 ------------------------- */

/**
 * 메인 TOP3 (`docs/SITE_SPEC_V2.md` 3절).
 *
 * 실제 API(`apps/web/lib/server/queries/homeTop.ts`)와 **같은 형태**를 낸다 —
 * 순위를 새로 매기지 않고 개인랭킹(`getPlayerRanks`)의 앞 3줄을 옮겨 담는다.
 *
 * ── 슬러그가 없으면 자리를 대신 채운다 (**Mock 한정**)
 *   운영 DB 에는 `supply` · `nolink` · `sanply` 가 있지만 Mock 픽스처의 리그는
 *   `officialmain` · `secondline` … 이라 슬러그가 겹치지 않는다. 그대로 두면
 *   Mock 모드에서 세 칸이 전부 비어 화면을 볼 수 없다.
 *   그래서 **Mock 에서만** 같은 순번의 픽스처 리그로 대신 채운다.
 *   이 대체는 픽스처 안에서만 일어난다 — 실제 API 는 슬러그가 없으면 빈 배열이다.
 */
export function getHomeTop(): HomeTop {
  return {
    leagues: HOME_LEAGUES.map((entry, index): HomeLeagueTop => {
      const league = leagueBySlug.get(entry.slug) ?? dataset.leagues[index]
      if (!league) return { slug: entry.slug, abbr: entry.abbr, name: entry.name, rows: [] }

      const page = getPlayerRanks(league.id, null, HOME_TOP_SIZE)
      return {
        slug: league.slug,
        abbr: entry.abbr,
        name: league.name,
        rows: (page?.items ?? []).map((row) => ({
          rank: row.rank,
          player: row.player,
          clan: row.clan,
          rating: row.rating,
        })),
      }
    }),
  }
}

/** 첫 번째 리그 관리자 (Mock 응답에서 사용자 객체가 필요할 때 사용) */
export function sampleUser(): MockUser {
  const user = dataset.users[0]
  if (!user) throw new Error('Mock 사용자 픽스처가 비어 있습니다')
  return user
}

export function sampleClanSummary(): ClanSummary {
  const clan = dataset.clans[0]
  if (!clan) throw new Error('Mock 클랜 픽스처가 비어 있습니다')
  return toClanSummary(clan)
}

export { toClanSummary, toLeagueSummary }
