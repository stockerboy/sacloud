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

/** 육각형 꼭지점 6개. **이 순서가 화면의 시계방향 순서**다 (사양 4절 표의 순서) */
export const TRAIT_AXIS_KEYS = [
  'save',
  'duel',
  'carry',
  'matchman',
  'finish',
  'outnumbered',
] as const
export type TraitAxisKey = (typeof TRAIT_AXIS_KEYS)[number]

/**
 * 축 이름 — **주무기에 따라 2번·5번이 바뀐다** (사양 4절).
 *
 * 스나수 화면에는 `스나싸움` · `작업 성공률`, 라플수 화면에는 `샷싸움` · `원어택 성공률`.
 * 나머지 네 축은 무기와 무관하게 같은 이름이다.
 */
export const TRAIT_AXIS_LABEL: Record<TraitAxisKey, { sniper: string; rifle: string }> = {
  save: { sniper: '세이브', rifle: '세이브' },
  duel: { sniper: '스나싸움', rifle: '샷싸움' },
  carry: { sniper: '캐리력', rifle: '캐리력' },
  matchman: { sniper: '매치의 사나이', rifle: '매치의 사나이' },
  finish: { sniper: '작업 성공률', rifle: '원어택 성공률' },
  outnumbered: { sniper: '소수싸움', rifle: '소수싸움' },
}

/**
 * 그 축을 **아직 못 재는 이유**.
 *
 * 화면에 그대로 적는다. "측정중" 만 쓰면 무엇이 없어서 못 재는지 아무도 모른다.
 */
export const TRAIT_PENDING_KEYS = ['rounds', 'battlelog', 'position', 'games', 'weapon'] as const
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
  matchManPercentile?: number | null
  /**
   * 스나 전용 두 축 (D-195). **라플수에게는 재료가 없다** —
   * 스나싸움은 스나끼리의 교전이고, 작업 성공률은 스나가 라플을 잡는 비율이다.
   */
  snipeDuelPercentile?: number | null
  workPercentile?: number | null
  /** 라플수의 `원어택 성공률` — 같은 포지션 상대를 잡은 비율 (D-196) */
  oneAttackPercentile?: number | null
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
 * **지금 잴 수 있는 축은 둘뿐이다** — 3 캐리력(판당 킬)과, 라플수의 2 샷싸움(딜량).
 * 나머지는 라운드 복원(1·4·6) · 배틀로그(스나의 2·5) · 포지션 판정(라플의 5)이
 * 있어야 계산된다. 그 사실을 축마다 `pending` 으로 남긴다.
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
      case 'finish': {
        /* 스나 `작업 성공률` = 내 킬 중 상대가 **라플**이었던 비율 (D-195).
           라플 `원어택 성공률` = **같은 포지션** 상대를 잡은 비율 → 포지션 판정이 먼저다 */
        if (!sniper) {
          const rifleValue = input.oneAttackPercentile ?? null
          return {
            key,
            label: label(key),
            percentile: rifleValue,
            /* 포지션 판정이 안 된 선수는 `position`, 판정은 됐는데 킬이 모자라면 `games` */
            pending: rifleValue !== null ? null : input.hasRoundData === true ? 'games' : 'position',
          }
        }
        const value = input.workPercentile ?? null
        return {
          key,
          label: label(key),
          percentile: value,
          pending: value !== null ? null : input.hasRoundData === true ? 'games' : 'battlelog',
        }
      }
      default: {
        /* 1 세이브 · 4 매치의사나이 · 6 소수싸움 — 전부 그 경기 10명 전원의 로그로
           **라운드를 복원**해야 나온다 (사양 4절 표 · D-194) */
        const value =
          key === 'save'
            ? (input.savePercentile ?? null)
            : key === 'outnumbered'
              ? (input.outnumberedPercentile ?? null)
              : (input.matchManPercentile ?? null)
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
 * 지금은 **두 줄 다 잴 수 없다.**
 *
 * 네 축(스나/라플 × 블루/레드)이 전부 라운드별 진영 + 라운드 복원 + 맵 구역을 요구하는데,
 * 클랜 단위 배틀로그 수집분이 아직 0건이다 (D-184). 사양 8절이 "화면 자리와 측정중
 * 표시는 먼저 만들 수 있다" 고 한 그 상태다. **가운데(`정석`)로 채우지 않는다** —
 * `정석` 은 "재 봤더니 가운데" 라는 뜻이라 모르는 것을 그렇게 적으면 거짓이 된다.
 */
export function buildPlayerPlaystyle(): PlaystyleBars {
  return {
    bars: PLAYSTYLE_SIDE_KEYS.map((key) => ({
      key,
      side_label: PLAYSTYLE_BAR_COPY[key].side,
      left_label: PLAYSTYLE_BAR_COPY[key].left,
      center_label: PLAYSTYLE_BAR_COPY[key].center,
      right_label: PLAYSTYLE_BAR_COPY[key].right,
      value: null,
      pending: 'battlelog',
    })),
    measuring: true,
  }
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
