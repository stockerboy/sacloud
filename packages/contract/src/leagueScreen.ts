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
  /**
   * ★고용 가능 클랜 화면이 있는가★ (2026-09-20 사장님:
   *   「지금 열산클랜으로 등록 돼있는 클랜목록 열산리그에 세번째파트로
   *    고용가능클랜 으로 넣어」).
   *
   * 10산은 ★클랜 기록을 안 재는 리그★ 라 클랜랭킹이 없다. 대신 그 자리에
   * 「고용 가능 클랜으로 진행하는 리그입니다」 라는 공지만 떠 있었는데,
   * ★정작 그 클랜이 어디 있는지 볼 자리가 없었다.★ 이 칸이 그 자리를 연다.
   *
   * ⚠ ★순위가 아니다★ — 가나다순으로 늘어놓기만 한다. 이 리그는 클랜 기록을
   *   안 재므로 줄을 세울 근거가 없다.
   */
  hireClans: boolean
  /**
   * ★클랜랭킹 대신 띄울 공지★ (2026-09-12 사장님).
   *
   * > «SPL은 클랜 랭킹이 없다. 승격유력도 없다 그래서 이것을 공지하라»
   *
   * `clanRank: false` 는 탭 자체를 없애 버려서 ★왜 없는지를 말할 자리가 사라진다.★
   * 그래서 탭은 두고 표 자리에 이 글을 대신 그린다. `null` 이면 여느 때처럼 표를 그린다.
   */
  clanRankNotice: string | null
  /**
   * ★개인랭킹 대신 띄울 공지★ (2026-09-21 · CPL)
   *
   * > 「개인랭킹은 ★10/1부터 생성★ 되고 클랜랭킹에는 ★참가 클랜 목록★ 보여달라니까」
   *
   * `clanRankNotice` 와 같은 장치다 — ★탭은 그대로 두고★ 표 자리에 이 글을 그린다.
   * 탭을 없애면 ★왜 없는지를 말할 자리가 사라진다.★
   */
  playerRankNotice: string | null
  /** 개인 순위가 ★실력 점수★ 인 리그 (2026-09-10 사장님 확정 · SPL·IPL). 표에 점수가 한 줄도 없어도 «측정 중» 이지 래더가 아니다 */
  scoreLeague: boolean
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
  /**
   * ★홈 첫 칸에 무엇을 둘 것인가★ (2026-09-16 사장님).
   *
   * > «최근경기 페이지에서 기존꺼 지우고 최근 폼1위 파트를 만들어서 (…)»
   * > «IPL LLM 두개만 열산은 또 따로 다르게할거야»
   *
   *   `'form'`  최근 폼 1위 — 육각 하나 + 줄 셋(스나·클랜·라플), 눌러서 바뀐다
   *   `'flag'`  오늘의 깃발 — 17:00~03:00 1·2·3등 (옛 모습)
   *   `'none'`  아무것도 안 둔다
   *
   * 열산리그는 사장님이 «또 따로 다르게 할거야» 라고 하셨으므로 ★건드리지 않고★
   * 깃발을 그대로 둔다. 정해지면 이 한 줄만 바꾼다.
   */
  homeHero: 'form' | 'flag' | 'none'
}

