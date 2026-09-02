/**
 * 선수 **전투력 육각형** + **플레이스타일 바** — 판정·라벨·문구를 한 곳에 모은다.
 * (`docs/PLAYER_TRAITS_SPEC.md` 4절 · 8절 · D-185)
 *
 * **원본(3rd.supply)에 없는 화면이다.** 사용자 지시로 만든 신규 기능이고,
 * `CLAUDE.md` 3장 3번(임의 기능 추가 금지)의 명시적 예외다 — 무소속리그(D-165)와 같은 취급이다.
 *
 * ── 왜 계약에 두는가
 *   실제 서버(`apps/web/lib/server/queries/playerTraits.ts`)와 Mock(`packages/mock`)이
 *   **같은 함수**를 부른다. 두 곳에서 따로 판정하면 mock↔live 대조가 조용히 어긋난다
 *   (`오늘 퍼포먼스`(D-182)와 같은 구조다).
 *
 * ── 모르는 축을 0 으로 채우지 않는다 (D-106)
 *   육각형은 **넓이로 정도를 보여 준다.** 재료가 없는 축을 0 으로 찍으면 그 넓이가
 *   "못한다" 는 뜻이 되어 버린다. 지금은 "아직 모른다" 이므로 값은 `null` 이고,
 *   화면은 그 축을 `측정중` 으로 그린다.
 */

/* -------------------------------------------------------------------------- */
/* 축                                                                          */
/* -------------------------------------------------------------------------- */

/**
 * 육각형 꼭지점 6개. **이 순서가 화면의 시계방향 순서**다 (사양 4절 표의 순서).
 *
 * 4번은 **기회창출**이다 (2026-08-31 사용자 확정 · D-214). D-206 에서 비워 뒀던
 * 자리를 채웠다. 빈 자리였던 판(`TRAIT_AXIS_KEYS_V2`)도 그대로 남긴다.
 *
 * 5번은 **연속킬**이다 (2026-09-02 · D-260). `작업/원어택 성공률`(`finish`)을 내렸다.
 * 그 판도 `TRAIT_AXIS_KEYS_V3` 로 그대로 남긴다.
 */
export const TRAIT_AXIS_KEYS = [
  'save',
  'duel',
  'carry',
  'opening',
  'burst',
  'outnumbered',
] as const
export type TraitAxisKey = (typeof TRAIT_AXIS_KEYS)[number]

/**
 * **4번 자리를 비우기 전**의 여섯 축 (D-206). 지우지 않는다.
 *
 * 사용자 상시 지시 — "방식을 바꾸면 전의 방식 버전도 남겨라". 4번은 `매치의 사나이`였다.
 * 그 값을 만드는 재료(`PlayerRoundProfile.matchMan` / `longMatches`)도, 그것을 만드는
 * 집계 잡(`roundBuild.ts`)도, 그것을 쓰는 **MVP 규칙(D-182)** 도 전부 그대로 살아 있다.
 * **육각형 축에서만 내렸다.**
 *
 * ── 왜 내렸나 (실측 2026-08-30 · 로컬 미러)
 * ```
 * 값이 뜨는 인원   supply 라플 154/891 · 스나 23/159 · 대룰 0/156
 * 반분신뢰도       0.235      ← 캐리력 0.645 · 소수싸움 0.313 · 세이브 0.262
 * 평균 비율        0.093      ← 10명 중 1명이 뽑히는 순수 확률(0.100)과 사실상 같다
 * ```
 * 즉 그 축은 **실력이 아니라 동전 던지기**를 재고 있었다. MVP 규칙에서는 "있으면 붙는다"
 * 라 표본이 적어도 되지만, 백분위는 표본이 곧 축의 뜻이다.
 */
export const TRAIT_AXIS_KEYS_V1 = [
  'save',
  'duel',
  'carry',
  'matchman',
  'finish',
  'outnumbered',
] as const
export type TraitAxisKeyV1 = (typeof TRAIT_AXIS_KEYS_V1)[number]

/**
 * **4번을 비워 뒀던 판** (D-206 → D-214). 지우지 않는다.
 *
 * `매치의 사나이`를 내린 뒤(D-206) 무엇을 잴지 정하기 전까지 4번은 `미정` 이었다.
 * 2026-08-31 에 사용자가 `기회창출` 로 채웠다. 그 사이의 모습이 이것이다.
 *
 * `undecided` 라는 상태 자체는 계속 살아 있다 — `TRAIT_PENDING_TEXT.undecided` 를
 * 참조하라. 다음에 또 빈 축이 생기면 그대로 쓴다.
 */
export const TRAIT_AXIS_KEYS_V2 = [
  'save',
  'duel',
  'carry',
  'undecided',
  'finish',
  'outnumbered',
] as const
export type TraitAxisKeyV2 = (typeof TRAIT_AXIS_KEYS_V2)[number]

