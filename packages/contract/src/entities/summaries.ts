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
  /**
   * SACLOUD 공식 1/2부 등록 클랜인가 (D-146).
   *
   * 등록 클랜만 **실제 클랜마크**를 쓴다. 외부·미등록 클랜은 마크를 내보내지 않고
   * 화면에서 공통 fallback 마크를 그린다 — 외부 클랜의 emblem 을 우리 화면에서
   * 공식 소속처럼 보여 주지 않기 위해서다.
   *
   * 판정은 **서버가** 한다. 클라이언트가 slug 문자열로 추측하지 않는다.
   * 기본값 `false` 라 기존 응답과도 호환된다.
   */
  is_official_clan: z.boolean().default(false),
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
  /**
   * 리그 구분 — `official` | `independent` (D-107 · D-165).
   *
   * 화면이 **표기**를 고르는 데 쓴다. 무소속리그는 부리그 칸을 `1부리그` 가 아니라
   * `1티어` 로 쓴다 (D-165). 값의 구조는 같다 — `LeagueClan.division` 그대로다.
   *
   * `hides_cumulative_kd` 와 지금은 같은 조건에서 켜지지만 **뜻이 다르다.**
   * 하나는 "무엇을 감추는가", 다른 하나는 "무엇이라 부르는가"다. 합치지 않는다.
   *
   * 기본값이 있어 기존 응답과도 호환된다.
   */
  category: z.enum(['official', 'independent']).default('official'),
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