/**
 * 공식 래더가 있는 리그의 기본값.
 *
 * ⚠ ★2026-09-15 밤 — 래더 칸(「층」)과 클랜 순위 번호를 껐다★ (사장님:
 *   «티어의 흔적들이 아직도 많이 남아있어 (…) 같은 폼인데 글씨 다른것들
 *    통일성있게 좀 맞춰주고»).
 *
 *   2026-09-14 에 IPL 만 끄는 바람에 SPL·열산에는 «33.1층» «31.1층» 이 그대로
 *   남아 있었다. 「34층」 은 누가 봐도 등급이라 사장님이 ★티어의 흔적★ 이라 부르셨다.
 *   이제 ★세 리그가 같은 표★ 를 쓴다.
 *
 *   ★계산은 한 글자도 안 바꿨다★ — 래더는 그대로 매기고 클랜랭킹 순서도
 *   그대로 래더 내림차순이다 (`apps/web/lib/clanRanking.ts`). 화면에서 칸만 뺀다.
 *
 *   옛 값 (2026-09-15 까지):
 *     playerColumns: { rank: true, winRate: true, kd: true, rating: ★true★ }
 *     clanColumns:   { rank: ★true★, winRate: true, kd: false, rating: ★true★ }
 *   되돌리려면 위 두 줄로 되돌리면 된다 (`CLAUDE.md` 1-4).
 *
 * ⚠ ★2026-09-16 — 클랜 순위 번호를 도로 켰다★ (사장님: «IPL 킬뎃이랑 랭킹 전부 살려
 *   티어만 없애»). 전날 «통일» 을 이유로 번호를 세 리그에서 다 껐는데, 사장님이
 *   ★랭킹은 살리라★ 고 하셨다. ★층(`rating`)만 끈 채 둔다★ — 전날 사장님이
 *   «33.1층» 을 가리켜 «티어의 흔적» 이라 부르셨고, 오늘의 «티어만 없애» 에
 *   그 층이 들어간다고 읽었다. 틀렸다면 `rating: true` 한 줄이면 돌아온다.
 */