/**
 * **5번이 `작업/원어택 성공률`(`finish`) 이던 판** (D-195 · D-196 → D-260). 지우지 않는다.
 *
 * 사용자 상시 지시 — "방식을 바꾸면 전의 방식 버전도 남겨라". D-206 이 `매치의 사나이`를
 * 내린 방식과 똑같이 했다: **육각형 축에서만 내렸다.** 그 값을 만드는 재료
 * (`PlayerRoundProfile.workKills` / `workRifleKills` / `oneAttackKills` /
 * `oneAttackSameKills`)도, 그것을 만드는 집계 잡(`roundBuild.ts`)도, 포지션 자동 판정
 * (`playerPositionProfile`)도 **전부 그대로 살아 있다.** `TraitInput.workPercentile` ·
 * `oneAttackPercentile` 도 계속 채워서 넘긴다 — 지금은 `buildPlayerTraits` 가 무시한다.
 *
 * ── 왜 내렸나 (실측 2026-09-02 · 운영 `PlayerRoundProfile` 8,710명)
 * ```
 * 값이 뜨는 인원   작업(스나) 2,949 / 33.9%   원어택(라플) 2,494 / 28.6%
 *                 ← 세이브 7,933 / 91.1% · 소수싸움 8,175 / 93.9% 와 견주면 3분의 1이다
 * ```
 * 5번만 **상대의 무기나 포지션을 알아야** 떴다. 포지션 자동 판정은 표본이 늘어도
 * 좀처럼 채워지지 않는다 — 육각형에서 **가장 자주 비는 축**이었다.
 * 연속킬은 **킬 시각만** 있으면 되므로 라운드 복원 자료가 있는 선수라면 거의 다 뜬다.
 */
export const TRAIT_AXIS_KEYS_V3 = [
  'save',
  'duel',
  'carry',
  'opening',
  'finish',
  'outnumbered',
] as const
export type TraitAxisKeyV3 = (typeof TRAIT_AXIS_KEYS_V3)[number]

/**
 * 축 이름 — **주무기에 따라 갈린다** (사양 4절).
 *
 * 스나수 화면에는 `스나싸움` · `작업 성공률`, 라플수 화면에는 `샷싸움` · `원어택 성공률`.
 * 나머지 축은 지금 무기와 무관하게 같은 이름이지만 **구조는 무기별로 갈라 둔다** —
 * 새로 정해질 4번 축이 무기별로 갈릴 수 있다.
 *
 * 4번 `기회창출`(D-214)은 지금 **무기와 무관하게 같은 이름**이다. 라플이든 스나든
 * "라운드의 첫 킬을 딴다" 는 뜻이 그대로 읽힌다 — 무기 중립임을 실측으로도 확인했다.
 * 그래도 구조는 무기별로 갈라 둔 채로 남긴다.
 *
 * 5번 `연속킬`(D-260)도 지금은 **무기와 무관하게 같은 이름**이다. 다만 견주는 무리는
 * 무기별로 갈린다 — 사용자가 *"이거 스나는 스나끼리 라플은 라플끼리 비교해야하는거 알지?"*
 * 라고 못박았고, 백분위 모집단이 이미 무기별이라 그 요구는 구조가 이미 지키고 있다
 * (`playerTraits.ts` 의 `rifle` / `sniper` 두 `WeaponCohort`).
 * 이름을 무기별로 갈라 둔 구조는 그대로 남긴다.
 *
 * 옛 4번(`matchman`) · 빈 자리(`undecided`) · 옛 5번(`finish`)의 이름도 남긴다.
 * `TRAIT_AXIS_KEYS_V1` · `TRAIT_AXIS_KEYS_V2` · `TRAIT_AXIS_KEYS_V3` 참조.
 */
export const TRAIT_AXIS_LABEL: Record<
  TraitAxisKey | TraitAxisKeyV1 | TraitAxisKeyV2 | TraitAxisKeyV3,
  { sniper: string; rifle: string }
> = {
  save: { sniper: '세이브', rifle: '세이브' },
  duel: { sniper: '스나싸움', rifle: '샷싸움' },
  carry: { sniper: '캐리력', rifle: '캐리력' },
  /** 4번 축 — **라운드의 첫 킬을 딴 비율** (2026-08-31 사용자 확정 · D-214) */
  opening: { sniper: '기회창출', rifle: '기회창출' },
  /** 빈 자리였던 판 (D-206). 이름이 곧 상태다 — 재료가 없는 게 아니라 **안 정한 것** */
  undecided: { sniper: '미정', rifle: '미정' },
  /** 옛 4번 축 (D-206). 육각형에서는 내려왔지만 이름은 남긴다 */
  matchman: { sniper: '매치의 사나이', rifle: '매치의 사나이' },
  /** 5번 축 — **직전 킬과 2초 이하로 이어진 킬의 비율** (2026-09-02 · D-260) */
  burst: { sniper: '연속킬', rifle: '연속킬' },
  /** 옛 5번 축 (D-260). 육각형에서는 내려왔지만 재료도 이름도 그대로 남긴다 */
  finish: { sniper: '작업 성공률', rifle: '원어택 성공률' },
  outnumbered: { sniper: '소수싸움', rifle: '소수싸움' },
}

