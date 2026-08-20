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
  type PlayerLeagueEntry,
  type PlayerRankRow,
  type PlayerSearchItem,
  type TeammateStat,
  type TeamSide,
  type User,
  type Writer,
} from '@sacloud/contract'
import { dataset } from './dataset'
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

const matchCountByLeaguePlayer = new Map<string, number>()
for (const [key, list] of matchesByPlayer) matchCountByLeaguePlayer.set(key, list.length)

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
  }
}

function toLeagueSummary(league: MockLeague): LeagueSummary {
  return {
    id: league.id,
    slug: league.slug,
    name: league.name,
    official: league.official,
    division_count: league.divisionCount,
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

export function findPlayerByName(name: string): PlayerSearchItem | null {
  const player = dataset.players.find((entry) => entry.name === name)
  if (!player) return null
  return { id: player.id, name: player.name, clan: playerClanSummary(player) }
}

export function searchPlayers(query: string, limit = 10): PlayerSearchItem[] {
  const keyword = query.trim()
  if (!keyword) return []
  return dataset.players
    .filter((entry) => entry.name.includes(keyword))
    .slice(0, limit)
    .map((entry) => ({ id: entry.id, name: entry.name, clan: playerClanSummary(entry) }))
}

export function findClanByName(name: string): ClanSummary | null {
  const clan = dataset.clans.find((entry) => entry.name === name)
  return clan ? toClanSummary(clan) : null
}

export function searchClans(query: string, limit = 10): ClanSummary[] {
  const keyword = query.trim()
  if (!keyword) return []
  return dataset.clans
    .filter((entry) => entry.name.includes(keyword) || entry.slug.includes(keyword))
    .slice(0, limit)
    .map(toClanSummary)
}

export function findLeagueByName(name: string): LeagueSummary | null {
  const league = dataset.leagues.find((entry) => entry.name === name)
  return league ? toLeagueSummary(league) : null
}

export function searchLeagues(query: string, limit = 10): LeagueSummary[] {
  const keyword = query.trim()
  if (!keyword) return []
  return dataset.leagues
    .filter((entry) => entry.name.includes(keyword) || entry.slug.includes(keyword))
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
function rankedClans(leagueId: string, division: number): MockLeagueClan[] {
  return (leagueClansByLeague.get(leagueId) ?? [])
    .filter((entry) => entry.division === division && !entry.placement)
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
      }
    })
    .filter((entry): entry is ClanRankRow => Boolean(entry))
  return paginate(rows, cursor, size, (item) => item.league_clan_id)
}

export function getPlayerRanks(leagueId: string, cursor: string | null, size: number): Page<PlayerRankRow> | null {
  if (!leagueById.has(leagueId)) return null
  const rows: PlayerRankRow[] = rankedPlayers(leagueId)
    .map((leaguePlayer, index) => {
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
      }
    })
    .filter((entry): entry is PlayerRankRow => Boolean(entry))
  return paginate(rows, cursor, size, (item) => item.league_player_id)
}

/* -------------------------------------------------------------------------- */
/* 매치                                                                         */
/* -------------------------------------------------------------------------- */

