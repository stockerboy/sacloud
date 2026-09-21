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
 * **표시 이름은 2026-09-01 사용자 지시로 다시 바뀌었다** (D-246). slug 는 하나도 건드리지 않았다.
 * `supply` → **SPL** · `nolink` → **IPL** · `sanply` → **10mountain**.
 * `DPL` 은 2026-08-30 에 잠깐 쓴 이름이고 (D-204) 하루 만에 `SPL` 로 되돌아왔다.
 * 운영 DB `League.name` 도 같은 값으로 맞춘다 (`nexon league-rename`).
 * `10mountain` 옆의 산 표시는 이름에 넣지 않고 화면에서만 붙인다 — `LeagueLabel` 참고.
 * `daerule` 은 이름 변경 대상이 아니다 (D-178 준비중 그대로).
 */
/*
 * ── ⚠ 2026-09-01 (D-251) — **`대룰리그`(daerule)를 GNB 에서 뺐다**
 *
 *   사용자 지시: *"우리는 리그 세개뿐이다 SPL IPL 10🏔️"* · *"daerule 은 어디에도 넣지 마라"*.
 *
 *   그때는 이랬다 (D-178) — 준비중이어도 링크는 남겨 두고 눌리면 안내를 띄웠다
 *   ```
 *   { label: '대룰리그', href: '/league/daerule' },
 *   ```
 *   **데이터도 라우트도 그대로다.** `PREPARING_LEAGUE_SLUGS` 에 아직 들어 있고,
 *   주소를 직접 치면 여전히 「준비중」 안내가 나온다. 없앤 것은 **GNB 링크 한 줄**이다.
 *   되살리려면 위 한 줄을 배열 끝에 다시 넣으면 된다.
 */
/*
 * ── 2026-09-02 — **자리마다 순서가 다르다.** 목록은 하나, 순서는 둘 (총괄 정정)
 *
 *   ```
 *   홈(리그 버튼 · 랭킹 미리보기 · 최근 경기)   SPL · IPL · 10mountain   ← 지시 #18 "spl,ipl,열산 순서로"
 *   상단바(GNB) · 모바일 서랍                  IPL · SPL · 10mountain   ← 지시 #14 "첫번째로 IPL 두번째로 SPL"
 *   ```
 *   한 배열을 둘이 같이 쓰면 한쪽이 뒤집힌다 (f3d06c2 에서 실제로 홈이 IPL 먼저가 됐다).
 *   그래서 `FEATURED_LEAGUES` 는 **리그 목록이자 홈 순서**(D-246 그대로)로 두고,
 *   상단바는 아래 `GNB_LEAGUES` 를 쓴다. 리그를 더하거나 빼는 것은 여기 한 곳에서만 한다.
 */
/**
 * ⚠ ★2026-09-14 — 리그 이름이 바뀌었다★ (사장님이 새 로고와 함께 정하셨다).
 *
 *   ```
 *   IPL  Independent Premier League   무소속 리그      (그대로)
 *   LLM  Limitless Leagues Matches    구 서플라이      ← ★SPL 에서 바뀜★
 *   YSL                               열산 리그        ← ★10 에서 바뀜★
 *   ```
 *
 *   ★주소(slug)는 한 글자도 안 바뀐다★ — `supply` · `sanply` 그대로다.
 *   바꾸면 지금까지 나간 링크가 전부 깨진다. 바뀐 것은 ★보이는 이름★ 뿐이다.
 *   운영 DB 의 `League.name` 도 같이 바꿨다 (화면 대부분은 그 값을 쓴다).
 *
 *   옛 이름은 아래 `FEATURED_LEAGUES_V1` 에 남긴다 (`CLAUDE.md` 1-4).
 */