/**
 * 그 축에 **값이 없는 이유**.
 *
 * 화면에 그대로 적는다. "측정중" 만 쓰면 무엇이 없어서 못 재는지 아무도 모른다.
 *
 * ⚠ **`undecided` 만 성격이 다르다.** 나머지 다섯은 전부 *"재료가 없어서 못 잰다"* 이고
 * 재료가 들어오면 저절로 채워진다. `undecided` 는 *"무엇을 잴지 사람이 아직 안 정했다"*
 * 이고, 기다린다고 채워지지 않는다 (D-206). 그래서 화면도 `측정중` 이 아니라 `미정`
 * 이라고 적고, `측정중 N항목` 집계에서도 뺀다.
 *
 * ⚠ **지금 이 사유를 쓰는 축은 하나도 없다** — 4번이 `기회창출` 로 채워졌다 (D-214).
 * **그래도 지우지 않는다.** 다음에 또 빈 축이 생길 수 있고, 그때 `경기 부족` 으로
 * 둘러대지 않으려면 이 상태가 있어야 한다.
 */
export const TRAIT_PENDING_KEYS = [
  'rounds',
  'battlelog',
  'position',
  'games',
  'weapon',
  'undecided',
] as const
export type TraitPending = (typeof TRAIT_PENDING_KEYS)[number]

export const TRAIT_PENDING_TEXT: Record<TraitPending, string> = {
  /** 그 경기 10명 전원의 배틀로그로 라운드를 복원해야 한다 (사양 4절 표) */
  rounds: '라운드 복원 필요',
  /** 킬로그(배틀로그) 자체가 아직 없다 */
  battlelog: '배틀로그 필요',
  /** 상대의 **포지션 자동 판정**(사양 3절)이 먼저 있어야 한다 */
  position: '포지션 판정 필요',
  /** 표본이 모자라 백분위가 난수가 된다 */
  games: '경기 부족',
  /** 주무기가 정해지지 않아 **누구와 견줄지**를 모른다 */
  weapon: '주무기 미정',
  /** **무엇을 잴지 정하지 않았다.** 기다려서 채워지는 값이 아니다 (D-206) */
  undecided: '미정',
}

/**
 * 기다리면 채워지는 사유인가.
 *
 * `false` 면 사람이 정해야 한다 — 화면은 그 축을 `측정중` 으로 세지 않는다.
 */
export function isMeasurablePending(pending: TraitPending): boolean {
  return pending !== 'undecided'
}

/**
 * 백분위를 재기 시작하는 최소 판수.
 *
 * > `[미확인]` 사양(4절)은 "데이터가 모자란 선수" 라고만 적고 **숫자를 정하지 않았다.**
 * > 10 은 우리가 고른 값이고 **원본과 동일함이 검증되지 않았다** (`CLAUDE.md` 3장 7번).
 * > 사용자 확정 전까지 이 상수 하나만 고치면 되게 여기 둔다.
 */
export const TRAIT_MIN_GAMES = 10

/**
 * 라운드 축(세이브 · 소수싸움)의 최소 표본 — **그 상황을 겪은 라운드 수**다 (D-194).
 *
 * 판수가 아니라 라운드 수인 이유: 세이브는 "혼자 남은 라운드" 안에서만 성패가 갈리므로
 * 30판을 뛰어도 혼자 남은 적이 두 번뿐이면 성공률이 0% 아니면 50% 밖에 안 나온다.
 *
 * > `[미확인]` 사양에 숫자가 없다. 10은 우리가 고른 값이고
 * > **원본과 동일함이 검증되지 않았다** (`CLAUDE.md` 3장 7번).
 */
export const TRAIT_MIN_ROUNDS = 10

/**
 * **기회창출**(4번 축)의 최소 표본 — 첫 킬을 가릴 수 있었던 **라운드 수**다 (D-214).
 *
 * ── 왜 `TRAIT_MIN_ROUNDS`(10)를 쓰지 않는가
 *   저 상수가 재는 것들(세이브 · 소수싸움)의 분모는 **드물게 일어나는 상황**이라
 *   10회면 두세 경기가 아니라 수십 경기의 산물이다. 기회창출의 분모는 반대다 —
 *   **모든 라운드가 분모**라 한 경기에 20라운드씩 쌓인다. 10을 걸면 사실상
 *   **반 경기짜리 값**이 백분위 분포에 섞인다.
 *
 *   게다가 라운드마다 첫 킬은 열 명이 나눠 가지므로 평균 비율이 **0.10** 이다.
 *   10라운드에서 나올 수 있는 값은 0.0 · 0.1 · 0.2 뿐이라, 그 눈금으로는
 *   `매치의 사나이`(D-206)를 내리게 만든 것과 똑같은 동전 던지기가 된다.
 *
 * ── 300 을 고른 근거
 *   `[측정 대기]` 실측 수치를 채워 넣는다.
 *
 * > `[미확인]` 사양에 숫자가 없다. 300은 우리가 고른 값이고
 * > **원본과 동일함이 검증되지 않았다** (`CLAUDE.md` 3장 7번).
 */
