import type { TeamSide, Weapon } from '@sacloud/contract'

/**
 * Mock 내부 저장 형태.
 *
 * 계약(`@sacloud/contract`) 스키마는 **응답 형태**이고, 여기 타입은 **저장 형태**다.
 * 저장 형태에는 응답에 없는 연결 키(clanId 등)가 있고, 승률·킬뎃처럼 계산 가능한 값은 두지 않는다.
 * Phase 7에서 이 구조가 대략 그대로 DB 테이블로 옮겨간다.
 */

export interface MockUser {
  id: string
  email: string
  nickname: string
  avatarUrl: string | null
  role: number
  emailVerifiedAt: string | null
  /** 서든어택 계정 연동 */
  playerId: string | null
  createdAt: string
}

export interface MockPlayer {
  id: string
  name: string
  clanId: string | null
  position: string | null
  note: string | null
  renewedAt: string | null
}

export interface MockClan {
  id: string
  slug: string
  name: string
  markBg: string | null
  markFront: string | null
  masterPlayerId: string
  notice: string | null
  establishedAt: string
  renewedAt: string | null
  playerIds: string[]
}

export interface MockMap {
  id: string
  name: string
}

export interface MockLeague {
  id: string
  slug: string
  name: string
  official: boolean
  divisionCount: number
  description: string | null
  ownerUserId: string
  mapIds: string[]
  playerLimits: number[]
  status: number
  createdAt: string
  season: number
}

export interface MockLeagueClan {
  id: string
  leagueId: string
  clanId: string
  rating: number
  division: number
  win: number
  lose: number
  placement: boolean
  status: number
  joinedAt: string
}

export interface MockLeaguePlayer {
  id: string
  leagueId: string
  leagueClanId: string
  playerId: string
  rating: number
  win: number
  lose: number
  kill: number
  death: number
  assist: number
  headshot: number
  mvpCount: number
  placement: boolean
}

export interface MockMatchPlayer {
  playerId: string
  leagueClanId: string
  side: TeamSide
  kill: number
  death: number
  assist: number
  headshot: number
  damage: number
  weapon: Weapon
  dropout: boolean
  /** 경기 직전 래더 (배치중이면 null) */
  rating: number | null
  ratingUpdate: number | null
  placement: boolean
  win: boolean
  mvp: boolean
}

export interface MockMatch {
  id: string
  leagueId: string
  mapId: string
  playerCount: number
  startAt: string
  endAt: string
  /** 초 */
  playTime: number
  redLeagueClanId: string
  blueLeagueClanId: string
  redRating: number | null
  blueRating: number | null
  redDivision: number
  blueDivision: number
  redPlacement: boolean
  bluePlacement: boolean
  winnerSide: TeamSide
  /** 선공 진영이 블루인지 (원본 `blue_team`) */
  blueTeam: boolean
  redRatingUpdate: number | null
  blueRatingUpdate: number | null
  mvpPlayerId: string | null
  players: MockMatchPlayer[]
}

export interface MockLeaguePlayerSeason {
  leaguePlayerId: string
  season: number
  rank: number | null
  rankCount: number | null
  rating: number
  win: number
  lose: number
  kill: number
  death: number
}

export interface MockLeagueClanSeason {
  leagueClanId: string
  season: number
  rank: number | null
  rankCount: number | null
  rating: number
  division: number
  win: number
  lose: number
}

export interface MockBoard {
  id: string
  category: string
  title: string
  content: string
  /** 로그인 작성자 (없으면 비로그인 익명 글) */
  userId: string | null
  /** 익명 별칭 (규칙은 원본 [미확인]) */
  anonAlias: string | null
  discloseType: number
  writerApp: number
  viewCount: number
  likeCount: number
  dislikeCount: number
  hasImage: boolean
  notice: boolean
  createdAt: string
  lastEdited: string | null
}

export interface MockComment {
  id: string
  boardId: string
  parentId: string | null
  content: string
  userId: string | null
  anonAlias: string | null
  discloseType: number
  writerApp: number
  likeCount: number
  dislikeCount: number
  deleted: boolean
  createdAt: string
}

export interface MockCategory {
  slug: string
  name: string
  notice: boolean
  order: number
}

export interface MockDataset {
  /** 픽스처 기준 시각. 상대시간 표기가 흔들리지 않도록 고정한다. */
  now: string
  configs: Record<string, string | number | boolean>
  categories: MockCategory[]
  maps: MockMap[]
  users: MockUser[]
  players: MockPlayer[]
  clans: MockClan[]
  leagues: MockLeague[]
  leagueClans: MockLeagueClan[]
  leaguePlayers: MockLeaguePlayer[]
  matches: MockMatch[]
  leaguePlayerSeasons: MockLeaguePlayerSeason[]
  leagueClanSeasons: MockLeagueClanSeason[]
  boards: MockBoard[]
  comments: MockComment[]
}