const WITH_LADDER: LeagueScreenSpec = {
  clanRank: true,
  hireClans: false,
  clanRankNotice: null,
  playerRankNotice: null,
  scoreLeague: true,
  /*
   * ⚠ ★2026-09-21 — 래더 칸을 도로 켰다★ (사장님이 3rd.supply 3부를 학습하라 하심)
   *
   *   9/15 에 끈 이유는 ★「34층」 이 등급처럼 보여서★ 였다 (「티어의 흔적」).
   *   ★숫자가 문제가 아니라 「층」 이라는 말이 문제였다.★
   *   3부 원본은 같은 값을 ★「3,697점」★ 으로 적는다 — 등급으로 안 읽힌다.
   *
   *   지금은 ★이 값이 줄을 세운다.★ 안 보여 주면 사장님이 화면을 보고
   *   「왜 이 순서냐」 를 알 수 없다 — 실제로 그렇게 물으셨다.
   *   그래서 ★말만 「점」 으로 바꾸고 칸을 켠다.★
   */
  playerColumns: { rank: true, winRate: true, kd: true, rating: true },
  /* 클랜랭킹에는 킬뎃 칸이 원래 없다 */
  clanColumns: { rank: true, winRate: true, kd: false, rating: true },
  /* 티어는 IPL 만 쓴다 (지시 #23). 모르는 리그는 등급 개념 없이 그린다 */
  showsTier: false,
  official: true,
  /* 모르는 리그에는 게시판이 없다 — 카테고리 행을 지어내지 않는다 */
  boardCategory: null,
  listed: true,
  /*
   * ⚠ ★깃발은 껐다★ (2026-09-20 사장님: 「깃발시스템 전부 지워 필요없어이제」).
   *   옛값은 `'flag'` 였다 — ★코드도 화면도 지우지 않았다★ (CLAUDE.md 1-4).
   *   `FlagMountain` · `flagPlant` 잡 · 깃발 API 는 그대로 있고,
   *   ★이 한 글자만 `'flag'` 로 되돌리면 그날로 다시 나온다.★
   */
  homeHero: 'none',
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
/**
 * ⚠ ★2026-09-14 — 아무도 안 쓴다★ (사장님: «IPL 티어 전부 없애고»).
 *   지우지 않고 내보낸다 (`CLAUDE.md` 1-4). 티어를 다시 화면에 쓰려면
 *   그 리그 줄을 `{ ...WITH_TIERS, … }` 로 되돌리면 된다.
 */
export const WITH_TIERS: LeagueScreenSpec = { ...WITH_LADDER, showsTier: true }

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
/**
 * ⚠ ★2026-09-13 — 열산도 다른 리그와 똑같이 그린다★ (사장님: «열산도 그냥 랭킹 제대로
 *   만들어주고 (…) 세 리그 전부 공평하게 대한다»).
 *
 *   아래 `NO_LADDER` 는 ★지우지 않는다★ (`CLAUDE.md` 1-4). 되돌리려면 표에서
 *   `sanply: NO_LADDER` 로 되돌리면 된다. 지금은 안 쓰인다.
 *
 *   `official: false` 만 남긴다 — 그건 화면을 깎는 값이 아니라 ★사실 표기★ 다
 *   (「비공식」 딱지 한 줄). 순위·점수·육각형은 이제 다 준다.
 */
export const NO_LADDER: LeagueScreenSpec = {
  clanRank: false,
  hireClans: false,
  clanRankNotice: null,
  playerRankNotice: null,
  scoreLeague: false,
  playerColumns: { rank: false, winRate: true, kd: true, rating: false },
  clanColumns: { rank: false, winRate: true, kd: false, rating: false },
  /* 원래 단일리그 — 티어 없음 (지시 #23) */
  showsTier: false,
  /* 비공식이라 래더가 없다 — 세 리그 중 유일하게 「비공식」 을 단다 (#17) */
  official: false,
  /* 10mountain 에는 게시판 탭이 없다 (지시 #14 · #16) */
  boardCategory: null,
  listed: true,
  /* ⚠ ★깃발은 껐다★ (2026-09-20 사장님). 옛값 `'flag'` — 되돌리려면 이 한 글자 */
  homeHero: 'none',
}

const BY_SLUG: Readonly<Record<string, LeagueScreenSpec>> = {
  /* 리그 안 게시판 = 계약 `BOARD_CATEGORIES` 의 `spl` · `ipl` (지시 #14-2).
     SPL 은 등급 개념이 없다 — `WITH_LADDER` 의 `showsTier: false` 그대로 (지시 #23) */
  /* ★2026-09-12 사장님: 리그 안 게시판을 없앤다★ — «IPL페이지에 있는 게시판이랑 SPL 페이지 안에있는 게시판 둘다 없애고
     게시판 카텍을 따로 만들어». 글은 그대로 있고 /board 로만 들어간다. 옛 값은 'spl' 이었다 */
  /**
   * ★SPL 은 클랜랭킹을 안 한다★ (2026-09-12 사장님).
   * 탭은 남기고 표 자리에 까닭을 적는다 — 없애 버리면 왜 없는지를 말할 데가 없다.
   */
  /**
   * ⚠ ★2026-09-13 — SPL 클랜랭킹을 되살렸다★ (사장님: «SPL 클랭랭킹도 걍 다시 복구해»).
   *   옛 값 (2026-09-12 하루) —
   *     clanRankNotice: 'SPL은 클랜랭킹 서비스가 제공되지 않습니다 (사유: 소속감 없음, 퀵 없음, 열빡 위주 게임)'
   *   그 문구를 지운다. 티어는 원래대로 안 쓴다 (`WITH_LADDER` 의 `showsTier: false`) —
   *   사장님: «SPL은 1티어 2티어 구분 없어».
   */
  /**
   * ★SPL — 전부 100% 제공★ (2026-09-14 사장님).
   *   «CPL- 모든 기록 100퍼센트 제공 /승률, 킬데스 전부 기록 및 랭킹제도(래더시스템 적용)»
   *   (사장님이 CPL 이라 적으셨다가 «Cpl은 Spl 이다 잘못말했다» 로 바로잡으심)
   *   승률 · 킬데스 · 랭킹 전부 있다. 티어만 안 쓴다.
   */
  /* ⚠ 2026-09-16 — 홈 첫 칸이 「최근 폼 1위」 다 (사장님: «IPL LLM 두개만») */
  supply: { ...WITH_LADDER, boardCategory: null, homeHero: 'form' },
  /**
   * ★IPL — 승률만 보여 준다★ (2026-09-14 사장님).
   *
   *   «IPL - 개인 , 클랜 승률만 기록, 개인 킬데스 정보 제공x
   *    (래더시스템 미제공 , 경기분석 및 플레이 분석 , 승률 정보 제공)»
   *
   * ── ⚠ ★킬데스는 「숨기는 것」 이지 「안 쓰는 것」 이 아니다★
   *   사장님: «킬데스를 써라 킬데스는 숨기는거 뿐이다 우리가 몰래 랭킹계산할때
   *   써야하는 자료이다». 수집·저장·점수 계산은 ★한 글자도 안 바뀐다.★
   *   바뀌는 것은 `playerColumns.kd` 하나 — ★화면에 칸을 안 만든다.★
   *
   * ── ⚠ ★티어는 화면에서만 사라진다★
   *   사장님: «IPL 티어 전부 없애고 그냥 순위는 없는데 사실은 클랜명단이 우리가 만든
   *   점수시스템으로 만든 클랜 순위인 시스템». `showsTier: false` 로 글자를 없애되
   *   `division` 값과 점수 계산은 그대로다 — 승강·뱃지 보정이 그 값을 쓴다.
   *   옛 값은 `WITH_TIERS`(showsTier: true) 였다 (지시 #23 · 2026-09-02).
   *
   * ── 클랜랭킹은 남는다
   *   «순위는 없는데» 는 ★번호를 안 붙인다★ 는 뜻이고 목록 자체는 점수순으로 선다.
   *   그 «번호 없음» 은 화면(`ClanRankTable`)이 `clanColumns.rank` 로 정한다.
   */
  /*
   * ⚠ ★2026-09-16 — IPL 만 깎던 두 줄을 걷어냈다★ (사장님: «IPL 킬뎃이랑 랭킹 전부 살려
   *   티어만 없애»).
   *
   *   2026-09-14 에 «IPL - 개인 , 클랜 승률만 기록, 개인 킬데스 정보 제공x» 라고
   *   하셔서 ★IPL 만★ 킬뎃 칸과 클랜 순위 번호를 껐었다. 오늘 그걸 되돌리신다.
   *   이제 IPL 은 `WITH_LADDER` 그대로다 — ★세 리그가 같은 표★ 를 쓴다.
   *   남는 IPL 만의 차이는 ★티어를 안 쓴다★ 하나인데, 그건 이미 기본값이라
   *   아래 `showsTier: false` 는 ★뜻을 또렷이 적어 두려고★ 남긴다.
   *
   *   옛 값 (2026-09-14 ~ 09-16):
   *     playerColumns: { rank: true, winRate: true, kd: ★false★, rating: false }
   *     clanColumns:   { rank: ★false★, winRate: true, kd: false, rating: false }
   */
  nolink: {
    ...WITH_LADDER,
    boardCategory: null,
    showsTier: false,
    /* ⚠ 2026-09-16 — 홈 첫 칸이 「최근 폼 1위」 다 (사장님: «IPL LLM 두개만») */
    homeHero: 'form',
  },
  /**
   * ★열산(10🏔) — 클랜 기록은 안 준다★ (2026-09-14 사장님).
   *
   *   «열산은 클랜 기록 미제공 , 고용가능 클랜으로 진행한 개인킬데스,
   *    개인 플레이스타일 , 경기분석 , 개인승률 제공»
   *
   * ⚠ ★하루 만에 뒤집혔다.★ 2026-09-13 «세 리그 전부 공평하게 대한다» 로 클랜랭킹을
   *   열었는데, 다음 날 «열산은 클랜 기록 미제공» 으로 도로 닫는다.
   *   개인 쪽은 ★그대로 다 준다★ — 킬데스 · 플레이스타일(육각) · 경기분석 · 승률.
   *   그래서 `NO_LADDER`(개인 칸까지 빠진 옛 표)가 아니라 ★클랜만 닫은 표★ 다.
   */
  sanply: {
    ...WITH_LADDER,
    official: false,
    boardCategory: null,
    clanRank: false,
    /* ★세 번째 탭 — 고용 가능 클랜★ (2026-09-20 사장님). 이 리그에만 있다 */
    hireClans: true,
    clanRankNotice:
      '10산은 클랜 기록을 제공하지 않습니다 — 고용 가능 클랜으로 진행하는 리그입니다. 개인 기록·플레이 분석·경기 분석은 그대로 제공됩니다.',
  },
  /**
   * ★★CPL — 모집중★★ (2026-09-21 사장님)
   *
   * > 「단추 추가하고 ★개인랭킹 클랜랭킹 이런거 똑같이 만들고★ 개인랭킹은
   * >  ★10/1부터 생성★ 되고 클랜랭킹에는 ★참가 클랜 목록★ 보여달라니까」
   *
   * ── 다른 리그와 ★같은 탭★ 을 쓴다
   *   탭을 없애면 ★왜 비었는지 말할 자리가 사라진다.★ 그래서 탭은 그대로 두고
   *   표 자리에만 글을 대신 그린다 — 열산리그가 이미 쓰는 장치다.
   *
   *   ```
   *   개인랭킹   「10월 1일부터 기록이 쌓입니다」        ← playerRankNotice
   *   클랜랭킹   참가 클랜 24곳을 번호 없이 늘어놓는다   ← clanRankNotice
   *   ```
   *
   * ⚠ ★점수를 매기지 않는다★ — 기록이 한 줄도 없다. 칸을 전부 끈다.
   */
  cpl: {
    ...WITH_LADDER,
    boardCategory: null,
    showsTier: false,
    scoreLeague: false,
    playerColumns: { rank: false, winRate: false, kd: false, rating: false },
    clanColumns: { rank: false, winRate: false, kd: false, rating: false },
    playerRankNotice:
      'CPL 개인랭킹은 2026년 10월 1일부터 쌓입니다. 첫 시즌 cloud1 은 배치시즌이며, 한 달 동안의 성적으로 C1·C2 가 나뉩니다.',
    clanRankNotice:
      'CPL 은 2026년 10월 1일에 출발합니다. 지금은 참가 클랜을 모으는 중이며, 아래가 지금까지 참가를 확정한 클랜입니다.',
  },
  /*
   * ★★C1 — 목록에서 뺀다★★ (2026-09-21 사장님: 「c1리그 화면에서 없애버리고
   *   전부 다 지워 ★사이트에서 흔적도 없이 지워★」 · 「★여기 아직 남아있다 c1★」)
   *
   *   상단바·홈에서는 내렸는데 ★선수 카드의 「참여중인 리그」 에는 그대로 남아 있었다★ —
   *   그 자리는 `isLeagueListed()` 로 거르는데 C1 이 이 표에 없어 ★기본값(보임)★ 이었다.
   *
   * ⚠ ★데이터는 한 줄도 안 지웠다★ — 리그도 경기 809건도 그대로 있다.
   *   이 줄을 빼면 그대로 돌아온다 (`CLAUDE.md` 1-4).
   */
  c1: CLOSED,
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

/**
 * ★보여 줄 때의 구간 묶음★ (2026-09-13 사장님: «Astra 는 따로 둬 챌린저1,2구분만 없애는거야»).
 *
 * ASTRA(1)는 따로, CHALLENGER(2·3)는 ★하나로★ 본다.
 * 경계선을 어디에 그을지 · 어디까지 한 덩어리로 줄 세울지를 이 함수 ★한 곳★ 이 정한다 —
 * 화면과 서버가 각자 적으면 반드시 어긋난다 (`TIER_FIRST_SORT` 가 실제로 그랬다).
 *
 * ⚠ `division` 값 자체는 안 건드린다. 승강·구간 승률은 여전히 2와 3을 구분한다.
 */
export function tierGroupOf(division: number): number {
  return division <= 1 ? 1 : 2
}
