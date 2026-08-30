/**
 * 클랜 **육각형** (`docs/SITE_SPEC_V2.md` 5-5절 — 사용자 사양의 `6각형`).
 *
 * **원본(3rd.supply)에 없는 화면이다.** 선수 육각형(D-185)과 같은 취급이고,
 * `CLAUDE.md` 3장 3번의 명시적 예외다.
 *
 * ── 무엇을 여섯 축으로 골랐나
 *   사용자가 클랜 지표를 아홉 개 적었다. 그중 **비율로 견줄 수 있는 여섯**을 꼭지점으로
 *   삼고, 나머지 셋(소수싸움 · 클린시트 · 최다연승)은 숫자 그대로 줄로 적는다.
 *   횟수는 판수가 많은 클랜이 무조건 커져서 꼭지점으로 쓸 수 없다.
 *
 *   ```
 *   화력 · 블루방어율 · 어택성공률 · 조직력 · 폭발력 · 게임템포
 *   ```
 *
 * ── 왜 계약에 두는가
 *   실제 서버와 Mock 이 **같은 함수**를 부른다. 두 곳에서 따로 판정하면
 *   mock↔live 대조가 조용히 어긋난다 (선수 육각형과 같은 구조다).
 *
 * ── 모르는 축을 0 으로 채우지 않는다 (D-106)
 *   육각형은 **넓이로 정도를 보여 준다.** 재료가 없는 축을 0 으로 찍으면 그 넓이가
 *   "못한다" 는 뜻이 된다. 지금은 "아직 모른다" 이므로 `null` 이고 화면은 `측정중` 이다.
 *   특히 배틀로그 축 다섯은 **진영을 아는 라운드가 10.8% 뿐이라** 대부분 비어 있다.
 */

import { percentileOf } from './traits'

/** 꼭지점 여섯. **이 순서가 화면의 시계방향 순서**다 */
export const CLAN_TRAIT_AXIS_KEYS = [
  'firepower',
  'defense',
  'attack',
  'organized',
  'burst',
  'tempo',
] as const
export type ClanTraitAxisKey = (typeof CLAN_TRAIT_AXIS_KEYS)[number]

/** 화면에 그대로 쓰는 이름 — 사용자가 적어 준 말을 그대로 쓴다 */
export const CLAN_TRAIT_AXIS_LABEL: Record<ClanTraitAxisKey, string> = {
  firepower: '화력',
  defense: '블루방어율',
  attack: '어택성공률',
  organized: '조직력',
  burst: '폭발력',
  tempo: '게임템포',
}

/** 그 축을 아직 못 재는 이유 — 화면에 그대로 적는다 */
export const CLAN_TRAIT_PENDING_KEYS = ['battlelog', 'side', 'matches', 'cohort'] as const
export type ClanTraitPending = (typeof CLAN_TRAIT_PENDING_KEYS)[number]

export const CLAN_TRAIT_PENDING_TEXT: Record<ClanTraitPending, string> = {
  /** 배틀로그 자체가 아직 없다 */
  battlelog: '배틀로그 필요',
  /** 배틀로그는 있는데 **라운드별 진영**을 못 정했다 (교대를 못 봤다 · D-184) */
  side: '진영 판정 필요',
  /** 이긴 경기가 모자라 화력을 못 낸다 */
  matches: '경기 부족',
  /** 견줄 클랜이 모자라 백분위를 못 낸다 */
  cohort: '비교 대상 부족',
}

/**
 * 백분위를 내려면 같은 리그에 클랜이 최소 몇 팀 있어야 하나.
 *
 * 모집단이 1팀이면 백분위가 **항상 50%** 라 `상위 50%` 가 거짓이 된다.
 * 선수 쪽(`TRAIT_MIN_COHORT`)은 20 인데, 클랜은 리그당 수십 팀이라 그 값을 못 쓴다.
 *
 * > `[미확인]` 5 는 우리가 고른 값이다. 원본과 무관하다.
 */
export const CLAN_TRAIT_MIN_COHORT = 5

export interface ClanTraitAxis {
  key: ClanTraitAxisKey
  label: string
  /** 0~100 백분위. 재료가 없으면 `null` — **0이 아니라 모르는 것이다** */
  percentile: number | null
  /** 못 재는 이유. 잴 수 있었으면 `null` */
  pending: ClanTraitPending | null
}

export interface ClanHexagon {
  /** 백분위를 낸 모집단의 크기(같은 리그 클랜 수). 못 냈으면 `null` */
  cohort: number | null
  /** 항상 6개 · `CLAN_TRAIT_AXIS_KEYS` 순서 */
  axes: ClanTraitAxis[]
  /** 값이 있는 축 수 */
  measured: number
  /** 여섯 축이 다 차지 않았다 */
  measuring: boolean
}

/** 한 축의 재료 — 그 클랜의 값과, 같은 리그 클랜들의 값 분포 */
export interface ClanAxisInput {
  /** 그 클랜의 값. 못 재면 `null` */
  value: number | null
  /** 같은 리그 클랜들의 값 (정렬 안 돼 있어도 된다). 여기서 백분위를 낸다 */
  cohort: readonly number[]
  /** 값이 `null` 일 때 화면에 적을 이유 */
  pending: ClanTraitPending
  /**
   * 값이 **작을수록 좋은** 축인가.
   *
   * `블루방어율` 은 우리가 **지킨 비율**로 이미 뒤집어 넣기 때문에 여기서는 `false` 다.
   * `게임템포` 는 라운드가 **짧을수록** 좋으므로 부르는 쪽이 뒤집거나 이 값을 켠다.
   */
  lowerIsBetter?: boolean
}

/**
 * 클랜 육각형을 만든다.
 *
 * 모집단이 `CLAN_TRAIT_MIN_COHORT` 에 못 미치면 **그 축의 백분위를 내지 않는다.**
 * 값이 있어도 견줄 대상이 없으면 `상위 n%` 라는 말이 뜻을 잃는다.
 */
export function buildClanHexagon(
  inputs: Record<ClanTraitAxisKey, ClanAxisInput>,
): ClanHexagon {
  let cohort: number | null = null

  const axes: ClanTraitAxis[] = CLAN_TRAIT_AXIS_KEYS.map((key) => {
    const input = inputs[key]
    const label = CLAN_TRAIT_AXIS_LABEL[key]
    if (input.value === null) {
      return { key, label, percentile: null, pending: input.pending }
    }
    if (input.cohort.length < CLAN_TRAIT_MIN_COHORT) {
      return { key, label, percentile: null, pending: 'cohort' }
    }
    cohort = Math.max(cohort ?? 0, input.cohort.length)

    /* 작을수록 좋은 축은 부호를 뒤집어 재고, 그러면 큰 백분위가 곧 잘함이 된다 */
    const sign = input.lowerIsBetter ? -1 : 1
    const sorted = [...input.cohort].map((value) => value * sign).sort((a, b) => a - b)
    return {
      key,
      label,
      percentile: percentileOf(sorted, input.value * sign),
      pending: null,
    }
  })

  const measured = axes.filter((axis) => axis.percentile !== null).length
  return {
    cohort,
    axes,
    measured,
    measuring: measured < axes.length,
  }
}
