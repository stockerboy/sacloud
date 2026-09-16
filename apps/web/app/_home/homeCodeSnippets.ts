import { TRAIT_AXIS_KEYS, WEAPON, endpoints } from '@sacloud/contract'
import { ENDPOINT, MATCH_MODES } from '@sacloud/nexon'
import { FEATURED_LEAGUES, NAME_MEANING } from '@sacloud/ui'

/**
 * ★★홈 히어로 배경에 깔리는 「코드 조각」★★ (2026-09-17 · 사장님 시안)
 *
 * > «안에 있는 코드들만 우리 사이트랑 관련있는 글자들
 * >  EX CLOUD의 약자들 / match detail / 200 / 400 / ouid 이런걸로 채우면될거같고»
 *
 * ── ★한 글자도 지어내지 않는다★ (`CLAUDE.md` 2-1)
 *   배경이라 아무도 안 읽을 것 같지만, 폰을 들이대고 확대하는 사람이 반드시 있다.
 *   거기 없는 API 이름이 적혀 있으면 그게 곧 거짓말이다. 그래서 ★전부 import 해서 쓴다.★
 *
 *   ```
 *   엔드포인트 경로   `endpoints` 레지스트리          packages/contract/src/endpoints.ts
 *   넥슨 경로·모드    `ENDPOINT` · `MATCH_MODES`      packages/nexon/src/endpoints.ts
 *   육각 축 여섯      `TRAIT_AXIS_KEYS`               packages/contract/src/traits.ts
 *   무기 코드 0·1     `WEAPON`                        packages/contract/src/codes.ts
 *   리그 이름·slug    `FEATURED_LEAGUES`              packages/ui/src/site-config.ts
 *   CLOUD 의 뜻       `NAME_MEANING`                  packages/ui/src/home/SiteIntro.tsx
 *   ```
 *   ★여기에 경로를 손으로 다시 적지 않는다.★ 레지스트리가 바뀌면 배경도 같이 바뀐다.
 *
 * ── 왜 서버에서 만드나
 *   홈은 `force-static` 이라 이 글자들은 ★빌드 때 한 번★ 굳는다. 무작위를 쓰지 않는다 —
 *   서버와 브라우저가 다른 글자를 그리면 hydration 이 깨진다.
 *
 * ── 읽으라고 있는 게 아니다
 *   `aria-hidden` · `pointer-events:none` · 투명도 0.10~0.18 (지시서 값).
 *   ★폰에서는 덩어리 수를 줄인다★ — 아래 `mobile` 표시가 붙은 것만 폰에서 그린다.
 */

/** 글자 한 조각의 결. 색은 `HomeCodeBackdrop` 이 정한다 — 여기서 색값을 적지 않는다 */
export type CodeTone =
  /** 주석 (`// …`) */
  | 'cmt'
  /** 예약어 (`const` · `await` · `if`) */
  | 'key'
  /** 함수·식별자 */
  | 'fn'
  /** 문자열 */
  | 'str'
  /** 숫자 · 상태코드 */
  | 'num'
  /** 그 밖 (괄호 · 기호) */
  | 'dim'

export interface CodeSpan {
  t: string
  c: CodeTone
}

/** 한 줄 = 조각 여럿 */
export type CodeLine = readonly CodeSpan[]

export interface CodeBlock {
  /** 겹침을 피하려고 자리를 직접 준다 (`%`) */
  at: { top: string; left?: string; right?: string }
  /** ★폰에서도 그리는가★ — 글자 수를 줄여 성능을 지킨다 */
  mobile: boolean
  lines: readonly CodeLine[]
}

/* ── 조각 만들기 도우미 — 같은 모양을 열 번 적지 않는다 ───────────── */
const c = (t: string): CodeSpan => ({ t, c: 'cmt' })
const k = (t: string): CodeSpan => ({ t, c: 'key' })
const f = (t: string): CodeSpan => ({ t, c: 'fn' })
const s = (t: string): CodeSpan => ({ t, c: 'str' })
const n = (t: string): CodeSpan => ({ t, c: 'num' })
const d = (t: string): CodeSpan => ({ t, c: 'dim' })

/** `matchShow` → `/leagues/:leagueId/matches/:matchId` — ★레지스트리에서 읽어 온다★ */
const pathOf = (key: keyof typeof endpoints): string => endpoints[key].path
const methodOf = (key: keyof typeof endpoints): string => endpoints[key].method

/** `CLOUD — Connected League Operations & User Data` → `['Connected', 'League', …]` */
const CLOUD_WORDS: readonly string[] = (NAME_MEANING.split('—')[1] ?? '')
  .split(/[\s&]+/)
  .filter((word) => word.length > 0)

/** 열려 있는 리그의 slug — `/league/supply` 에서 뽑는다. 여기 적지 않는다 */
const LEAGUE_SLUGS: readonly string[] = FEATURED_LEAGUES.map(
  (league) => league.href.split('/')[2] ?? '',
).filter((slug) => slug.length > 0)