export const TRAIT_MIN_OPENING_ROUNDS = 300

/**
 * **연속킬**(5번 축)의 최소 표본 — 라운드와 시각을 아는 그 선수의 **총 킬 수**다 (D-260).
 *
 * ── 왜 라운드가 아니라 킬인가
 *   분모가 킬이기 때문이다. 축의 뜻이 **"내 킬 중 몇 %가 연속킬로 이어졌나"** 라
 *   문턱도 같은 단위로 걸어야 한다. 라운드로 걸면 라운드를 많이 뛰고 킬은 적은 선수가
 *   킬 다섯 개짜리 비율로 분포에 들어온다.
 *
 * ── 50 을 고른 근거 (실측 2026-09-02 · 운영 배틀로그 전량 재계산)
 * ```
 * 총 킬 분포 (라운드 복원 자료가 있는 선수 6,861명)
 *   중앙값 118 킬 · 하위 25% 40 킬 · 하위 10% 14 킬
 * 문턱을 50 으로 걸었을 때  5,556명(80.9%)이 남는다
 * ```
 *   50킬이면 비율의 눈금이 0.02 라 `기회창출`(0.1 눈금)을 괴롭힌 동전 던지기가 없다.
 *   더 올리면(100킬) 4,153명으로 줄어 세이브(7,933명)와의 격차가 다시 벌어진다.
 *
 * > `[미확인]` 사양에 숫자가 없다. 50은 우리가 고른 값이고
 * > **원본과 동일함이 검증되지 않았다** (`CLAUDE.md` 3장 7번).
 */
export const TRAIT_MIN_BURST_KILLS = 50

/**
 * **연속킬**(5번 축)의 최소 표본 — ★**지금 축이 쓰는 문턱**★ (2026-09-02).
 *
 * 단위는 **킬을 낸 라운드 수**(`burstKillRounds`)다.
 *
 * ── 왜 `TRAIT_MIN_BURST_KILLS`(50킬) 로는 안 되나
 *   사용자가 분모를 **(c) 「연속킬을 한 번이라도 낸 라운드 비율」**로 골랐다. 분모가
 *   킬에서 **라운드**로 바뀌었으므로 문턱도 같은 단위여야 한다. 킬 단위 문턱을 그대로
 *   두면 「킬은 많은데 라운드는 적은」 선수가 눈금 굵은 비율로 분포에 들어온다 —
 *   `기회창출`(D-214)이 겪은 것과 같은 문제다.
 *
 * ── 40 을 고른 근거 (실측 2026-09-02 · 로컬 배틀로그 전량 재집계)
 * ```
 * 킬을 낸 라운드 수 분포 (라운드 복원 자료가 있는 선수 5,908명)
 *   중앙값 71 · 하위 25% 24 · 하위 10% 8
 * 문턱 40 → 3,833명(64.9%) · 눈금 0.025
 * 문턱 50 → 3,378명(57.2%) · 문턱 30 → 4,393명(74.4%) · 눈금 0.033
 * ```
 *   40이면 눈금이 0.025 라 실측 중앙값(0.11)을 네 자리로 가른다.
 *   30까지 내리면 사람은 늘지만 눈금이 0.033 으로 굵어져 동전 던지기에 가까워진다.
 *
 * > `[미확인]` 사양에 숫자가 없다. 40은 우리가 고른 값이고
 * > **원본과 동일함이 검증되지 않았다** (`CLAUDE.md` 3장 7번).
 *
 * ⚠ 옛 문턱 `TRAIT_MIN_BURST_KILLS` 는 **지우지 않았다** — 옛 해석 (a) 로 되돌아갈 때
 *   그대로 쓴다 (`CLAUDE.md` 10-4).
 */
export const TRAIT_MIN_BURST_ROUNDS = 40

/**
 * 백분위를 내려면 모집단이 최소 이만큼은 돼야 한다.
 *
 * 모집단이 1명이면 `percentileOf` 는 **항상 50** 이고 2명이면 25 아니면 75다.
 * 그걸 `상위 50%` 라고 적으면 "혼자 잰 값" 이 "절반보다 잘한다" 로 읽힌다.
 *
 * > `[미확인]` 사양에 없다. 20은 우리가 고른 값이다.
 */
export const TRAIT_MIN_COHORT = 20

/* -------------------------------------------------------------------------- */
/* 백분위                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * 오름차순으로 정렬된 모집단에서 `value` 의 백분위(0~100)를 낸다.
 *
 * 동점은 절반씩 나눠 갖는다(mid-rank). 그러지 않으면 같은 값을 가진 사람들이
 * 순서만으로 크게 갈린다 — 판당 킬처럼 소수 첫째자리에서 뭉치는 값에서 실제로 그렇다.
 *
 * 모집단이 비면 `null` 이다. **0 을 돌려주지 않는다** — 0은 "꼴찌" 라는 뜻이다 (D-106).
 */