function lineupOf(match: MockMatch, side: TeamSide): MatchLineupEntry[] {
  return match.players
    .filter((stat) => stat.side === side)
    .map((stat) => ({
      player_id: stat.playerId,
      name: playerById.get(stat.playerId)?.name ?? '알수없음',
      weapon: stat.weapon,
      dropout: stat.dropout,
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
function toMatchPlayerStat(match: MockMatch, stat: MockMatchPlayer, visible: boolean): MatchPlayerStat {
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
    blue_team: match.blueTeam,
    placement: viewerSide === 'red' ? match.redPlacement : match.bluePlacement,
    rating_update: viewerSide === 'red' ? match.redRatingUpdate : match.blueRatingUpdate,
    mvp_player_id: match.mvpPlayerId,
    league_clan: own,
    opponent,
    red: lineupOf(match, 'red'),
    blue: lineupOf(match, 'blue'),
    player_stat: viewerStat ? toMatchPlayerStat(match, viewerStat, true) : null,
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

  const statsOf = (side: TeamSide): MatchPlayerStat[] =>
    match.players
      .filter((stat) => stat.side === side)
      .map((stat) => toMatchPlayerStat(match, stat, side === viewerSide))

  return { ...base, red_stats: statsOf('red'), blue_stats: statsOf('blue') }
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

  return {
    id: leaguePlayer.id,
    league_id: league.id,
    league: toLeagueSummary(league),
    player: { id: player.id, name: player.name },
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
    match_summary: buildMatchSummary(matches, leaguePlayer.leagueClanId, playerId),
    teammates: buildTeammates(matches, leaguePlayer.leagueClanId, playerId),
  }
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
    .map((leaguePlayer, index) => {
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

export function getLeaguePlayerSeasons(leaguePlayerId: string): LeaguePlayerSeason[] | null {
  if (!leaguePlayerById.has(leaguePlayerId)) return null
  return dataset.leaguePlayerSeasons
    .filter((entry) => entry.leaguePlayerId === leaguePlayerId)
    .sort((a, b) => b.season - a.season)
    .map((entry) => ({
      season: entry.season,
      rank: entry.rank,
      rank_count: entry.rankCount,
      rating: entry.rating,
      win: entry.win,
      lose: entry.lose,
      win_rate: winRate(entry.win, entry.lose),
      kill: entry.kill,
      death: entry.death,
      kd_rate: kdRate(entry.kill, entry.death),
    }))
}

export function getLeagueClanSeasons(leagueClanId: string): LeagueClanSeason[] | null {
  if (!leagueClanById.has(leagueClanId)) return null
  return dataset.leagueClanSeasons
    .filter((entry) => entry.leagueClanId === leagueClanId)
    .sort((a, b) => b.season - a.season)
    .map((entry) => ({
      season: entry.season,
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

function toWriter(board: Pick<MockBoard, 'userId' | 'anonAlias'>): Writer {
  if (board.userId) {
    const user = userById.get(board.userId)
    if (user) {
      return { id: user.id, nickname: user.nickname, avatar_url: user.avatarUrl, role: user.role }
    }
  }
  return { id: null, nickname: board.anonAlias ?? '익명', avatar_url: null, role: 0 }
}

function commentCountOf(boardId: string): number {
  return (commentsByBoard.get(boardId) ?? []).length
}

function toBoardListItem(board: MockBoard): BoardListItem {
  return {
    id: board.id,
    category: board.category,
    title: board.title,
    writer: toWriter(board),
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

export function listBoards(query: BoardListQuery): Page<BoardListItem> {
  let source: MockBoard[]

  if (query.category === 'hot') {
    source = dataset.boards
      .filter((board) => !board.notice)
      .slice()
      .sort((a, b) => hotScore(b) - hotScore(a))
  } else if (query.category === 'notice') {
    source = boardsNewestFirst.filter((board) => board.notice)
  } else {
    source = boardsNewestFirst.filter((board) => board.category === query.category && !board.notice)
  }

  const keyword = query.q?.trim()
  if (keyword) {
    const type = query.type ?? 'board'
    source = source.filter((board) => {
      const writer = toWriter(board)
      if (type === 'ipname') return board.anonAlias?.includes(keyword) ?? false
      if (type === 'nickname') return board.userId !== null && writer.nickname.includes(keyword)
      return board.title.includes(keyword) || board.content.includes(keyword)
    })
  }

  return paginate(source.map(toBoardListItem), query.cursor, query.size, (item) => item.id)
}

export function getBoard(boardId: string): Board | null {
  const board = boardById.get(boardId)
  if (!board) return null
  return {
    ...toBoardListItem(board),
    content: board.content,
    login: board.userId !== null,
    me: false,
    like_type: 0,
  }
}

function toCommentReply(comment: MockComment): CommentReply {
  return {
    id: comment.id,
    board_id: comment.boardId,
    parent_id: comment.parentId ?? comment.id,
    content: comment.deleted ? '' : comment.content,
    writer: toWriter(comment),
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
  const all = (commentsByBoard.get(boardId) ?? []).slice().sort((a, b) => Number(a.id) - Number(b.id))
  const roots = all.filter((comment) => comment.parentId === null)
  return roots.map((comment) => ({
    ...toCommentReply(comment),
    parent_id: null,
    comments: all.filter((child) => child.parentId === comment.id).map(toCommentReply),
  }))
}

/* -------------------------------------------------------------------------- */
/* 부트스트랩                                                                    */
/* -------------------------------------------------------------------------- */

export function toUser(user: MockUser): User {
  const player = user.playerId ? playerById.get(user.playerId) : undefined
  return {
    id: user.id,
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
 * Phase 0에서는 항상 비로그인 상태로 응답한다.
 * 로그인 사용자 전환(비로그인 / 일반 / 리그관리자)은 Phase 6에서 개발용 스위치로 붙인다.
 */
export function getInfos(): Infos {
  return {
    configs: dataset.configs,
    categories: dataset.categories,
    user: null,
  }
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
