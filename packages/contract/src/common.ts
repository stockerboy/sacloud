import { z } from 'zod'

/**
 * 공통 원시 타입.
 *
 * 주의: 원본(3rd.supply) 응답의 정확한 날짜 포맷·ID 타입은 관측 범위 밖이라 확정할 수 없다.
 * 아래 규칙은 **우리 서비스의 계약**으로 확정한 값이며, 원본과 동일함이 검증된 것은 아니다.
 */

/** ISO 8601 날짜/시각 문자열 (예: 2026-06-05T00:06:24+09:00). 원본 포맷은 [미확인]. */
export const IsoDateTime = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/,
    'ISO 8601 날짜/시각 문자열이어야 합니다',
  )

/** ISO 8601 날짜 문자열 (예: 2016-02-11). 클랜 설립일 등. */
export const IsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'ISO 8601 날짜 문자열이어야 합니다')

/**
 * 식별자는 전부 문자열로 다룬다.
 * 근거: 매치 ID가 `YYMMDDHHmmss` + 6자리(18자리 숫자)라 Number.MAX_SAFE_INTEGER를 넘는다.
 * 플레이어 ID처럼 안전 범위인 값도 일관성을 위해 문자열로 통일한다.
 */
export const Id = z.string().min(1)

/** 리그·클랜의 URL slug */
export const Slug = z.string().min(1)

/** 0~100 승률 등 백분율. 소수 허용. */
export const Percent = z.number().min(0).max(100)

/** 0 이상 정수 카운트 */
export const Count = z.number().int().min(0)

/** 래더(Elo) 점수 */
export const Rating = z.number().int()

/** 경기당 래더 증감 (±). 관측 범위: 승 +7~+12 / 패 -10~-19 */
export const RatingUpdate = z.number().int()

/** 클랜마크: 배경/전면 2레이어 이미지 URL */
export const ClanMark = z.object({
  bg: z.string().url().nullable(),
  front: z.string().url().nullable(),
})
export type ClanMark = z.infer<typeof ClanMark>