export function percentileOf(sortedAsc: readonly number[], value: number): number | null {
  const size = sortedAsc.length
  if (size === 0) return null

  const below = lowerBound(sortedAsc, value)
  const upper = upperBound(sortedAsc, value)
  const ties = upper - below
  const rank = below + ties / 2

  return Math.round((rank / size) * 1000) / 10
}

/** `value` 보다 **작은** 값의 개수 */
function lowerBound(sortedAsc: readonly number[], value: number): number {
  let lo = 0
  let hi = sortedAsc.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if ((sortedAsc[mid] as number) < value) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** `value` **이하**인 값의 개수 */
function upperBound(sortedAsc: readonly number[], value: number): number {
  let lo = 0
  let hi = sortedAsc.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if ((sortedAsc[mid] as number) <= value) lo = mid + 1
    else hi = mid
  }
  return lo
}

/* -------------------------------------------------------------------------- */
/* 육각형                                                                       */
/* -------------------------------------------------------------------------- */

export interface TraitAxis {
  key: TraitAxisKey
  /** 주무기까지 반영한 **화면에 그대로 쓰는 이름** */
  label: string
  /** 0~100 백분위. 재료가 없으면 `null` — **0이 아니라 모르는 것이다** */
  percentile: number | null
  /** 못 재는 이유. 잴 수 있었으면 `null` */
  pending: TraitPending | null
}

export interface TraitHexagon {
  /** 주무기 — `0 = 라이플` · `1 = 스나이퍼`. 정해지지 않으면 `null` */
  weapon: 0 | 1 | null
  /** 백분위를 낸 모집단의 크기(같은 주무기 선수 수). 못 냈으면 `null` */
  cohort: number | null
  /** 백분위를 재는 데 쓴 그 선수의 판수 */
  known_games: number
  /** 항상 6개 · `TRAIT_AXIS_KEYS` 순서 */
  axes: TraitAxis[]
  /** 값이 있는 축 수 */
  measured: number
  /** 여섯 축이 다 차지 않았다 — 화면은 `전투력 측정중` 을 함께 적는다 */
  measuring: boolean
}

export interface TraitInput {
  /** 주무기. 어느 쪽도 절반을 넘지 못하면 `null` */
  weapon: 0 | 1 | null
  /** K/D 를 아는 판수 — 백분위의 표본 크기다 (D-148) */
  knownGames: number
  /** 같은 주무기 선수 수. 모집단을 못 만들었으면 `null` */
  cohort: number | null
  /** 판당 평균 킬의 백분위 (3 캐리력) */
  carryPercentile: number | null
  /** 판당 평균 딜량의 백분위 (2 샷싸움 · **라플 전용**) */
  damagePercentile: number | null
  /**
   * 라운드 복원(D-194)에서 나오는 세 축.
   *
   * 필드가 없으면 "재료가 아직 없다" 는 뜻이다 — 이 계약이 라운드 복원보다 먼저 있었고,
   * 그때 만든 호출부가 그대로 돌아야 한다.
   */
  savePercentile?: number | null
  outnumberedPercentile?: number | null
  /**
   * 옛 4번 축 `매치의 사나이` (D-206). **육각형은 더 이상 이 값을 그리지 않는다.**
   *
   * 재료(`PlayerRoundProfile.matchMan` / `longMatches`)도 집계 잡도 그대로 살아 있고,
   * MVP 규칙(D-182)은 계속 쓴다. 넘겨도 무시되지만 **지우지 않는다** — 축이 다시
   * 정해질 때 붙일 자리이고, 그때까지 "옛 방식이 무엇이었는지" 를 남겨 둔다.
   */
  matchManPercentile?: number | null
  /**
   * 스나 전용 (D-195). **라플수에게는 재료가 없다** —
   * 스나싸움은 스나끼리의 교전이다.
   */
  snipeDuelPercentile?: number | null
  /**
   * 옛 5번 축 `작업 성공률`(스나) · `원어택 성공률`(라플) (D-195 · D-196 → D-260).
   * **육각형은 더 이상 이 값을 그리지 않는다.**
   *
   * `matchManPercentile` 과 같은 취급이다 — 재료도 집계 잡도 그대로 살아 있고
   * 호출부도 계속 채워서 넘긴다. 넘겨도 무시되지만 **지우지 않는다**:
   * 축이 다시 정해질 때 붙일 자리이고, 그때까지 "옛 방식이 무엇이었는지" 를 남겨 둔다.
   */
  workPercentile?: number | null
  oneAttackPercentile?: number | null
  /**
   * 4번 `기회창출` — 라운드의 **첫 킬**을 딴 비율의 백분위 (D-214).
   *
   * 라운드 복원(D-194)이 재료다. **무기와 무관**하다 — 라플이든 스나든 같은 뜻으로
   * 읽히는 것을 실측으로 확인했고, 그래서 축 이름도 무기에 따라 갈리지 않는다.
   */
  openingPercentile?: number | null
  /**
   * 5번 `연속킬` — 직전 킬과 **2초 이하**로 이어진 킬의 비율의 백분위 (D-260).
   *
   * 라운드 복원(D-194)이 재료다. 킬 시각만 있으면 되므로 세이브·소수싸움과 같은
   * 자료가 있으면 거의 항상 함께 뜬다 — 그것이 `finish` 를 내리고 이 축을 올린 이유다.
   *
   * ⚠ **정의는 사용자에게 확인받지 않았다** (`CLAUDE.md` 3장 7번).
   *   사용자가 «2초 안에 다음 한명» 쪽으로 간다는 것까지는 정했지만, 창(2초)과
   *   분모(총 킬)는 우리가 고른 값이고 **원본과 동일함이 검증되지 않았다.**
   *   「라운드당 2명」 쪽 재료(`burstKillRounds` / `burstMultiKillRounds`)도 함께
   *   저장해 두었으므로, 정의를 바꾸더라도 **집계를 다시 돌릴 필요는 없다.**
   */
  burstPercentile?: number | null
  /**
   * 그 선수에게 **라운드 복원 자료 자체가 있는가**.
   *
   * 백분위가 `null` 인 이유를 가른다 — 자료가 없으면 `라운드 복원 필요`,
   * 있는데 표본이 모자라면 `경기 부족` 이다. 둘은 다른 말이고, 기다려야 하는 것도 다르다.
   */
  hasRoundData?: boolean
}