export const FEATURED_LEAGUES: readonly NavLink[] = [
  /*
   * ★★C1 을 맨 앞에 둔다★★ (2026-09-20 밤 사장님)
   *
   * > 「C1이라는 ★개고수 전용 기록판★ 을 만드는 것이다 (…) IPL과 다른 ★독립적인 하나의 리그★」
   *
   *   IPL 상위 열 클랜이 ★서로 붙은 경기만★ 모은 리그다. 「진짜 실력자들의
   *   실력싸움은 c1에 기록된다」 는 것이 사장님 뜻이라 ★맨 앞★ 에 둔다.
   */
  { label: 'C1', href: '/league/c1' },
  /* ⚠ 2026-09-16 — «LLM» → «PL» (사장님). 주소는 그대로 `supply` 다 */
  { label: 'PL', href: '/league/supply' },
  { label: 'IPL', href: '/league/nolink' },
  /* ⚠ 2026-09-16 — «YSL» → «열산리그» (사장님). 주소는 그대로 `sanply` 다 */
  { label: '열산리그', href: '/league/sanply' },
]

/** ⚠ 옛 이름 (2026-09-14 이전). 지우지 않는다 — 되돌릴 때 쓴다 */
export const FEATURED_LEAGUES_V1: readonly NavLink[] = [
  { label: 'SPL', href: '/league/supply' },
  { label: 'IPL', href: '/league/nolink' },
  /* ★2026-09-12 사장님: «앞으로 모든 이름을 10으로 바꿔»★ — 그 앞 표기는 '10mountain' 이었다 */
  { label: '10', href: '/league/sanply' },
]

/** 상단바의 순서 — href 로 적는다. 목록(`FEATURED_LEAGUES`)에 없는 것은 그려지지 않는다 */
/* ★2026-09-12 사장님: 상단바는 로고10 · 로고IPL · 로고SPL · 게시판 넷★ — 왼쪽부터 10 */
/**
 * ⚠ ★2026-09-12 두 번째 손질★ — 사장님: «상단바 IPL SPL 열산 이용방법 게시판 순서로 바꿔».
 *   옛 차례: 10 · IPL · SPL (같은 날 아침). 그 앞은 IPL · SPL · 10 이었다.
 */
/**
 * ⚠ ★2026-09-16 — PL 을 맨 앞으로★ (사장님: «pl을 맨앞으로 옮겨»).
 *   옛 차례: IPL · PL · 열산리그 (`/league/nolink` 이 먼저였다).
 */
/*
 * ⚠ ★2026-09-20 밤 — C1 을 맨 앞에 더했다★ (사장님).
 *
 *   `FEATURED_LEAGUES` 에만 더하고 여기를 빠뜨리면 ★상단바에서만 C1 이 사라진다.★
 *   실제로 그렇게 될 뻔했고, `preparing-league.test.ts` 의
 *   「두 목록이 같은 리그를 담는다」 단언이 그것을 잡았다.
 */
export const GNB_LEAGUE_ORDER: readonly string[] = [
  '/league/c1',
  '/league/supply',
  '/league/nolink',
  '/league/sanply',
]

/** 목록에서 주어진 순서대로 골라낸다. 순서표에 없는 리그는 빠진다 — 지어내지 않는다 */
export function orderLeagues(order: readonly string[]): readonly NavLink[] {
  return order.flatMap((href) => {
    const found = FEATURED_LEAGUES.find((league) => league.href === href)
    return found ? [found] : []
  })
}

/** 상단바 · 모바일 서랍이 쓰는 대표 리그 — **IPL · SPL · 10mountain** (지시 #14 ①) */
export const GNB_LEAGUES: readonly NavLink[] = orderLeagues(GNB_LEAGUE_ORDER)

/**
 * **서비스 준비중**인 리그 (D-178 · 2026-08-29 사용자 지시).
 *
 * 대룰리그(`daerule`)는 접는다. 랭킹·집계를 화면에 내보내지 않고 안내만 띄운다.
 *
 * - **데이터는 지우지 않는다.** DB 의 리그·클랜·경기·시즌 카드는 그대로 있다.
 *   여기서 정하는 것은 "화면에 그리는가" 하나다 (`publicScope.ts` 와 같은 성격).
 * - **GNB 링크도 그대로 둔다.** 링크를 지우면 눌렀을 때 빈 화면·404 가 되는데,
 *   사용자가 원한 것은 **안내가 나오는 것**이다.
 * - 다시 열 때는 이 배열에서 slug 하나를 빼면 된다. 화면 코드에는 slug 가 없다.
 */
