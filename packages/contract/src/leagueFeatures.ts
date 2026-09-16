/**
 * ★리그가 무엇을 주는가★ — 첫 화면에서 리그를 고를 때 보는 표 (2026-09-16 사장님).
 *
 * > «메인화면에 최근경기 없애고 pl ipl 열산리그 세개로 카텍 나눠서 클릭하면
 * >  모든기능(경기분석 킬뎃그래프, 기록카드 플레이어분석 클랜분석등등) 깔아놓고
 * >  리그별로 제공하는 기능별 예시 전부 보여주고 ★제공되지 않는 기능은 미제공★ 이라고
 * >  해줘 그리고 마지막에 리그참가신청버튼을 줘 각 리그별로»
 *
 * ── 왜 계약에 두나
 *   화면마다 «이 리그는 이걸 준다» 를 적으면 리그가 바뀔 때 몇 군데를 빠뜨린다.
 *   `leagueScreen` 이 이미 «칸을 그리는가» 를 정하듯, 여기는 «기능을 주는가» 를 정한다.
 *   첫 화면이 이 표 하나만 읽는다.
 *
 * ── ★지어내지 않는다★
 *   여기 적힌 «제공» 은 그 리그에서 ★실제로 볼 수 있는★ 화면이라야 한다.
 *   `href` 는 그 기능을 바로 볼 수 있는 자리로 — 없으면 `null` 이고 화면이 링크를 안 건다.
 *
 * ── 왜 «래더» 가 리그마다 다른가
 *   2026-09-14 사장님: «IPL — (래더시스템 미제공, 경기분석 및 플레이 분석, 승률 정보 제공)».
 *   점수 계산은 세 리그 모두 돌지만 ★IPL 은 그걸 화면에 주지 않는다★.
 *
 * ── 왜 열산리그만 클랜이 비는가
 *   2026-09-14 사장님: «열산은 클랜 기록 미제공, 고용가능 클랜으로 진행한 개인킬데스,
 *   개인 플레이스타일, 경기분석, 개인승률 제공».
 */

/** 기능 한 줄 */
export interface LeagueFeature {
  key: string
  /** 화면에 적는 이름 */
  label: string
  /** 한 줄 설명 — «그래서 이게 뭔데» 에 답한다 */
  note: string
}

/** 첫 화면이 보여 주는 기능 차례 — 위에서부터 «가장 먼저 보고 싶은 것» 이다 */
export const LEAGUE_FEATURES: readonly LeagueFeature[] = [
  { key: 'match', label: '경기 분석', note: '라운드 점수 · 스코어보드 · MVP 를 판마다 펼쳐 봅니다' },
  { key: 'kdGraph', label: '킬뎃 그래프', note: '날마다의 승률·킬뎃이 선으로 이어집니다' },
  { key: 'recordCard', label: '기록 카드', note: '선수·클랜의 승률 · 킬뎃 · 순위를 한 장으로' },
  { key: 'playerHex', label: '플레이어 분석', note: '여섯 축 육각형으로 무엇이 강하고 약한지' },
  { key: 'clanHex', label: '클랜 분석', note: '클랜의 여섯 축 육각형 · 클랜별 전적' },
  { key: 'playerRank', label: '개인 랭킹', note: '리그 안 모든 선수를 줄 세웁니다' },
  { key: 'clanRank', label: '클랜 랭킹', note: '리그 안 모든 클랜을 줄 세웁니다' },
  { key: 'ladder', label: '래더 점수', note: '센 상대를 이길수록 크게 오르는 점수' },
] as const

export type LeagueFeatureKey = (typeof LEAGUE_FEATURES)[number]['key']

/** 그 리그에서 그 기능을 주는가 — 주면 볼 수 있는 자리(`href`)까지 */
export interface LeagueFeatureState {
  given: boolean
  /** 바로 볼 수 있는 자리. 없으면 링크를 안 건다 */
  href: string | null
  /** «미제공» 인 까닭 — 있으면 화면이 작게 덧붙인다 */
  why?: string
  /**
   * ★그날부터 끊긴다★ — 지금은 주지만 곧 안 준다 (2026-09-16 사장님).
   * 값이 있으면 화면이 ★빨갛게★ «(날짜)부터 (리그)에는 제공되지 않는 기능입니다» 를 적는다.
   * `given` 은 ★그대로 `true`★ 다 — 오늘 눌러 보면 실제로 있기 때문이다.
   */
  endsOn?: string
}

