/**
 * 리그 만들기 폼 검증.
 *
 * 원본 관측 제약 (`docs/3rd-supply-structure.md` 6장)
 * - **리그이름**: 한글/영어/숫자, 2~8자, `"리그"`로 끝날 수 없음
 * - **리그영문이름**: 영숫자 4~16자, URL slug로 사용, 중복 불가
 * - **리그타입**: 단일리그 / N부리그
 * - **리그맵**: 최소 1개 — 선택한 맵의 경기만 기록된다
 * - **대전인원**: 5vs5 / 6vs6 중 최소 1개 — 선택한 종류만 기록된다
 * - **필수 동의 3항목**
 * - reCAPTCHA 검증
 *
 * 계약(`LeagueCreateInput`)과 같은 규칙을 화면에서도 즉시 보여주기 위해 여기 둔다.
 * 서버(Phase 7)도 계약 스키마로 같은 규칙을 강제한다.
 */

export const LEAGUE_NAME_PATTERN = /^[가-힣a-zA-Z0-9]+$/
export const LEAGUE_SLUG_PATTERN = /^[a-zA-Z0-9]+$/

/** 원본이 요구하는 동의 3항목 — 문구는 같은 뜻으로 새로 썼다 (CLAUDE.md 3장 4번) */
export const LEAGUE_AGREEMENTS: readonly string[] = [
  '클랜을 초대하는 대가로 금전적 보상을 요구하지 않겠습니다.',
  '리그 관리자로서 책임감 있게 리그를 운영하겠습니다.',
  '부적절한 운영이 확인되면 운영자 판단으로 리그가 삭제될 수 있음에 동의합니다.',
]

export function validateLeagueName(value: string): string | null {
  const name = value.trim()
  if (name.length < 2 || name.length > 8) return '리그 이름은 2~8자여야 합니다.'
  if (!LEAGUE_NAME_PATTERN.test(name)) return '한글, 영어, 숫자만 사용할 수 있습니다.'
  if (name.endsWith('리그')) return '리그 이름은 "리그"로 끝날 수 없습니다.'
  return null
}

export function validateLeagueSlug(value: string): string | null {
  const slug = value.trim()
  if (slug.length < 4 || slug.length > 16) return '리그 영문이름은 4~16자여야 합니다.'
  if (!LEAGUE_SLUG_PATTERN.test(slug)) return '영문과 숫자만 사용할 수 있습니다.'
  return null
}

export interface LeagueCreateDraft {
  name: string
  slug: string
  divisionCount: number
  mapIds: readonly string[]
  playerLimits: readonly number[]
  agreements: readonly boolean[]
}

/** 폼 전체가 제출 가능한지 */
export function validateLeagueDraft(draft: LeagueCreateDraft): string | null {
  return (
    validateLeagueName(draft.name) ??
    validateLeagueSlug(draft.slug) ??
    (draft.divisionCount < 1 ? '리그 타입을 선택해 주세요.' : null) ??
    (draft.mapIds.length === 0 ? '리그맵을 1개 이상 선택해 주세요.' : null) ??
    (draft.playerLimits.length === 0 ? '대전인원을 1개 이상 선택해 주세요.' : null) ??
    (draft.agreements.length !== LEAGUE_AGREEMENTS.length ||
    draft.agreements.some((agreed) => !agreed)
      ? '필수 동의 항목에 모두 동의해 주세요.'
      : null)
  )
}