export const PREPARING_LEAGUE_SLUGS: readonly string[] = ['daerule']

/** 그 리그가 준비중인가 */
export function isLeaguePreparing(leagueSlug: string): boolean {
  return PREPARING_LEAGUE_SLUGS.includes(leagueSlug)
}

/**
 * **부리그(티어)를 화면에 표시하지 않는 리그** (2026-09-02 사장님 결정 · D-265 ③ — 지시 #9)
 *
 * ⚠ 스위치는 여기가 아니라 **`@sacloud/contract` 의 `leagueScreen.ts`** 에 있다
 *   (`LeagueScreenSpec.showsTier` · `showsTier(slug)`).
 *
 *   잠깐(ee21a88) 여기 `DIVISION_HIDDEN_LEAGUE_SLUGS` 배열로 뒀었는데 옮겼다. 이유 둘 —
 *   ① `leagueScreen()` 이 이미 「리그가 무엇을 보여 주는가」를 모아 둔 **한 자리**다
 *      (클랜랭킹 유무 · 표의 칸). 부리그 표시 여부도 같은 성격이라 거기 붙는 게 맞다.
 *   ② 이 파일은 ui 배럴(`index.ts`)이 이름을 골라 내보내서 `apps/web` 이 새 이름을 보려면
 *      길목 파일을 건드려야 한다. contract 배럴은 `export *` 라 그럴 필요가 없다.
 *
 *   어디가 그 스위치를 보는지는 `leagueScreen.ts` 주석과 `docs/` 에 있다. 이 파일에는 아무 값도 없다 —
 *   두 곳에 같은 목록을 두면 조용히 갈라진다.
 */

/**
 * 모바일 서랍의 묶음 구성.
 *
 * 원본 모바일 서랍은 **제목이 붙은 묶음**으로 나뉜다 (2026-08-28 원본 관측) —
 * `홈` 묶음 아래 `Home`, `리그` 묶음 아래 리그들, `게시판` 묶음 아래 게시판들.
 * PC GNB 는 한 줄에 늘어놓지만 서랍은 이 묶음을 쓴다.
 *
 * 게시판 하위 목록은 원본에 있으나 우리 카테고리 구성이 확정되지 않아
 * 지금은 `게시판` 한 줄만 둔다 — 없는 카테고리를 지어내지 않는다 (CLAUDE.md 3장 7번).
 */
export interface NavGroup {
  label: string
  items: readonly NavLink[]
}

/*
 * ── 2026-09-02 (지시 #14 ①) — 서랍도 **리그 셋뿐**이다
 *   `리그`(/leagues) 항목과 `게시판` 묶음을 뺐다. 그때의 모습은 아래 `MOBILE_NAV_GROUPS_LEGACY` 다.
 */
/**
 * ⚠ ★2026-09-16 — 서랍이 사이트의 ★유일한 메뉴★ 가 됐다★ (사장님:
 *   «최상단바에 써클로고를 가운데에 배치하고 ★모든 카테고리를 지워★ 그리고 왼쪽에
 *    햄버거메뉴 (…) 경쟁전-pl/공식 토너먼트(준비중)  일반전-ipl/열산리그
 *    게시판-hot/자유  참가신청-경쟁전/일반전 로 만들어줘»).
 *
 *   그래서 ★PC 에서도 서랍을 쓴다★ — 상단바에 길이 하나도 없으니 폰에서만 열리면
 *   PC 사용자는 갈 곳이 사라진다.
 *
 *   ★준비중인 칸은 링크를 안 건다★ — 없는 화면으로 보내면 404 를 만난다 (D-106).
 *   옛 서랍은 아래 `MOBILE_NAV_GROUPS_V2` 에 남긴다.
 */
