/**
 * **리그가 무엇을 보여 주는가** — 한 곳에 모아 둔 설정 (2026-09-01 사용자 지시).
 *
 * ── 왜 이 파일이 생겼나
 *   사용자가 리그마다 다른 것을 요구했다.
 *
 *   > "리그홈은 다 없애고 클랜랭킹이랑 개인랭킹만 해"
 *   > "우리는 리그 세개뿐이다 SPL IPL 10🏔️ · 열산은 킬뎃(킬/데스) 승률 (전승패) 이것만"
 *
 *   D-204 는 *"리그별로 칸을 감추는 분기를 만들지 마라"* 고 했다. 그 규칙의 뜻은
 *   **분기를 화면마다 흩뿌리지 말라**는 것이다. 그래서 화면에 `if (slug === 'sanply')`
 *   를 뿌리는 대신 규칙을 여기 한 곳에 모으고, 화면은 이 표를 읽기만 한다.
 *   새 리그가 생기면 여기 한 줄이면 되고, 되돌리려면 여기 한 줄을 지우면 된다.
 *
 * ── 지금 있는 리그는 셋뿐이다
 *   ```
 *   SPL    supply   클랜랭킹 · 개인랭킹 · 래더 있음
 *   IPL    nolink   클랜랭킹 · 개인랭킹 · 래더 있음 (티어별)
 *   10🏔️  sanply   개인랭킹만 · **래더도 순위도 없다**
 *   ```
 *   `daerule`(대룰)은 준비중이라 어느 화면에도 걸지 않는다 (D-178).
 */

/** 랭킹 표에서 보여 줄 칸 */
export interface RankColumns {
  /** 순위 숫자 */
  rank: boolean
  /** 승률 (아래에 `N승 N패`) */
  winRate: boolean
  /** 킬뎃 (아래에 평균킬) — 클랜랭킹에는 원래 없는 칸이다 */
  kd: boolean
  /** 래더 점수 */
  rating: boolean
}

export interface LeagueScreenSpec {
  /** 클랜랭킹 화면이 있는가. 없으면 탭에서도 빠진다 */
  clanRank: boolean
  /** 개인랭킹 표의 칸 */
  playerColumns: RankColumns
  /** 클랜랭킹 표의 칸 */
  clanColumns: RankColumns
  /**
   * **티어를 화면에 표시하는가** (2026-09-02 사장님 지시 #23 — #9 를 뒤집었다).
   *
   * > "1부 2부 라는 표현을 이제 아예 안 쓴다. IPL만 1,2,3,4,5,6티어 라는 단어를 쓰고
   * >  spl은 티어도 없고 1,2부도 아예 없다."
   *
   * ```
   * IPL(nolink)       true    티어 탭 · 「N티어」 표기 · 티어별 승률/전적 · 행마다 티어 라벨
   * SPL(supply)       false   등급 개념 자체가 없다 — 단일리그처럼 보인다
   * 10mountain        false   원래 단일리그
   * ```
   * 「부리그」「1부」「2부」 라는 말은 어디에도 안 쓴다 — 표기는 전부 「N티어」 다 (`divisionLabel`).
   * **데이터는 그대로다** — `LeagueClan.division` · API 의 `division` · `/rank/clan/{division}` 라우트는
   * 하나도 건드리지 않는다. 화면은 `showsTier(slug)` 하나만 본다.
   *
   * ⚠ 옛 서술 (같은 날 · 지시 #9 · D-265 ③) — «IPL 의 1부·2부 구분을 화면에서 없앤다» 로 읽어
   *   `nolink` 만 false 였다. 사장님이 반대라고 명확히 했다. 필드 이름도 `showsDivision` 에서 바꿨다
   *   (그 이름은 별칭으로 남아 있다 — `showsDivision()`).
   */
  showsTier: boolean
  /**
   * **공식 리그 표기** (2026-09-02 사장님 정정 · 지시 #17).
   *
   * > "공식리그는 SPL과 IPL이다 열산만 비공식표시해라 잘못표기돼있다"
   *
   * 배지(`공식` · `비공식`)를 그리는 화면 전부가 이 값 하나를 본다.
   * DB 의 `League.official` 열(API 응답의 `official`)이나 계산용 `category`(티어 정렬 · 킬뎃 감춤)와는
   * **별개의 표기용 값**이다 — 둘을 섞지 않는다. 데이터 쪽이 맞춰지면 표와 같아진다.
   */
  official: boolean
  /**
   * **리그 안 게시판**의 카테고리 slug (2026-09-02 사장님 지시 #14-2).
   *
   * > "게시판은 SPL메뉴 안에 있는거다 따로 있는것이 아니다 IPL도 마찬가지"
   *
   * `/league/{slug}/board/**` 가 이 카테고리의 글을 그린다 (DB `BoardCategory.slug` · 운영에 행 있음).
   * `null` 이면 그 리그에는 게시판 탭이 없고, 주소로 들어와도 리그 첫 화면으로 보낸다.
   */
  boardCategory: string | null
  /**
   * **리그가 나열되는 화면에 보이는가** (2026-09-02 사장님 지시 #22 — "대룰리그 뺴라").
   *
   * `false` 면 리그 목록 · 프로필의 리그 참가 카드 · 검색 결과 어디에도 안 나온다.
   * **데이터는 지우지 않는다** — 리그 행·경기·기록은 그대로이고 `/league/{slug}/…` 를 직접 치면
   * 여전히 열린다 (과거 기록 조회는 살아 있어야 한다 · `CLAUDE.md` 3-A 7 · 10-4).
   * 되돌리려면 그 리그 줄의 이 값을 `true` 로.
   */
  listed: boolean
}

