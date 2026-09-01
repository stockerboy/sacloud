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
export const FEATURED_LEAGUES: readonly NavLink[] = [
  { label: 'SPL', href: '/league/supply' },
  { label: 'IPL', href: '/league/nolink' },
  { label: '10mountain', href: '/league/sanply' },
]

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

export const MOBILE_NAV_GROUPS: readonly NavGroup[] = [
  { label: '홈', items: [{ label: 'Home', href: '/' }] },
  { label: '리그', items: [...FEATURED_LEAGUES, { label: '리그', href: '/leagues' }] },
  { label: '게시판', items: [{ label: '게시판', href: '/board' }] },
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
  name: '3rd cloud',
  copyright: '© 2026 3rd cloud',
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
   *   ''            링크를 그리지 않는다        ← 지금
   *   'a@b.com'     그 주소로 mailto 가 돌아온다 ← 주소가 정해지면 여기 한 줄
   *   ```
   *   화면 코드(`SiteFooter`)는 빈 값이면 그리지 않게만 고쳤다. 주소를 넣으면
   *   옛 모습 그대로 돌아온다 (`CLAUDE.md` 10-4).
   */
  contactEmail: '',
} as const