/**
 * ★IPL 이 기능을 거두는 날★ — 새 시즌(Cloud 1)이 열리는 날이다.
 * 날짜를 화면에 손으로 적지 않는다. 바뀌면 여기 한 곳만 고친다.
 */
export const IPL_FEATURE_END = '10/1'

const all = (slug: string): Record<string, LeagueFeatureState> => ({
  match: { given: true, href: `/league/${slug}/home` },
  kdGraph: { given: true, href: `/league/${slug}/rank/player` },
  recordCard: { given: true, href: `/league/${slug}/rank/player` },
  playerHex: { given: true, href: `/league/${slug}/rank/player` },
  clanHex: { given: true, href: `/league/${slug}/rank/clan` },
  playerRank: { given: true, href: `/league/${slug}/rank/player` },
  clanRank: { given: true, href: `/league/${slug}/rank/clan` },
  ladder: { given: true, href: `/league/${slug}/rank/clan` },
})

/**
 * 리그별 기능 표.
 *
 * ⚠ 여기 값과 `leagueScreen` 은 ★같은 말을 해야 한다★ —
 *   `clanRank` 는 `leagueScreen(slug).clanRank`, `ladder` 는 «층을 화면에 주는가» 다.
 */
export const LEAGUE_FEATURE_MAP: Readonly<Record<string, Record<string, LeagueFeatureState>>> = {
  /* PL — 전부 준다 */
  supply: all('supply'),
  /* IPL — 래더만 안 준다 (2026-09-14 사장님 «래더시스템 미제공») */
  nolink: {
    ...all('nolink'),
    ladder: { given: false, href: null, why: '순위는 우리 점수로 세우되 점수 자체는 안 보여 줍니다' },
    /*
     * ★10/1 부터 거둔다★ (2026-09-16 사장님: «IPL 개인랭킹이랑 클랜랭킹 지금
     *   있긴하잖아 킬뎃도 다 있고 > 근데 이거 10/1일이후 미제공이라고 써놔»).
     *   ★오늘은 실제로 있다★ — 그래서 `given` 을 내리지 않고 링크도 그대로 건다.
     */
    kdGraph: { ...all('nolink').kdGraph, endsOn: IPL_FEATURE_END } as LeagueFeatureState,
    /* 클랜 화면의 ★클랜별 전적★ 도 여기 딸려 있다 (2026-09-16 사장님이 화면에 X 를 치심) */
    clanHex: { ...all('nolink').clanHex, endsOn: IPL_FEATURE_END } as LeagueFeatureState,
    playerRank: { ...all('nolink').playerRank, endsOn: IPL_FEATURE_END } as LeagueFeatureState,
    clanRank: { ...all('nolink').clanRank, endsOn: IPL_FEATURE_END } as LeagueFeatureState,
  },
  /* 열산리그 — 클랜 기록을 안 준다 (2026-09-14 사장님 «열산은 클랜 기록 미제공») */
  sanply: {
    ...all('sanply'),
    clanHex: { given: false, href: null, why: '클랜 기록을 제공하지 않습니다' },
    clanRank: { given: false, href: null, why: '클랜 기록을 제공하지 않습니다' },
    ladder: { given: false, href: null, why: '비공식 리그라 래더가 없습니다' },
  },
}

/** 그 리그의 그 기능 상태. 모르는 리그·기능이면 «안 준다» 로 떨어진다 — 지어내지 않는다 */
export function leagueFeature(slug: string, key: string): LeagueFeatureState {
  return LEAGUE_FEATURE_MAP[slug]?.[key] ?? { given: false, href: null }
}

/** 그 리그에서 ★곧 끊기는★ 기능 수 — 0 이면 화면이 경고를 안 그린다 */
export function leagueFeatureEndingCount(slug: string): number {
  return LEAGUE_FEATURES.filter((f) => leagueFeature(slug, f.key).endsOn !== undefined).length
}

/** 그 리그가 주는 기능 수 — 카드에 «8가지 중 6가지» 로 적는다 */
export function leagueFeatureCount(slug: string): number {
  return LEAGUE_FEATURES.filter((f) => leagueFeature(slug, f.key).given).length
}