/** 공식 래더가 있는 리그의 기본값 — 지금까지의 화면 그대로다 */
const WITH_LADDER: LeagueScreenSpec = {
  clanRank: true,
  playerColumns: { rank: true, winRate: true, kd: true, rating: true },
  /* 클랜랭킹에는 킬뎃 칸이 원래 없다 */
  clanColumns: { rank: true, winRate: true, kd: false, rating: true },
  /* 티어는 IPL 만 쓴다 (지시 #23). 모르는 리그는 등급 개념 없이 그린다 */
  showsTier: false,
  official: true,
  /* 모르는 리그에는 게시판이 없다 — 카테고리 행을 지어내지 않는다 */
  boardCategory: null,
  listed: true,
}

/**
 * 대룰리그(`daerule`) — **닫힌 리그** (D-178 준비중 · 지시 #22 «대룰리그 뺴라»).
 * 나열되는 화면에서 빠진다. 데이터·라우트는 그대로다. `PREPARING_LEAGUE_SLUGS`(ui)와 짝이다.
 */
const CLOSED: LeagueScreenSpec = { ...WITH_LADDER, listed: false }

/**
 * IPL(`nolink`) — 래더가 있고 **티어(1~6)를 화면에 쓴다** (지시 #23).
 *
 * ⚠ 옛 서술 (지시 #9 · D-265 ③) — 이 상수는 `WITH_LADDER_NO_DIVISION = { showsDivision: false }` 였다.
 *   사장님이 뒤집었다: 티어를 쓰는 쪽이 IPL 이고, 등급이 없는 쪽이 SPL 이다.
 *   되돌리려면 `showsTier: false` 로 (`CLAUDE.md` 10-4).
 */
const WITH_TIERS: LeagueScreenSpec = { ...WITH_LADDER, showsTier: true }

/**
 * `10🏔️`(`sanply`) — **킬뎃과 승률만** 보여 준다 (2026-09-01 사용자 지시).
 *
 * 비공식이라 래더가 없고, 래더가 없으니 순위도 없다.
 * 클랜 화면은 D-245 에서 이미 감췄다 — **데이터는 지우지 않았고 화면에서만 빠진다.**
 *
 * ⚠ 알(`docs/EGG_SYSTEM_SPEC.md`)이 승률·킬뎃을 덮는다. 그래서 알을 깨기 전에는
 *   이 표에 닉네임만 남는다. 그것은 알 시스템이 의도한 모습이지만, 래더·순위까지
 *   빠지면 **덮이지 않는 칸이 하나도 없다.** 사용자에게 확인이 필요한 지점이다.
 */
