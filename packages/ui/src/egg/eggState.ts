/**
 * 「알」 상태 — 순수 규칙.
 *
 * 정본은 `docs/EGG_SYSTEM_SPEC.md` 다. 이 파일은 그 문서의 3장(알을 깨는 법)과
 * 5-1(배치)을 **계산으로만** 옮긴 것이다. 화면도 DB도 모른다.
 *
 * ── 한 줄 요약
 *   모든 클랜과 선수의 기록을 알로 덮어 둔다. 알을 깨야 기록이 보인다.
 *   기록을 **지우는 것이 아니라 가려 두는 것**이다.
 */

/** 알의 두 가지 상태. `sealed` = 안 깨짐, `broken` = 깨짐 */
export type EggState = 'sealed' | 'broken'

/** 클랜 알이 깨지는 클랜원 비율 (사양 3장). 하드코딩하지 말고 이 상수를 쓴다 */
export const CLAN_EGG_THRESHOLD = 0.3

/** 가린 자리에 띄우는 문구. **빈칸으로 두지 않는다** — 비어 있으면 없는 줄 안다 (사양 2장) */
export const EGG_VEIL_MESSAGE = '알이 깨지면 기록을 볼 수 있습니다'

/** 표 한 칸처럼 좁은 자리에 쓰는 대체 표기. `title` 로 위 문구를 함께 단다 */
export const EGG_VEIL_MARK = '▨▨'

/** 깨는 방법 안내 (사양 3장·4장) */
export const EGG_BREAK_GUIDE = '가입하고 본인 인증에 성공하면 내 알이 깨집니다'

/** 클랜 알 안내 (사양 3장) */
export const CLAN_EGG_GUIDE = `클랜원의 ${Math.round(
  CLAN_EGG_THRESHOLD * 100,
)}% 이상이 알을 깨거나, 클랜마스터가 본인 인증에 성공하면 클랜 알이 깨집니다`

export interface ClanEggInput {
  /** 본인 인증에 성공해 자기 알을 깬 클랜원 수 */
  verifiedMembers: number
  /**
   * 분모.
   *
   * > `[미확인]` 분모가 병영수첩 클랜원 명단 전체인지, 우리가 아는 선수인지
   * > 아직 정해지지 않았다 (사양 3장 · 명단 미수집). **여기서 임의로 고르지 않는다** —
   * > 부르는 쪽이 무엇을 세었는지 알고 넘긴다.
   */
  memberCount: number
  /** 클랜마스터가 본인 인증에 성공했는가. 그러면 **혼자서도** 깬다 (사양 3장) */
  masterVerified?: boolean
}

export interface ClanEggResult {
  state: EggState
  /** 깨진 클랜원 비율. 분모가 0이면 `null` — 0% 로 그리지 않는다 */
  ratio: number | null
  /** 30% 까지 앞으로 몇 명 더 깨야 하는가. 이미 깨졌거나 셀 수 없으면 `null` */
  needed: number | null
  /** 무엇이 깼는가 — 화면이 문구를 고르는 데 쓴다 */
  reason: 'master' | 'threshold' | 'sealed'
}

/**
 * 클랜 알 상태.
 *
 * ```
 * 클랜마스터가 인증했다            → 깨진다 (혼자서도)
 * 클랜원의 30% 이상이 각자 깼다     → 깨진다
 * 그 밖                            → 안 깨졌다
 * ```
 *
 * 분모가 0이면 **비율을 만들지 않는다.** 0명 중 0명을 100% 로 읽어 알이 저절로
 * 깨지는 일이 없어야 한다.
 */
export function clanEggState({
  verifiedMembers,
  memberCount,
  masterVerified = false,
}: ClanEggInput): ClanEggResult {
  const denominator = Math.max(0, Math.trunc(memberCount))
  const verified = Math.max(0, Math.trunc(verifiedMembers))

  if (masterVerified) {
    return {
      state: 'broken',
      ratio: denominator > 0 ? verified / denominator : null,
      needed: null,
      reason: 'master',
    }
  }

  if (denominator === 0) {
    return { state: 'sealed', ratio: null, needed: null, reason: 'sealed' }
  }

  const ratio = verified / denominator
  if (ratio >= CLAN_EGG_THRESHOLD) {
    return { state: 'broken', ratio, needed: null, reason: 'threshold' }
  }

  /* 30% 를 넘기려면 몇 명이 더 필요한가. `>=` 이므로 올림이다 */
  const target = Math.ceil(CLAN_EGG_THRESHOLD * denominator)
  return {
    state: 'sealed',
    ratio,
    needed: Math.max(1, target - verified),
    reason: 'sealed',
  }
}

/**
 * 알 모음집 세 칸 나누기 (사양 5-1).
 *
 * ```
 *   ○ ○ ○ ○ ○ ○ ○        ← 윗칸
 * ○ ○ ○ ○ ○ ○ ○ ○ ○      ← 가운뎃칸 (조금 더 길다)
 *   ○ ○ ○ ○ ○ ○ ○        ← 아랫칸
 * ```
 *
 * 규칙은 두 개뿐이다 — **윗칸과 아랫칸의 길이가 같고**, 가운뎃칸이 더 길다.
 * 23개면 정확히 7 / 9 / 7 이 된다 (사양의 그림과 같다).
 *
 * 클랜을 한 마리도 버리지 않는다. 세 칸에 전부 담는다.
 */
export function eggRows<T>(items: readonly T[]): [T[], T[], T[]] {
  const n = items.length
  if (n === 0) return [[], [], []]

  /* 가운뎃칸이 반드시 더 길도록 위·아래 길이를 눌러 둔다 */
  const side = Math.max(0, Math.min(Math.round((n - 2) / 3), Math.floor((n - 1) / 3)))

  return [
    items.slice(0, side),
    items.slice(side, n - side),
    items.slice(n - side),
  ]
}