/**
 * 여섯 축을 만든다.
 *
 * 경기 기록만으로 되는 것은 3 캐리력(판당 킬)과 라플수의 2 샷싸움(딜량)이다.
 * 1·4·5·6 은 라운드 복원(D-194 · D-214 · D-260), 스나의 2 는 배틀로그의 상대 무기가
 * 있어야 계산된다. 그 사실을 축마다 `pending` 으로 남긴다.
 *
 * **4번은 `기회창출` 이다** (2026-08-31 · D-214). D-206 에서 비워 뒀던 자리를 채웠다.
 * **5번은 `연속킬` 이다** (2026-09-02 · D-260). `작업/원어택 성공률`을 내렸다 —
 * 그것만 상대의 무기·포지션을 알아야 떠서 육각형에서 가장 자주 비는 축이었다.
 * 내린 방식은 D-206 과 같다: **축에서만 내렸고 재료와 집계는 그대로 산다**
 * (`TRAIT_AXIS_KEYS_V3` 참조).
 */
export function buildPlayerTraits(input: TraitInput): TraitHexagon {
  const weapon = input.weapon
  const sniper = weapon === 1
  const label = (key: TraitAxisKey) =>
    sniper ? TRAIT_AXIS_LABEL[key].sniper : TRAIT_AXIS_LABEL[key].rifle

  /* 무기를 모르면 **누구와 견줄지**를 모른다. 라플 모집단에 스나수를 섞어 줄 세우면
     "스나가 킬이 많다" 는 무기의 성질이 실력으로 둔갑한다 (사양 4절) */
  const blocked: TraitPending | null =
    weapon === null ? 'weapon' : input.knownGames < TRAIT_MIN_GAMES ? 'games' : null

  const axes: TraitAxis[] = TRAIT_AXIS_KEYS.map((key) => {
    if (blocked !== null) return { key, label: label(key), percentile: null, pending: blocked }

    switch (key) {
      case 'opening': {
        /* 4번 `기회창출` — 라운드의 첫 킬을 딴 비율 (D-214). 라운드 복원이 재료라
           1·6번과 같은 사유 갈래를 쓴다: 자료가 없으면 `라운드 복원 필요`,
           있는데 표본이 모자라면 `경기 부족` 이다 */
        const value = input.openingPercentile ?? null
        return {
          key,
          label: label(key),
          percentile: value,
          pending: value !== null ? null : input.hasRoundData === true ? 'games' : 'rounds',
        }
      }
      case 'carry':
        return {
          key,
          label: label(key),
          percentile: input.carryPercentile,
          pending: input.carryPercentile === null ? 'games' : null,
        }
      case 'duel': {
        /* 스나 `스나싸움` = 스나싸움 구역에서 상대 **스나**와의 교전 승률 (D-195).
           라플 `샷싸움` = 딜량 (사양 4절). 둘은 아예 다른 값이라 축 이름도 다르다 */
        if (sniper) {
          const value = input.snipeDuelPercentile ?? null
          return {
            key,
            label: label(key),
            percentile: value,
            pending: value !== null ? null : input.hasRoundData === true ? 'games' : 'battlelog',
          }
        }
        return {
          key,
          label: label(key),
          percentile: input.damagePercentile,
          pending: input.damagePercentile === null ? 'games' : null,
        }
      }
      case 'burst': {
        /* 5번 `연속킬` — 직전 킬과 2초 이하로 이어진 킬의 비율 (D-260).
           라운드 복원이 재료라 1·4·6번과 **같은 사유 갈래**를 쓴다: 자료가 없으면
           `라운드 복원 필요`, 있는데 킬이 모자라면 `경기 부족` 이다.

           ⚠ **여기 `?? null` 을 지우지 마라.** 이 축이 붙기 전에 만들어진 호출부는
             `burstPercentile` 을 아예 넘기지 않는다 (`undefined`). `=== null` 로만
             막으면 `undefined` 가 그대로 `percentile` 에 실려 계약(`number | null`)이
             깨진다. 같은 함정이 클랜 육각형에서 카드를 통째로 지웠다 (D-259). */
        const value = input.burstPercentile ?? null
        return {
          key,
          label: label(key),
          percentile: value,
          pending: value !== null ? null : input.hasRoundData === true ? 'games' : 'rounds',
        }
      }
      default: {
        /* 1 세이브 · 6 소수싸움 — 그 경기 10명 전원의 로그로 **라운드를 복원**해야
           나온다 (사양 4절 표 · D-194).
           4번(`기회창출`)도 같은 재료를 쓰지만 분모가 달라 위에서 따로 본다 (D-214) */
        const value =
          key === 'save' ? (input.savePercentile ?? null) : (input.outnumberedPercentile ?? null)
        return {
          key,
          label: label(key),
          percentile: value,
          /* 자료가 아예 없는 것과 표본이 모자란 것을 구분한다 */
          pending: value !== null ? null : input.hasRoundData === true ? 'games' : 'rounds',
        }
      }
    }
  })

  const measured = axes.filter((axis) => axis.percentile !== null).length

  return {
    weapon,
    cohort: blocked === null ? input.cohort : null,
    known_games: input.knownGames,
    axes,
    measured,
    measuring: measured < TRAIT_AXIS_KEYS.length,
  }
}