export const MOBILE_NAV_GROUPS: readonly NavGroup[] = [
  /*
   * ★★경쟁전 / 일반전 구분을 없앴다★★ (2026-09-20 사장님)
   *
   * > 「경쟁전 일반전 구분 다 없애 / IPL PL 열산 큰 카테고리 세개로 분류해
   * >  경쟁전 일반전 이라는 구분은 이제 없다」
   *
   *   옛 판 —
   *     경쟁전  PL · 공식 토너먼트(준비중)
   *     일반전  IPL · 열산리그
   *   ★리그 셋이 나란히 선다.★ 위아래가 없다.
   *
   * ⚠ 「공식 토너먼트(준비중)」 은 ★아직 없는 화면★ 이라 여기서 뺐다.
   *   만들면 리그 하나로 나란히 더하면 된다.
   */
  { label: 'IPL', items: [{ label: '리그 홈', href: '/league/nolink' }] },
  { label: 'PL', items: [{ label: '리그 홈', href: '/league/supply' }] },
  { label: '열산리그', items: [{ label: '리그 홈', href: '/league/sanply' }] },
  { label: '게시판', items: [
    { label: 'HOT', href: '/board/hot' },
    { label: '자유', href: '/board/free' },
  ] },
  /*
   * 참가신청은 한 화면(`/about`)이 리그를 골라 보여 준다. 어느 쪽으로 들어왔는지를
   * 물음표 뒤에 실어 그 화면이 알맞은 칸을 편다.
   */
  /* ★참가신청도 리그별로★ (2026-09-20 사장님) — 경쟁전/일반전이라는 구분은 없다 */
  { label: '참가신청', items: [
    { label: 'IPL', href: '/about?kind=casual' },
    { label: 'PL', href: '/about?kind=competitive' },
    { label: '열산리그', href: '/about?kind=casual' },
  ] },
]

/** ★2026-09-16 까지 쓰던 서랍★ — 지우지 않는다 (`CLAUDE.md` 1-4) */
export const MOBILE_NAV_GROUPS_V2: readonly NavGroup[] = [
  { label: '홈', items: [{ label: 'Home', href: '/' }] },
  { label: '리그', items: [...GNB_LEAGUES] },
]

/** 지시 #14 ① 이전의 서랍 — 지우지 않았다 (`CLAUDE.md` 10-4). 되돌리려면 위 이름을 이것으로 */
export const MOBILE_NAV_GROUPS_LEGACY: readonly NavGroup[] = [
  { label: '홈', items: [{ label: 'Home', href: '/' }] },
  { label: '리그', items: [...FEATURED_LEAGUES, { label: '리그', href: '/leagues' }] },
  { label: '게시판', items: [{ label: '게시판', href: '/board' }] },
]

/**
 * 대표 리그 뒤에 오는 고정 메뉴.
 *
 * ── 2026-09-02 (지시 #14 ①) — **비었다.** 사장님이 리그 소개/리그 만들기 페이지와
 *   전역 게시판 메뉴를 버렸다 (*"이 페이지 필요없다 버려라"* · *"게시판을 SPL 과 IPL 카테고리에 넣어버린다"*).
 *   `SiteHeader` 는 머리 항목이 없으면 대표 리그를 1차 메뉴로 바로 그린다.
 *   옛 값은 `PRIMARY_NAV_LEGACY` — 되돌리려면 그것을 여기 넣으면 드롭다운 모습 그대로 돌아온다.
 *   `/leagues` · `/board` 라우트는 살아 있다 (주소로는 열린다).
 */
export const PRIMARY_NAV: readonly NavLink[] = []

/** 지시 #14 ① 이전 — 원본 `nav-active`(굵게 + 흰 밑줄) 시절부터의 두 항목 */
export const PRIMARY_NAV_LEGACY: readonly NavLink[] = [
  { label: '리그', href: '/leagues' },
  { label: '게시판', href: '/board' },
]

/**
 * 푸터 문구.
 * 원본의 상호·연락처·저작권 표기는 그대로 가져오지 않는다(CLAUDE.md 3장 4번).
 * 레이아웃(약관 링크 2개 → 저작권 → 문의 메일)만 동일하게 재현하고 값은 우리 것으로 채운다.
 */