/**
 * ★배경 덩어리★ — 시안의 자리를 그대로 옮겼다.
 *
 * ```
 *   왼쪽 위    initialize modules      ← 시안 `[OK] player_data.sav`
 *   가운데     getPlayer               ← 시안 `const getPlayer = async (id) => {`
 *   오른쪽 위  if (user) { … }
 *   가운데 밑  match                   ← 사장님이 콕 집으신 「match detail」
 *   오른쪽 밑  SA CLOUD 상태           ← 사장님이 콕 집으신 「CLOUD 의 약자」
 * ```
 */
export const HOME_CODE_BLOCKS: readonly CodeBlock[] = [
  /* ── 왼쪽 위 — 부팅 로그 ─────────────────────────────── */
  {
    at: { top: '2%', left: '0%' },
    mobile: true,
    lines: [
      [c('// initialize modules')],
      [n('[OK]'), d('  '), f('contract/endpoints'), d('  '), n(String(Object.keys(endpoints).length))],
      [n('[OK]'), d('  '), f('nexon'), d(' '), s(ENDPOINT.matchDetail)],
      [n('[OK]'), d('  '), f('sync_complete')],
    ],
  },

  /* ── 가운데 위 — 선수 조회 ───────────────────────────── */
  {
    /* ★시즌 한 줄과 겹치지 않게 아래로 내렸다★ (2026-09-17 실측 · 1280px 에서 확인) */
    at: { top: '15%', left: '50%' },
    mobile: false,
    lines: [
      [k('const'), d(' '), f('getPlayer'), d(' = '), k('async'), d(' (id) => {')],
      [d('  '), k('try'), d(' {')],
      [
        d('    '),
        k('const'),
        d(' res = '),
        k('await'),
        d(' '),
        f('apiGet'),
        d('('),
        s(`'${pathOf('playerShow')}'`),
        d(')'),
      ],
      [d('    '), k('if'), d(' (res.status === '), n('200'), d(') '), k('return'), d(' res.data')],
      [d('  } '), k('catch'), d(' (err) {')],
      [d('    '), f('console'), d('.error(err)     '), c('// 400 · 404')],
      [d('  }')],
      [d('}')],
    ],
  },

  /* ── 오른쪽 위 — ouid 로 바꾸기 (사장님이 콕 집으신 `ouid`) ── */
  {
    at: { top: '3%', right: '0%' },
    mobile: true,
    lines: [
      [k('if'), d(' (user) {')],
      [
        d('  '),
        k('const'),
        d(' { '),
        f('ouid'),
        d(' } = '),
        k('await'),
        d(' '),
        f('nexon'),
        d('.'),
        f('id'),
        d('(nickname)'),
      ],
      [d('  '), f('loadDashboard'), d('()')],
      [d('} '), k('else'), d(' {')],
      [d('  '), f('redirect'), d('('), s("'/auth/login'"), d(')')],
      [d('}')],
    ],
  },

  /* ── 가운데 아래 — ★match detail★ (사장님 원문) ────────── */
  {
    at: { top: '52%', left: '38%' },
    mobile: false,
    lines: [
      [c('// match detail')],
      [
        k('const'),
        d(' match = '),
        k('await'),
        d(' '),
        f('apiGet'),
        d('('),
        s(`'${pathOf('matchShow')}'`),
        d(', {'),
      ],
      [d('  leagueId: '), s(`'${LEAGUE_SLUGS[0] ?? ''}'`), d(',')],
      [d('  mode: '), s(`'${MATCH_MODES[2] ?? ''}'`), d(',')],
      [d('  weapon: '), n(String(WEAPON.SNIPER)), d('  '), c('// 0 = 라이플')],
      [d('})')],
    ],
  },

  /* ── 왼쪽 아래 — 육각 여섯 축 ──────────────────────────── */
  {
    at: { top: '60%', left: '1%' },
    mobile: false,
    lines: [
      [c('// hexagon')],
      [k('const'), d(' axes = ['), ...TRAIT_AXIS_KEYS.slice(0, 3).flatMap((axis, i) => [
        i === 0 ? d('') : d(', '),
        s(`'${axis}'`),
      ])],
      [d('  '), ...TRAIT_AXIS_KEYS.slice(3).flatMap((axis, i) => [
        i === 0 ? d('') : d(', '),
        s(`'${axis}'`),
      ]), d(']')],
    ],
  },

  /* ── 오른쪽 아래 — ★CLOUD 의 약자★ (사장님 원문) ────────── */
  {
    at: { top: '62%', right: '1%' },
    mobile: true,
    lines: [
      [c('// SA CLOUD')],
      ...CLOUD_WORDS.map((word) => [d('> '), n(word.charAt(0)), f(word.slice(1))] as CodeLine),
      [d('> '), f('leagues: '), s(LEAGUE_SLUGS.join(' · '))],
      [d('> '), f('status: '), n('200 online')],
    ],
  },

  /* ── 가운데 오른쪽 — 순위 질의 ────────────────────────── */
  {
    at: { top: '30%', right: '18%' },
    mobile: false,
    lines: [
      [
        f(methodOf('leagueRankPlayers')),
        d(' '),
        s(pathOf('leagueRankPlayers')),
        d(' → '),
        n('200'),
      ],
      [f(methodOf('leagueHexTop')), d(' '), s(pathOf('leagueHexTop')), d(' → '), n('200')],
      [f(methodOf('playersSearch')), d(' '), s(pathOf('playersSearch')), d(' → '), n('400')],
    ],
  },
]
