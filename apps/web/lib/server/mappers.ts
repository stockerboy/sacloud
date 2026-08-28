import type {
  ClanSummary,
  LeagueSummary,
  PlayerSummary,
  User,
  UserSummary,
  Writer,
} from '@sacloud/contract'
import { toKstIso, toKstIsoOrNull } from './format'

/**
 * DB 행 → 계약 응답 형태 변환.
 *
 * Mock의 `store.ts`가 같은 일을 하고 있고, **두 구현의 출력이 같아야 한다.**
 * 여기 매퍼는 store.ts의 `toClanSummary` / `toLeagueSummary` / `toWriter` 등과
 * 1:1로 대응한다. 한쪽을 고치면 다른 쪽도 함께 고친다.
 *
 * 인자 타입은 Prisma 모델 전체가 아니라 **필요한 필드만** 요구한다.
 * 그래야 `select`로 최소 컬럼만 읽어도 그대로 넘길 수 있다.
 */

export interface ClanFields {
  id: string
  slug: string
  name: string
  markBgUrl: string | null
  markFrontUrl: string | null
  /** 3rd.supply 공식 클랜 레지스트리의 id. 있으면 공식 1/2부 등록 클랜이다 */
  sourceClanId?: string | null
}

/**
 * SACLOUD 공식 1/2부 등록 클랜인가 (D-146).
 *
 * 판정 기준은 **`sourceClanId` 하나**다. 3rd.supply 공식 클랜 레지스트리에서 이관된
 * 44개 클랜만 이 값을 가진다. 이름·slug 문자열로 추측하지 않는다 —
 * 비슷한 이름의 외부 클랜을 공식으로 잘못 올리는 것이 가장 위험하다.
 *
 * `sourceClanId` 가 없는 클랜에는 개발용으로 만든 `real-` 접두 클랜 4개도 포함된다.
 * 그것들도 공식이 아니다.
 */
export function isOfficialLeagueClan(clan: Pick<ClanFields, 'sourceClanId'>): boolean {
  return Boolean(clan.sourceClanId)
}

export function toClanSummary(clan: ClanFields): ClanSummary {
  const official = isOfficialLeagueClan(clan)
  return {
    id: clan.id,
    slug: clan.slug,
    name: clan.name,
    /* 등록 클랜이 아니면 **실제 마크를 내보내지 않는다.**
       화면은 마크가 비어 있으면 공통 fallback 마크를 그린다. */
    mark: official ? { bg: clan.markBgUrl, front: clan.markFrontUrl } : { bg: null, front: null },
    is_official_clan: official,
  }
}

export function toClanSummaryOrNull(clan: ClanFields | null | undefined): ClanSummary | null {
  return clan ? toClanSummary(clan) : null
}

export interface LeagueFields {
  id: string
  slug: string
  name: string
  official: boolean
  divisionCount: number
  /** "official" | "independent" — 무소속리그면 누적 킬뎃을 응답에 넣지 않는다 (D-107) */
  category: string
}

export function toLeagueSummary(league: LeagueFields): LeagueSummary {
  return {
    id: league.id,
    slug: league.slug,
    name: league.name,
    official: league.official,
    division_count: league.divisionCount,
    hides_cumulative_kd: league.category === 'independent',
    /* 화면이 부리그 칸을 `1부리그` 로 쓸지 `1티어` 로 쓸지 정하는 값이다 (D-165).
       DB 에 다른 값이 들어와 있어도 계약 밖의 문자열을 그대로 내보내지 않는다. */
    category: league.category === 'independent' ? 'independent' : 'official',
  }
}

export interface PlayerFields {
  id: string
  name: string
}

export function toPlayerSummary(player: PlayerFields): PlayerSummary {
  return { id: player.id, name: player.name }
}

export function toPlayerSummaryOrNull(
  player: PlayerFields | null | undefined,
): PlayerSummary | null {
  return player ? toPlayerSummary(player) : null
}

export interface UserFields {
  id: string
  nickname: string
  avatarUrl: string | null
  role: number
}

export function toUserSummary(user: UserFields): UserSummary {
  return { id: user.id, nickname: user.nickname, avatar_url: user.avatarUrl, role: user.role }
}

export function toUserSummaryOrNull(user: UserFields | null | undefined): UserSummary | null {
  return user ? toUserSummary(user) : null
}

/**
 * 게시글·댓글 작성자.
 * 로그인 작성자면 닉네임을, 비로그인 익명 글이면 자동 별칭을 쓴다.
 * 별칭도 없으면 `익명`으로 표기한다 (store.ts와 동일).
 */
export function toWriter(source: {
  user?: UserFields | null
  anonAlias: string | null
}): Writer {
  if (source.user) {
    return {
      id: source.user.id,
      nickname: source.user.nickname,
      avatar_url: source.user.avatarUrl,
      role: source.user.role,
    }
  }
  return { id: null, nickname: source.anonAlias ?? '익명', avatar_url: null, role: 0 }
}

/** GET /me 등에서 쓰는 사용자 상세 */
export function toUser(user: {
  id: string
  email: string
  nickname: string
  avatarUrl: string | null
  role: number
  emailVerifiedAt: Date | null
  createdAt: Date
  playerLink?: {
    player: (PlayerFields & { clan: ClanFields | null }) | null
  } | null
}): User {
  const player = user.playerLink?.player ?? null
  return {
    id: user.id,
    email: user.email,
    nickname: user.nickname,
    avatar_url: user.avatarUrl,
    role: user.role,
    email_verified_at: toKstIsoOrNull(user.emailVerifiedAt),
    player: toPlayerSummaryOrNull(player),
    clan: toClanSummaryOrNull(player?.clan ?? null),
    created_at: toKstIso(user.createdAt),
  }
}

/** `select`로 읽을 때 재사용하는 최소 컬럼 집합 */
export const CLAN_SUMMARY_SELECT = {
  id: true,
  slug: true,
  name: true,
  markBgUrl: true,
  markFrontUrl: true,
  // 공식 등록 클랜 판정에 쓴다 (D-146)
  sourceClanId: true,
} as const

export const LEAGUE_SUMMARY_SELECT = {
  id: true,
  slug: true,
  name: true,
  official: true,
  divisionCount: true,
  category: true,
} as const

export const PLAYER_SUMMARY_SELECT = { id: true, name: true } as const

export const USER_SUMMARY_SELECT = {
  id: true,
  nickname: true,
  avatarUrl: true,
  role: true,
} as const