export const SITE_BRAND = {
  name: 'log in SA CLOUD',
  copyright: '© 2026 log in SA CLOUD',
  contactLabel: 'Terms of Service | 문의 :',
  /**
   * 문의 주소.
   *
   * ── ⚠ 2026-09-02 — **빈 문자열이다. 푸터에서 링크가 사라진다**
   *   `sacloud@local.invalid` 이 모든 화면 하단에 `mailto:` 로 걸려 있었다.
   *   `.invalid` 는 **규격상 절대 존재하지 않는 도메인**(RFC 2606)이라 누르면
   *   아무 데도 안 간다. 개인정보처리방침이 「하단에 안내된 문의 메일」을
   *   가리키고 있어서, 죽은 주소가 **문의 경로 전체**를 막고 있었다.
   *
   *   살아 있는 주소는 우리가 지어낼 수 없다 — 사용자 결정이 필요하다.
   *   **없는 주소를 보여 주는 것보다 안 보여 주는 편이 낫다.**
   *
   *   ```
   *   ''            링크를 그리지 않는다
   *   'a@b.com'     그 주소로 mailto 가 돌아온다
   *   ```
   *   화면 코드(`SiteFooter`)는 빈 값이면 그리지 않게만 고쳤다. 주소를 넣으면
   *   옛 모습 그대로 돌아온다 (`CLAUDE.md` 10-4).
   *
   * ── ✅ **2026-09-02 · 사용자가 정했다 — 본인 메일을 쓴다**
   *   *"softgw01@naver.com 쓴다"*. 살아 있는 주소이므로 푸터 링크가 돌아오고,
   *   개인정보처리방침의 「하단에 안내된 문의 메일」도 **다시 참이 된다.**
   *   방침 본문은 한 글자도 안 고쳤다 — 가리키는 곳이 생겼을 뿐이다.
   *
   *   ⚠ 나중에 운영용 주소가 생기면 **여기 한 줄만** 바꾼다. 푸터와 방침이 함께 따라온다.
   */
  contactEmail: 'softgw01@naver.com',
} as const

/**
 * ★슬러그 → 화면에 쓰는 리그 이름★ (2026-09-14).
 *
 * ⚠ ★이름이 네 곳에 흩어져 있었다★ — 상단바·관리자 신청목록·신청서·통합랭킹.
 *   2026-09-14 에 «SPL → LLM» 으로 바뀔 때 ★세 곳이 옛 이름 그대로 남아 있었다.★
 *   이제 여기 한 곳만 고치면 된다.
 *
 * ⚠ 화면 대부분은 서버가 주는 `League.name` 을 쓴다 — 이 표는 ★서버 값이 없는 자리★
 *   (상단바·신청서처럼 리그를 아직 안 불러온 화면)를 위한 것이다. 두 값이 어긋나지 않게
 *   운영 DB 의 `League.name` 도 같은 이름으로 맞춰 두었다.
 */
export const LEAGUE_NAME: Readonly<Record<string, string>> = {
  nolink: 'IPL',
  /* ⚠ ★2026-09-16 — 이름이 또 바뀌었다★ (사장님: «LLM을 PL로» · «YSL을 열산리그로»).
     옛 이름은 `LEAGUE_NAME_V2` 에 남긴다. 주소는 한 글자도 안 바뀐다 */
  supply: 'PL',
  sanply: '열산리그',
}

/** 그 리그의 이름. 모르는 슬러그면 슬러그를 그대로 돌려준다 — 지어내지 않는다 */
/** ★2026-09-16 까지 쓰던 이름★ — 지우지 않는다 (`CLAUDE.md` 1-4) */
export const LEAGUE_NAME_V2: Readonly<Record<string, string>> = {
  nolink: 'IPL',
  supply: 'LLM',
  sanply: 'YSL',
}

export function leagueNameOf(slug: string): string {
  return LEAGUE_NAME[slug] ?? slug
}
