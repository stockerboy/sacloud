/**
 * 랭킹 표의 치수·색 토큰 — `적진` 팔레트.
 *
 * 랭킹 화면에 무엇을 덧붙이든 **새 크기·새 색을 추측하지 말고 여기 값을 그대로 쓴다**
 * (폼 TOP3 · 무기 탭 · 부리그 탭도 이 리듬을 따른다).
 *
 * ── 규칙
 *   · 얼룩무늬(zebra) 없음. 행 배경은 투명하고 구분은 `--color-line-soft` 1px 뿐이다
 *   · 그림자 없음. 경계는 여백으로 만든다
 *   · 색은 `--color-accent` 하나뿐이다. 넓은 면에 칠하지 않고
 *     **1위 · 활성 탭 밑줄 · 가장 중요한 숫자 하나**에만 쓴다
 *   · 숫자는 전부 `--font-num` + `tabular-nums` — 자릿수가 흔들리면 표가 읽히지 않는다
 *   · 모서리는 거의 각지게 (`--radius`)
 *
 * ── 컬럼을 줄였다 (2026-08-30)
 *   예전 표는 원본 3rd.supply 를 따라 칸이 여덟 개까지 갔다(순위·이름·승·패·승률·킬뎃·평균킬·래더).
 *   한눈에 안 읽혀서 **핵심만 칸으로 세우고 나머지는 그 아래 보조 수치(`SUB`)로 접었다.**
 *   데이터를 없앤 것이 아니라 위계를 바꾼 것이다 — 승/패도 평균킬도 화면에 그대로 남아 있다.
 *
 * 루트 폰트는 PC·모바일 모두 14px 이라 `1rem = 14px` 이다 (`styles.css`).
 * 모바일 행 간격 36px 리듬(마크 1.4rem + 상하 padding 0.55rem + 테두리 1px)은 그대로 유지한다.
 */

/** 표 머리글 줄 */
export const HEAD =
  'flex items-center border-b border-b-line px-4 py-2.5 text-xs tracking-[0.14em] text-faint max-md:px-3'

/** 표 본문 한 줄. 배경 없음 — 행 구분은 아래 실선 1px 뿐이다 */
export const ROW =
  'flex items-center border-b border-b-line-soft px-4 py-3 text-base text-text last:border-b-0 max-md:px-3 max-md:py-[0.55rem] max-md:text-sm'

/** 표 안의 클랜마크 — 좁은 화면에서만 줄인다 (모바일 행 높이 36px 계산의 기준) */
export const MARK = 'mr-2 max-md:h-[1.4rem] max-md:w-[1.4rem]'

/** 숫자 칸 공통 — 자릿수가 흔들리지 않게 고정폭 숫자를 쓴다 */
export const NUM = 'font-num tabular-nums'

/** 칸 안에서 한 단계 접은 보조 수치 (승/패 · 평균킬 등) */
export const SUB = 'mt-0.5 block text-[0.72rem] leading-none text-faint'

/** 1위 표시 — 표에서 빨강을 쓰는 거의 유일한 자리다 */
export const RANK_TOP = 'text-accent font-bold'

/* ------------------------------------------------------------------ 칸 --- */

/** 순위 칸 */
export const COL_RANK = 'w-16 shrink-0 text-center max-md:w-9'
/** 이름 칸 — 남는 폭을 다 쓴다 */
export const COL_NAME = 'flex min-w-0 flex-1 items-center'
/** 지표 칸 (승률 · 킬뎃) */
export const COL_STAT = 'w-28 shrink-0 text-right max-md:w-20'
/** 래더 칸 — 표에서 가장 무거운 숫자 */
export const COL_RATING = 'w-32 shrink-0 text-right max-md:w-24'
/** 좁은 화면에서 감추는 칸 */
export const COL_HIDDEN = 'max-md:hidden'

/* ------------------------------------------------------------------ 탭 --- */

/**
 * 랭킹 화면의 탭 한 벌 — 부리그 탭(`DivisionTabs`)과 무기 탭(`RankWeaponTabs`)이
 * **같은 문자열**을 쓴다. 한 화면에 두 가지 탭 디자인이 생기면 안 되므로
 * 각 파일에 따로 적지 않고 여기 한 곳에 둔다.
 *
 * 면을 칠하지 않는다. 선택된 탭에만 빨강 밑줄 2px 이 들어간다.
 * 탭이 여러 개면 좁은 화면에서 **탭 줄 안에서만** 가로로 민다 (`.mobile-scroll-x`).
 */
export const TAB_ROW = 'mobile-scroll-x mb-6 flex items-stretch gap-1 border-b border-line'
export const TAB =
  'shrink-0 whitespace-nowrap border-b-2 px-5 py-2.5 text-base tracking-wide max-md:px-3.5 max-md:py-2 max-md:text-sm'
export const TAB_ACTIVE = 'border-b-accent font-bold text-text-strong'
export const TAB_IDLE = 'border-b-transparent text-meta hover:text-text'
