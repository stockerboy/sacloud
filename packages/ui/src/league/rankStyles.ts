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
  'flex items-center justify-center max-md:justify-start border-b border-b-line px-4 py-2.5 text-xs tracking-[0.14em] text-faint max-md:px-3'

/** 표 본문 한 줄. 배경 없음 — 행 구분은 아래 실선 1px 뿐이다 */
export const ROW =
  /*
   * ⚠ ★2026-09-16 — 폰 글자를 키웠다★ (사장님: «랭킹글씨 맞춰달라고 했잖아
   *   클랜랭킹 글자크기로 맞춰줘»).
   *
   *   ★실측부터 했다★ — 개인랭킹 닉네임도 클랜랭킹 클랜명도 ★둘 다 13.125px★ 로
   *   이미 같았다 (CDP computed style). 달라 보인 까닭은 ★색★ 이다 —
   *   개인랭킹 닉네임은 순위색(노랑)이라 어두운 바탕에서 가늘어 보이고,
   *   클랜랭킹 클랜명은 흰색이라 또렷하다.
   *
   *   크기를 «맞추는» 것으로는 할 일이 없으므로, 사장님이 작다고 느끼신 쪽을 따라
   *   ★랭킹 표 글자를 함께 키운다★ — 13.125 → 14.25px. 둘은 여전히 같다.
   *   옛 값은 `max-md:text-sm` 이다.
   */
  'flex items-center justify-center max-md:justify-start border-b border-b-line-soft px-4 py-3 text-base text-text last:border-b-0 max-md:px-3 max-md:py-[0.55rem] max-md:text-[0.95rem]'

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
export const COL_RANK = 'w-16 shrink-0 text-center max-md:w-7'
/**
 * 이름 칸.
 *
 * ⚠ ★PC 에서는 고무줄이 아니다★ (2026-09-17 사장님:
 *   «닉네임이랑 수치정보랑 너무 떨어져있어서 가독성이 안좋은데
 *    싹다 왼쪽끕과 오른쪽끕에 붙어있어»).
 *
 *   예전에는 `flex-1` 이라 남는 폭을 혼자 먹었다. 표 폭 900px 안쪽 836px 에서
 *   순위 64 · 승률 112 · 킬뎃 112 · 래더 128 을 빼면 ★이름 칸이 420px★ 이었고,
 *   실제 닉네임은 60~100px 이라 ★닉네임 뒤에 300px 넘는 빈 칸★ 이 생겼다.
 *   글씨가 작은 게 아니라 칸이 고무줄이었다.
 *
 *   고정폭으로 바꾸면 줄 전체가 676px 덩어리가 되고, `ROW` 의 `justify-center` 가
 *   그걸 표 가운데 놓는다 — ★바깥 테두리는 여전히 가로로 길다.★
 *
 *   폰은 그대로 `flex-1` 이다 — 390px 에서는 이미 붙어 있고,
 *   고정폭을 주면 오히려 가로 스크롤이 생긴다.
 */
export const COL_NAME = 'flex min-w-0 w-[260px] items-center max-md:w-auto max-md:flex-1'
/** 지표 칸 (승률 · 킬뎃) */
export const COL_STAT = 'w-28 shrink-0 text-right max-md:w-[60px]'
/**
 * 소속 클랜명 칸 (2026-09-02 사장님 지시 #10 — "순위닉네임, 래더 사이에 소속클랜명을 적어라").
 * 홈 미리보기가 켜서 쓴다 (`PlayerRankTable` 의 `clanColumn`). 폰에서도 남긴다 — 길면 말줄임.
 */
export const COL_CLAN = 'w-36 shrink-0 pr-3 max-md:w-24 max-md:pr-2'
/**
 * ★「메인」 칸★ — 클랜랭킹의 주요멤버 다섯 (2026-09-16 밤 사장님:
 * "클명이랑 승률사이에 메인 이라고 쓰고 메인멤버 5명을 써주든가").
 *
 * PC 1440px 에서 클랜명과 승률 사이가 **800px 비어 있던** 자리다.
 * 폭은 고정이 아니라 **남는 만큼**이다 — 이름 칸이 먼저 제 몫을 가져가고 나머지를 받는다.
 * `max-w` 는 아주 넓은 화면에서 다섯이 화면 끝까지 흩어지지 않게 하는 고삐다.
 *
 * ⚠ **1120px 아래에서는 칸째로 사라진다.** 좁은 화면에서는 이름 칸을 먼저 살려야 하고,
 *   폰(390px)에는 넣을 자리가 아예 없다 — 가로 스크롤은 절대 만들지 않는다.
 */
export const COL_MAIN = 'hidden min-[1120px]:flex min-w-0 flex-[2_1_0] max-w-[560px] items-center pr-4'

/** 래더 칸 — 표에서 가장 무거운 숫자 */
export const COL_RATING = 'w-32 shrink-0 text-right max-md:w-[76px]'
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
