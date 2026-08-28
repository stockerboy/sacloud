/**
 * 상단 GNB 설정.
 *
 * 원본은 대표 리그 3개(`/league/supply` `/league/sanply` `/league/daerule`)를
 * GNB에 **하드코딩**해 두고, 그 뒤에 `리그` `게시판`을 둔다.
 * 우리는 같은 구조(대표 리그 3개 + 리그 + 게시판)를 유지하되 링크 대상만 설정으로 뺐다.
 *
 * 리그 slug·이름은 Phase 0 픽스처 정책(docs/DECISIONS.md D-005)에 따라
 * **원본 리그명을 쓰지 않고 우리가 만든 가상의 리그**를 가리킨다.
 * 실제 운영 리그가 정해지면 이 배열만 바꾼다.
 */

export interface NavLink {
  label: string
  href: string
}

/**
 * 대표 리그 — 현재 리그를 보고 있으면 배경이 바뀐다(원본 `league-nav-active`).
 *
 * **여기에 개발용 시드 리그를 넣지 않는다** (D-116). 예전에는 픽스처 리그 3개
 * (`officialmain` · `secondline` · `friendly01`)가 박혀 있어서, 사이트 어디에도
 * 실제 운영 리그로 가는 링크가 없고 방문자가 가짜 리그부터 보게 됐다.
 *
 * 원본 실측(2026-08-27): GNB 대표 리그는 **3개**이고 순서·경로가 아래와 같다.
 * `공식리그 /league/supply` · `열산리그 /league/sanply` · `대룰리그 /league/daerule`.
 * 우리 DB에도 같은 slug 의 리그가 셋 다 있는데 GNB 에는 하나만 걸려 있어서,
 * 나머지 두 리그로 가는 링크가 사이트 어디에도 없었다 (UI_PARITY_AUDIT 2-1).
 *
 * `sanply` 의 표시 이름은 사용자 지시로 `3부리그` → **`열산리그`** 로 바꿨다.
 * slug 는 `sanply` 그대로다. 운영 DB `League.name` 도 `열산리그` 라 화면 전체가 일치한다.
 */
export const FEATURED_LEAGUES: readonly NavLink[] = [
  { label: '공식리그', href: '/league/supply' },
  { label: '열산리그', href: '/league/sanply' },
  { label: '대룰리그', href: '/league/daerule' },
]

/** 대표 리그 뒤에 오는 고정 메뉴 — 원본 `nav-active`(굵게 + 흰 밑줄) */
export const PRIMARY_NAV: readonly NavLink[] = [
  { label: '리그', href: '/leagues' },
  { label: '게시판', href: '/board' },
]

/**
 * 푸터 문구.
 * 원본의 상호·연락처·저작권 표기는 그대로 가져오지 않는다(CLAUDE.md 3장 4번).
 * 레이아웃(약관 링크 2개 → 저작권 → 문의 메일)만 동일하게 재현하고 값은 우리 것으로 채운다.
 */
export const SITE_BRAND = {
  name: 'SACLOUD',
  copyright: '© 2026 SACLOUD',
  contactLabel: 'Terms of Service | 문의 :',
  contactEmail: 'sacloud@local.invalid',
} as const