/* -------------------------------------------------------------------------- */
/* 플레이스타일 바 (8절)                                                         */
/* -------------------------------------------------------------------------- */

/**
 * 바 두 줄. **블루·레드는 색 이름이 아니라 진영**이다 (D-182 · 사용자 확정).
 *
 * ```
 * 블루 = 수비   안전함   ↔  변칙적
 * 레드 = 공격   느린전개 ↔  빠른전개
 * ```
 *
 * 그 진영으로 뛴 **라운드만** 골라서 잰다. 수비 라운드의 움직임으로 공격 성향을 재면
 * 거짓이 된다. 그래서 라운드별 진영(D-184 의 폭탄 판정)이 먼저 있어야 한다.
 */
export const PLAYSTYLE_SIDE_KEYS = ['blue', 'red'] as const
export type PlaystyleSide = (typeof PLAYSTYLE_SIDE_KEYS)[number]

/**
 * 바 한 줄을 재기 시작하는 최소 **라운드** 수 — 그 진영으로 뛴 라운드다 (D-211).
 *
 * 판수가 아니라 라운드 수인 이유는 육각형의 `TRAIT_MIN_ROUNDS` 와 같다.
 * 한 경기에서 그 진영으로 뛴 라운드가 대여섯뿐이라 판수로 재면 표본을 크게 오해한다.
 *
 * 육각형(10)보다 높게 잡았다. 저 축들은 "혼자 남은 라운드" 처럼 **드물게 일어나는 일**의
 * 성패라 한 라운드가 한 번의 관측이지만, 여기 값들은 **매 라운드 관측되는 연속값**의
 * 평균이라 표본이 같은 수라도 의미가 다르고, 반대로 20라운드는 두세 경기면 채워진다.
 *
 * > `[미확인]` 사양에 숫자가 없다. 20은 우리가 고른 값이고 **원본과 동일함이
 * > 검증되지 않았다** (`CLAUDE.md` 3장 7번).
 */
export const PLAYSTYLE_MIN_ROUNDS = 20

export const PLAYSTYLE_BAR_COPY: Record<
  PlaystyleSide,
  { side: string; left: string; center: string; right: string }
> = {
  blue: { side: '블루', left: '안전함', center: '정석', right: '변칙적' },
  red: { side: '레드', left: '느린전개', center: '정석', right: '빠른전개' },
}

export interface PlaystyleBar {
  key: PlaystyleSide
  /** `블루` / `레드` — 진영 이름이다 */
  side_label: string
  left_label: string
  center_label: string
  right_label: string
  /**
   * `-100`(왼쪽 끝) ~ `+100`(오른쪽 끝). `0` 이 `정석` 이다.
   *
   * **`0` 은 "가운데" 라는 실제 판정이고 `null` 은 "아직 모른다" 이다.** 섞지 않는다.
   */
  value: number | null
  pending: TraitPending | null
}

export interface PlaystyleBars {
  bars: PlaystyleBar[]
  /** 한 줄이라도 못 쟀다 */
  measuring: boolean
}

/**
 * 백분위(0~100)를 바 위치(`-100` ~ `+100`)로 옮긴다.
 *
 * 백분위 50 이 `정석`(0)이고, 100 이 오른쪽 끝, 0 이 왼쪽 끝이다.
 * **`null` 은 그대로 `null` 이다** — 가운데로 접지 않는다 (D-106).
 */
