import { z } from 'zod'
import { ClanMark, Count, Id, IsoDateTime, Slug } from '../common'
import { Role } from '../codes'

/**
 * 여러 엔티티가 서로를 참조하므로(플레이어↔클랜↔리그) 요약 형태는 여기 한 곳에 모은다.
 * 엔티티 모듈 간 순환 참조를 피하기 위한 구조다.
 */

export const PlayerSummary = z.object({
  id: Id,
  name: z.string(),
})
export type PlayerSummary = z.infer<typeof PlayerSummary>

export const ClanSummary = z.object({
  id: Id,
  slug: Slug,
  name: z.string(),
  mark: ClanMark,
})
export type ClanSummary = z.infer<typeof ClanSummary>

export const LeagueSummary = z.object({
  id: Id,
  slug: Slug,
  name: z.string(),
  /** 공식 리그 배지. 원본의 필드명은 [미확인] — 우리 계약에서 `official`로 확정한다. */
  official: z.boolean(),
  division_count: Count,
  /**
   * 무소속리그인가 (D-107).
   *
   * 개인 기록 자체는 공식리그와 **똑같이 존재한다** — 래더·승패·승률·랭킹·시즌 카드·최근 경기.
   * 이 값이 `true`면 화면에서 **누적 kill/death/킬뎃만** 내보내지 않는다.
   * 경기 한 판의 K/D/A는 숨기지 않는다.
   */
  hides_cumulative_kd: z.boolean(),
})
export type LeagueSummary = z.infer<typeof LeagueSummary>

/** 게시글·댓글 작성자. 익명 글은 id가 null이고 nickname이 자동 별칭이다. */
export const Writer = z.object({
  id: Id.nullable(),
  nickname: z.string(),
  avatar_url: z.string().url().nullable(),
  role: Role,
})
export type Writer = z.infer<typeof Writer>

/** 리그 관리자 등 사용자 요약 */
export const UserSummary = z.object({
  id: Id,
  nickname: z.string(),
  avatar_url: z.string().url().nullable(),
  role: Role,
})
export type UserSummary = z.infer<typeof UserSummary>

/** 마지막 갱신 시각을 노출하는 엔티티 공통 필드 */
export const RenewedAt = IsoDateTime.nullable()