const NO_LADDER: LeagueScreenSpec = {
  clanRank: false,
  playerColumns: { rank: false, winRate: true, kd: true, rating: false },
  clanColumns: { rank: false, winRate: true, kd: false, rating: false },
  /* 원래 단일리그 — 티어 없음 (지시 #23) */
  showsTier: false,
  /* 비공식이라 래더가 없다 — 세 리그 중 유일하게 「비공식」 을 단다 (#17) */
  official: false,
  /* 10mountain 에는 게시판 탭이 없다 (지시 #14 · #16) */
  boardCategory: null,
  listed: true,
}

const BY_SLUG: Readonly<Record<string, LeagueScreenSpec>> = {
  /* 리그 안 게시판 = 계약 `BOARD_CATEGORIES` 의 `spl` · `ipl` (지시 #14-2).
     SPL 은 등급 개념이 없다 — `WITH_LADDER` 의 `showsTier: false` 그대로 (지시 #23) */
  supply: { ...WITH_LADDER, boardCategory: 'spl' },
  /* IPL 만 티어를 쓴다 (지시 #23). 같은 날 오전(#9)에는 반대였다 */
  nolink: { ...WITH_TIERS, boardCategory: 'ipl' },
  sanply: NO_LADDER,
  /* 2026-09-02 지시 #22 — 목록에서 뺀다. 그전에는 표에 없었다(= 기본값 · 목록에 보였다) */
  daerule: CLOSED,
}

/** 이 리그가 보여 줄 화면과 칸. 모르는 slug 는 «래더 있는 리그» 로 본다 */
export function leagueScreen(slug: string): LeagueScreenSpec {
  return BY_SLUG[slug] ?? WITH_LADDER
}

/**
 * 이 리그가 **티어를 화면에** 표시하는가 (지시 #23). IPL 만 참이다.
 * 화면 코드는 slug 를 비교하지 말고 이것만 부른다 — 규칙은 위 표 한 곳에 있다.
 */
export function showsTier(slug: string): boolean {
  return leagueScreen(slug).showsTier
}

/**
 * @deprecated 지시 #9 때 이름. 「부리그」 뜻이 배어 있어 `showsTier` 로 바꿨다 (지시 #23).
 * 옛 호출부가 남아 있어도 깨지지 않게 별칭으로 둔다 — 값은 같다.
 */
export const showsDivision = showsTier

/**
 * 이 리그에 「공식」 배지를 다는가 (지시 #17). 배지 자리는 전부 이것만 부른다 —
 * API 의 `official` 을 직접 읽지 않는다 (그건 DB 열이고, 표기는 이 표가 정한다).
 */
export function isOfficialLeague(slug: string): boolean {
  return leagueScreen(slug).official
}

/**
 * 이 리그가 **나열되는 화면**(리그 목록 · 참가 카드 · 검색 결과)에 보이는가 (지시 #22).
 * 목록을 그리는 자리는 전부 이것으로 거른다 — 데이터는 그대로, 직접 주소는 열린다.
 */
export function isLeagueListed(slug: string): boolean {
  return leagueScreen(slug).listed
}

/** 이 리그 안 게시판의 카테고리 slug. 없으면 `null` (지시 #14-2) */
export function leagueBoardCategory(slug: string): string | null {
  return leagueScreen(slug).boardCategory
}

/** 리그 안 게시판의 주소 뿌리 — 목록 `…/board`, 글 `…/board/{id}`, 글쓰기 `…/board/write` */
export function leagueBoardPath(slug: string): string {
  return `/league/${slug}/board`
}

/**
 * 리그를 누르면 갈 곳 (2026-09-01 사용자 지시 — *"리그홈 … 없애버리고 누르면 바로 랭킹"*).
 *
 * 클랜랭킹이 있으면 클랜랭킹, 없으면 개인랭킹이다.
 * **리그홈 라우트는 지우지 않았다** — 들어오는 링크가 있으면 여기로 보낼 뿐이다
 * (`CLAUDE.md` 10-4).
 */
export function leagueLandingPath(slug: string): string {
  return leagueScreen(slug).clanRank
    ? `/league/${slug}/rank/clan`
    : `/league/${slug}/rank/player`
}