export function playstyleValueOf(percentile: number | null): number | null {
  if (percentile === null) return null
  const value = Math.round((percentile - 50) * 2)
  return Math.max(-100, Math.min(100, value))
}

/**
 * 바 두 줄의 재료 (D-211).
 *
 * 백분위는 **이미 계산돼서 들어온다** — 육각형과 같은 구조다. 누구와 견줄지(모집단)를
 * 아는 것은 질의 쪽이고, 계약은 그 결과를 화면 모양으로 맞추기만 한다.
 * 그래야 Mock 과 실제 API 가 **같은 함수**를 쓸 수 있다.
 */
export interface PlaystyleInput {
  /** `0 = 라이플` · `1 = 스나이퍼`. 모르면 누구와 견줄지도 모른다 */
  weapon: 0 | 1 | null
  /** 수비 라운드 — 클수록 **변칙적** */
  bluePercentile: number | null
  /** 공격 라운드 — 클수록 **빠른전개** */
  redPercentile: number | null
  /**
   * 그 선수의 라운드 복원 자료가 **있기는 한가.**
   *
   * 없으면 `라운드 복원 필요`, 있는데 표본이 모자라면 `경기 부족` 이다.
   * 둘을 뭉뚱그리면 "더 뛰면 나온다" 와 "자료 자체가 없다" 가 같은 말이 된다.
   */
  hasRoundData?: boolean
}

/**
 * 플레이스타일 바 두 줄.
 *
 * ```
 * 블루 = 수비   안전함   ↔  변칙적
 * 레드 = 공격   느린전개 ↔  빠른전개
 * ```
 *
 * ── 무엇으로 재는가 (D-211 · 사양 8절)
 *   그 진영으로 뛴 **라운드만** 골라서 잰다 (D-182 · 사용자 확정). 라운드별 진영은
 *   폭탄이 말해 준다 (D-184 · D-208). 재료는 `@sacloud/nexon` 의 `playstyle.ts` 가
 *   세고, 무엇을 어떻게 섞었는지는 그 파일 머리말에 있다.
 *
 * ── 재료가 없으면 `null` 이다
 *   **가운데(`정석`)로 채우지 않는다** — `정석` 은 "재 봤더니 가운데" 라는 뜻이라
 *   모르는 것을 그렇게 적으면 거짓이 된다 (D-106).
 *
 * 인자를 주지 않으면 두 줄 다 `측정중` 이다 — Mock 과 옛 호출부가 그대로 돈다.
 */
export function buildPlayerPlaystyle(input?: PlaystyleInput | null): PlaystyleBars {
  /* 무기를 모르면 **누구와 견줄지**를 모른다. 스나는 원래 더 일찍 교전하므로
     (실측 7~8초 대 라플 12초) 라플 무리에 섞어 줄 세우면 스나가 전원 `빠른전개` 가 된다 */
  const blocked: TraitPending | null =
    input == null ? 'rounds' : input.weapon === null ? 'weapon' : null

  const percentileOfSide = (key: PlaystyleSide): number | null => {
    if (input == null || blocked !== null) return null
    return key === 'blue' ? input.bluePercentile : input.redPercentile
  }

  const bars: PlaystyleBar[] = PLAYSTYLE_SIDE_KEYS.map((key) => {
    const value = playstyleValueOf(percentileOfSide(key))
    return {
      key,
      side_label: PLAYSTYLE_BAR_COPY[key].side,
      left_label: PLAYSTYLE_BAR_COPY[key].left,
      center_label: PLAYSTYLE_BAR_COPY[key].center,
      right_label: PLAYSTYLE_BAR_COPY[key].right,
      value,
      pending:
        value !== null
          ? null
          : (blocked ?? (input?.hasRoundData === true ? 'games' : 'rounds')),
    }
  })

  return { bars, measuring: bars.some((bar) => bar.value === null) }
}

/* -------------------------------------------------------------------------- */
/* 주무기                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * 주무기 — **그 무기로 뛴 판수가 전체의 절반 이상**이면 그것이 주무기다.
 *
 * `LeaguePlayerWeaponStat.isMain` (D-173)과 같은 뜻이다. 무기 랭킹의 모집단이
 * 그 칸이므로, 육각형이 다른 규칙으로 무기를 고르면 같은 선수가 두 화면에서
 * 다른 무리와 견줘진다.
 *
 * ⚠ **정확히 반반인 선수만 다르다.** `isMain` 은 `절반 이상`(≥)이라 그 선수를
 * 양쪽 다 참으로 두지만, 여기서는 **하나만 골라야** 하므로 `null` 이다.
 * 반반인 사람을 라플로 세면 그 절반의 스나 판이 라플 무리 안에서 견줘진다.
 *
 * 무기를 아는 판이 하나도 없어도 `null` 이다.
 */
export function mainWeaponOf(rifleGames: number, sniperGames: number): 0 | 1 | null {
  const total = rifleGames + sniperGames
  if (total === 0) return null
  if (rifleGames * 2 > total) return 0
  if (sniperGames * 2 > total) return 1
  return null
}
