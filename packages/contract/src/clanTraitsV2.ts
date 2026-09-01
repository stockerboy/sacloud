/**
 * 클랜 **육각형 V2** — 계약 쪽 조립기 (`docs/CLAN_HEXAGON_V2_SPEC.md` · D-217 · **D-235**).
 *
 * `packages/nexon/src/clanHexV2.ts` 가 배틀로그 한 건에서 **분자/분모**(`ClanHexTally`)를 뽑고,
 * 이 파일은 그것을 **여러 경기에 걸쳐 합쳐** 여섯 축의 원값과 정규화 값을 만든다.
 *
 * ```
 * 배틀로그 원문 ──clanHexV2Of──▶ MatchClanHexV2 (경기 × 클랜, tally 통째 JSON)
 *                                   │
 *                                   ├─▶ 경기 상세 : 두 행을 겹쳐 그린다  → normalizeAgainstFoe (Q7)
 *                                   └─▶ 클랜 페이지: 그 클랜 행을 SUM     → normalizeByPercentile (Q8)
 * ```
 *
 * ── **옛 판(`clanTraits.ts`)을 지우지 않는다** (`CLAUDE.md` 10-4)
 *   축 여섯이 통째로 다르고(D-235 표), `게임템포` 는 **이름만 같고 다른 지표**다.
 *   옛 판은 줄 표기로 계속 살아 있으므로 파일도 함수도 그대로 둔다.
 *   **한 화면에서 옛 게임템포와 새 게임템포를 나란히 놓지 않는다.**
 *
 * ── 왜 계약에 두는가
 *   실제 서버와 Mock 이 **같은 함수**를 부른다. 두 곳에서 따로 조립하면 mock↔live 대조가
 *   조용히 어긋난다 (옛 판·선수 육각형과 같은 구조다).
 *
 * ── **비율을 평균 내지 않는다** (D-235 Q8)
 *   5라운드 경기와 18라운드 경기의 비율을 평균 내면 둘의 무게가 같아진다.
 *   분자와 분모를 각각 쌓아 **마지막에 한 번만 나눈다**. 그래서 `sumClanHexTallies` 가
 *   비율이 아니라 tally 를 합치고, 나누는 일은 `buildClanHexV2Raw` 한 곳에서만 일어난다.
 *
 * ── 못 잰 축은 **`null` 이다. 0 이 아니다** (D-106)
 *   육각형은 넓이로 정도를 보여 준다. 재료가 없는 축을 0 으로 찍으면 그 넓이가 "못한다" 는
 *   뜻이 된다. 지금은 "아직 모른다" 이므로 `null` 이고 화면은 `측정중` 이다.
 *   `0` 은 **겪었는데 한 번도 못 했다**는 실제 관측이고, 그건 그대로 0 으로 둔다.
 */

import { z } from 'zod'
import { Count } from './common'
import { percentileOf } from './traits'

/* -------------------------------------------------------------------------- */
/* 축                                                                           */
/* -------------------------------------------------------------------------- */

/** 꼭지점 여섯. **이 순서가 화면의 시계방향 순서**이고, 축 배열은 항상 이 순서다 */
export const CLAN_HEX_V2_AXIS_KEYS = [
  'sniperFight',
  'outnumbered',
  'save',
  'tempo',
  'lastSniper',
  'attackZone',
] as const
export type ClanHexV2AxisKey = (typeof CLAN_HEX_V2_AXIS_KEYS)[number]

/** 화면에 그대로 쓰는 이름 — 사용자가 적어 준 말을 그대로 쓴다 (사양 1장 원문) */
export const CLAN_HEX_V2_AXIS_LABELS: Record<ClanHexV2AxisKey, string> = {
  sniperFight: '스나싸움',
  outnumbered: '소수싸움',
  save: '세이브',
  tempo: '게임템포',
  lastSniper: 'B어택성공',
  attackZone: 'A어택성공',
}

/**
 * **게임템포만 「짧을수록 좋다」.** 나머지 다섯은 클수록 좋다.
 *
 * 정규화(`normalizeAgainstFoe` · `normalizeByPercentile`)가 이 표를 보고 부호를 뒤집는다.
 * 원값(`raw`)은 **뒤집지 않는다** — 화면에 `18.3초` 라고 적어야 하기 때문이다.
 */
export const CLAN_HEX_V2_LOWER_IS_BETTER: Record<ClanHexV2AxisKey, boolean> = {
  sniperFight: false,
  outnumbered: false,
  save: false,
  tempo: true,
  lastSniper: false,
  attackZone: false,
}

/**
 * 원값의 단위 — `text` 를 어떻게 적을지가 여기서 갈린다.
 *
 * ⚠ **① 스나싸움은 비율이 아니다.** D-235 Q1 이 「합」으로 정했고 분모가 레드 라운드라
 * **라운드당 킬수**가 나온다. 1을 넘을 수 있으므로 `%` 로 적으면 거짓이 된다.
 * 그래서 단위를 셋으로 나눴다.
 */
export const CLAN_HEX_V2_AXIS_UNITS: Record<
  ClanHexV2AxisKey,
  'ratio' | 'seconds' | 'perRound'
> = {
  sniperFight: 'perRound',
  outnumbered: 'ratio',
  save: 'ratio',
  tempo: 'seconds',
  lastSniper: 'ratio',
  attackZone: 'ratio',
}

/** 못 잰 이유 — 화면이 이 코드로 `측정중` 옆에 설명을 붙인다 */
export const CLAN_HEX_V2_PENDING_KEYS = [
  'battlelog',
  'side',
  'foeSniper',
  'sample',
  'zone',
  'compare',
] as const
export type ClanHexV2PendingReason = (typeof CLAN_HEX_V2_PENDING_KEYS)[number]

export const CLAN_HEX_V2_PENDING_TEXT: Record<ClanHexV2PendingReason, string> = {
  /** 배틀로그가 아예 없거나, 있어도 라운드를 복원할 수 없었다 (`isRestorable` 실패) */
  battlelog: '배틀로그 필요',
  /** 배틀로그는 있는데 **라운드별 진영**을 못 정했다 (D-184 · D-208) */
  side: '진영 판정 필요',
  /** 상대 팀에서 스나로 확정된 선수가 하나도 없다 (①⑤⑥ 의 전제) */
  foeSniper: '상대 스나 미확인',
  /** 분모가 최소치 미만이다 (D-235 Q8 = 20라운드) */
  sample: '표본 부족',
  /** 구역 좌표가 없다 — `녹뒤` · `머리` 는 아직 칠해지지 않았다 (D-235 Q6) */
  zone: '구역 좌표 필요',
  /** 겹쳐 그릴 상대 값이 없다 (경기 정규화 전용) */
  compare: '비교 대상 없음',
}

/** 화면에 `측정중` 이라고 적는다 (옛 판·선수 육각형과 같은 말) */
export const CLAN_HEX_V2_PENDING_LABEL = '측정중'

/**
 * ⑥ 이 쓰는 구역 — **사용자가 말한 넷 중 둘**만 좌표가 있다 (D-235 Q6 · `[미확인]`).
 *
 * 화면에 `구역 2/4` 를 적기 위한 분모다. `녹뒤` · `머리` 의 좌표는 사용자가 칠해야 생긴다.
 * 그때 **재수집 없이** 저장된 좌표에서 다시 만든다.
 */
export const CLAN_HEX_V2_ZONE_LABELS_TOTAL = 4

/* -------------------------------------------------------------------------- */
/* 설정                                                                         */
/* -------------------------------------------------------------------------- */

export interface ClanHexV2Config {
  /**
   * 축별 **최소 분모**. D-235 Q8 이 20라운드로 정했다. **하드코딩하지 않는다** (`CLAUDE.md` 3-B 6번).
   *
   * ⚠ 이 문턱은 **`normalizeByPercentile`(클랜 페이지)에서만** 걸린다.
   * 경기 한 건은 라운드가 13~18 이고 축별 분모는 그보다 훨씬 작다 — 거기서 20을 걸면
   * **경기 상세 육각형이 통째로 사라진다.** `buildClanHexV2Raw` 는 분모가 0인지만 본다.
   *
   * > `[미확인]` 20은 우리가 고른 값이다. 사용자 원문에도 원본에도 근거가 없다.
   */
  minDenominator: number
  /** 이 값으로 계산했다는 표시 (`CLAUDE.md` 3-B 5번 — 옛 값을 덮어쓰지 않기 위한 꼬리표) */
  formulaVersion: string
}

/**
 * 기본값.
 *
 * `formulaVersion` 은 **해석이 바뀔 때마다 올린다.** D-235 의 답 10개가 바뀌면 여기가 바뀐다.
 *
 * ⚠ 이 문자열은 수집 잡의 `CLAN_HEX_V2_FORMULA_VERSION`
 * (`apps/worker/src/lib/clanHexV2Version.ts`)과 **같은 값이어야 한다.** 잡은 그 값으로
 * 경기 × 클랜 행을 저장하고, 이 파일은 그 행을 합쳐 화면 값을 만든다. 둘이 갈리면
 * **기준이 다른 집계가 한 칸에 섞인다** (D-106). 규칙을 올릴 때 두 곳을 함께 올린다.
 * (계약이 `apps/*` 를 import 할 수 없어 값이 두 곳에 있다. 반대 방향은 가능하므로
 *  나중에 잡이 이 값을 가져다 쓰는 쪽으로 합칠 수 있다.)
 */
export const CLAN_HEX_V2_CONFIG: ClanHexV2Config = {
  minDenominator: 20,
  formulaVersion: 'clan-hex-v2.1',
}

/**
 * 백분위를 내려면 같은 리그에 **표본(=클랜)** 이 최소 몇 개 있어야 하나.
 *
 * 모집단이 1이면 백분위가 **항상 50%** 라 `상위 50%` 가 거짓이 된다.
 * 옛 클랜 육각형(`CLAN_TRAIT_MIN_COHORT`)과 같은 이유·같은 값이다.
 *
 * > `[미확인]` 5는 우리가 고른 값이다.
 */
export const CLAN_HEX_V2_MIN_SAMPLES = 5

/* -------------------------------------------------------------------------- */
/* tally — **nexon 의 것을 구조적으로 다시 선언한다**                              */
/* -------------------------------------------------------------------------- */

/**
 * ⚠ 아래 인터페이스들은 `packages/nexon/src/clanHexV2.ts` 의 `ClanHexTally` 무리와
 * **구조가 같다.** 그런데도 다시 적은 이유는 하나다 —
 *
 * ```
 * 계약(contract)이 수집기(nexon)를 import 하면 안 된다.
 * ```
 *
 * `contract` 는 화면·Mock·API 가 모두 의존하는 **가장 아래 패키지**다. 여기서 `nexon` 을
 * 끌어오면 브라우저 번들에 수집기가 딸려 오고, 무엇보다 **계약이 수집 구현에 묶인다** —
 * 넥슨 응답 모양이 바뀌면 계약이 따라 흔들린다. 그 방향은 거꾸로여야 한다.
 *
 * 그래서 **구조적으로 동일한 타입을 여기 다시 선언**하고, `nexon` 의 `ClanHexTally` 는
 * 그대로 이 타입에 대입된다(TypeScript 는 구조적 타입이다). 두 곳이 어긋나면 `nexon` →
 * `contract` 방향으로 값을 넘기는 자리에서 컴파일 오류가 난다.
 *
 * **읽는 칸만 적지 않고 전부 적었다.** 일부만 적으면 «없는 칸» 과 «안 보는 칸» 이 구분되지
 * 않아, 나중에 해석이 바뀔 때 무엇을 재계산할 수 있는지 알 수 없게 된다.
 */
export interface ZoneCountLike {
  /** 잡은 사람(우리)이 서 있던 자리 — **화면이 쓰는 기준이다** (D-235 「남은 미확인」) */
  byKiller: number
  /** 죽은 상대 스나가 서 있던 자리 */
  byVictim: number
}

/** ① 스나싸움 */
export interface SniperFightTallyLike {
  redRounds: number
  foeSniperKills: number
  killsWithPosition: ZoneCountLike
  /** `A쪽` 구역 안. **구역을 안 주면 `null`** → 축이 `pending='zone'` */
  aSideKills: ZoneCountLike | null
  /** `B롱`(비롱) 구역 안 */
  bLongKills: ZoneCountLike | null
  unzonedKills: ZoneCountLike | null
}

/** ② 소수싸움 */
export interface OutnumberedTallyLike {
  rounds: number
  won: number
}

/** ③ 세이브 */
export interface SaveTallyLike {
  rounds: number
  won: number
}

/** ④ 게임템포 — ⚠ 초는 **전부 하한값이다** (라운드 시작 시각이 관측되지 않는다) */
export interface TempoTallyLike {
  redRounds: number
  redClearThreeRounds: number
  redClearThreeSecondsLowerBound: number[]
  redClearThreeSecondsLowerBoundSum: number
  redRoundsWithoutThreeClears: number
}

/** ⑤ B어택성공 */
export interface LastSniperTallyLike {
  redWonRounds: number
  redWonSniperLast: number
  wonRounds: number
  wonSniperLast: number
  noFoeDeathRounds: number
  unknownLastWeaponRounds: number
  ambiguousLastRounds: number
}

/** ⑥ A어택성공 */
export interface AttackZoneTallyLike {
  redRounds: number
  redWonRounds: number
  redWonZoneSniperRounds: ZoneCountLike
  redLostZoneSniperRounds: ZoneCountLike
  sniperKillsWithPosition: ZoneCountLike
  sniperKillsInNamedZone: ZoneCountLike
  sniperKillsOutsideNamedZone: ZoneCountLike
  /** 판정에 실제로 쓴 구역 이름. 넷 중 **둘**뿐이라는 사실을 값과 함께 남긴다 */
  zoneLabels: readonly string[]
}

/** 한 경기에서 **한 클랜**의 여섯 축 재료 */
export interface ClanHexTallyLike {
  teamNo: string
  foeTeamNo: string | null
  rounds: number
  sidedRounds: number
  redRounds: number
  foeSnipers: number
  sniperFight: SniperFightTallyLike | null
  outnumbered: OutnumberedTallyLike | null
  save: SaveTallyLike | null
  tempo: TempoTallyLike | null
  lastSniper: LastSniperTallyLike | null
  attackZone: AttackZoneTallyLike | null
}

/* -------------------------------------------------------------------------- */
/* 결과 모양                                                                     */
/* -------------------------------------------------------------------------- */

export interface ClanHexV2Axis {
  key: ClanHexV2AxisKey
  label: string
  /** 분자. 못 세면 `null` */
  numerator: number | null
  /** 분모. 못 세면 `null` */
  denominator: number | null
  /** 원값 — 비율(0~1) · 초 · 라운드당 킬수. 단위는 `CLAN_HEX_V2_AXIS_UNITS` */
  raw: number | null
  /** 0~1 정규화. **정규화를 거치기 전에는 항상 `null`** 이다 */
  value: number | null
  /** 화면에 그대로 적는 글자 — `'42%'` / `'18.3초'` / `'0.42킬'` / `'측정중'` */
  text: string
  /** 못 잰 이유. 잴 수 있었으면 `null` */
  pending: ClanHexV2PendingReason | null
}

export interface ClanHexV2 {
  /** 항상 6개 · `CLAN_HEX_V2_AXIS_KEYS` 순서 그대로 */
  axes: ClanHexV2Axis[]
  /**
   * 잰 축 수 (0~6). **`pending === null` 인 축을 센다.**
   *
   * `value` 로 세지 않는 이유: `buildClanHexV2Raw` 단계에서는 `value` 가 전부 `null` 이라
   * 언제나 0이 된다. `pending` 은 두 단계에서 같은 뜻을 유지한다 —
   * 정규화가 실패한 축에는 정규화 쪽에서 `pending` 을 채워 넣기 때문이다.
   */
  measured: number
  /** 합친 경기 수 */
  matches: number
  /** 이벤트로 확인된 라운드 수의 합 */
  rounds: number
  /** 그중 진영=레드(공격)인 라운드 수의 합 */
  redRounds: number
  /** ⑥ 이 실제로 쓴 구역 수 (지금 2) */
  zoneLabelsUsed: number
  /** 사용자가 말한 구역 수 (4) */
  zoneLabelsTotal: number
  formulaVersion: string
}

/* -------------------------------------------------------------------------- */
/* Zod — 응답 계약                                                               */
/* -------------------------------------------------------------------------- */

/** 0~1 정규화 값 (옛 판의 `Percent` 와 **자릿수가 다르다.** 여기는 0~1 이다) */
const Unit = z.number().min(0).max(1)

export const ClanHexagonV2Axis = z.object({
  key: z.enum(CLAN_HEX_V2_AXIS_KEYS),
  label: z.string(),
  numerator: z.number().nullable(),
  denominator: z.number().nullable(),
  /** 원값은 초·라운드당 킬수일 수 있어 **범위를 걸지 않는다** */
  raw: z.number().nullable(),
  value: Unit.nullable(),
  text: z.string(),
  pending: z.enum(CLAN_HEX_V2_PENDING_KEYS).nullable(),
})
export type ClanHexagonV2Axis = z.infer<typeof ClanHexagonV2Axis>

export const ClanHexagonV2 = z.object({
  axes: z.array(ClanHexagonV2Axis),
  measured: Count,
  matches: Count,
  rounds: Count,
  redRounds: Count,
  zoneLabelsUsed: Count,
  zoneLabelsTotal: Count,
  formulaVersion: z.string(),
})
export type ClanHexagonV2 = z.infer<typeof ClanHexagonV2>

/* -------------------------------------------------------------------------- */
/* 합산                                                                         */
/* -------------------------------------------------------------------------- */

const zeroZone = (): ZoneCountLike => ({ byKiller: 0, byVictim: 0 })

const addZone = (into: ZoneCountLike, from: ZoneCountLike): void => {
  into.byKiller += from.byKiller
  into.byVictim += from.byVictim
}

/**
 * 하위 tally 합산의 공통 뼈대.
 *
 * **하나라도 `null` 이 아니면 그것들만 더한다.** `null` 인 경기는 «못 쟀다» 이므로
 * 분모에도 넣지 않는다 (D-106). 전부 `null` 이면 결과도 `null` 이다.
 */
function sumParts<T>(
  parts: readonly (T | null)[],
  empty: () => T,
  add: (into: T, from: T) => void,
): T | null {
  const present = parts.filter((part): part is T => part !== null)
  if (present.length === 0) return null
  const into = empty()
  for (const part of present) add(into, part)
  return into
}

/**
 * 여러 경기의 tally 를 **분자/분모 단위로** 합친다. **비율을 평균 내지 않는다** (D-235 Q8).
 *
 * 빈 배열이면 «아무것도 못 잰» 빈 tally 를 돌려준다 — `buildClanHexV2Raw` 가 그걸 받으면
 * 여섯 축이 전부 `pending` 이 된다. `null` 을 돌려주지 않는 이유는, 부르는 쪽이
 * 「경기가 0건」과 「합산이 실패」를 구분할 필요가 없기 때문이다.
 *
 * `teamNo` 는 첫 tally 의 것을 쓴다. `foeTeamNo` 는 **전부 같을 때만** 남긴다 —
 * 시즌 전체를 합치면 상대가 여럿이므로 보통 `null` 이다. 그 칸은 경기 단위에서만 뜻이 있다.
 */
export function sumClanHexTallies(tallies: readonly ClanHexTallyLike[]): ClanHexTallyLike {
  const first = tallies[0]
  const foes = new Set(tallies.map((tally) => tally.foeTeamNo))
  const firstFoe = tallies.length > 0 ? (first?.foeTeamNo ?? null) : null

  const sum: ClanHexTallyLike = {
    teamNo: first?.teamNo ?? '',
    foeTeamNo: foes.size === 1 ? firstFoe : null,
    rounds: 0,
    sidedRounds: 0,
    redRounds: 0,
    foeSnipers: 0,
    sniperFight: null,
    outnumbered: null,
    save: null,
    tempo: null,
    lastSniper: null,
    attackZone: null,
  }

  for (const tally of tallies) {
    sum.rounds += tally.rounds
    sum.sidedRounds += tally.sidedRounds
    sum.redRounds += tally.redRounds
    /* 경기마다 다른 사람이므로 **합이 인원수가 아니다.** 「스나를 짚은 경기가 있었나」를
       0/양수로 알아보는 용도로만 쓴다 */
    sum.foeSnipers += tally.foeSnipers
  }

  sum.sniperFight = sumParts(
    tallies.map((tally) => tally.sniperFight),
    (): SniperFightTallyLike => ({
      redRounds: 0,
      foeSniperKills: 0,
      killsWithPosition: zeroZone(),
      aSideKills: null,
      bLongKills: null,
      unzonedKills: null,
    }),
    (into, from) => {
      into.redRounds += from.redRounds
      into.foeSniperKills += from.foeSniperKills
      addZone(into.killsWithPosition, from.killsWithPosition)
      /* 구역을 준 경기만 그 칸을 만든다 — 안 준 경기를 0 으로 섞으면 값이 낮아진다 */
      for (const key of ['aSideKills', 'bLongKills', 'unzonedKills'] as const) {
        const part = from[key]
        if (part === null) continue
        into[key] ??= zeroZone()
        addZone(into[key] as ZoneCountLike, part)
      }
    },
  )

  sum.outnumbered = sumParts(
    tallies.map((tally) => tally.outnumbered),
    (): OutnumberedTallyLike => ({ rounds: 0, won: 0 }),
    (into, from) => {
      into.rounds += from.rounds
      into.won += from.won
    },
  )

  sum.save = sumParts(
    tallies.map((tally) => tally.save),
    (): SaveTallyLike => ({ rounds: 0, won: 0 }),
    (into, from) => {
      into.rounds += from.rounds
      into.won += from.won
    },
  )

  sum.tempo = sumParts(
    tallies.map((tally) => tally.tempo),
    (): TempoTallyLike => ({
      redRounds: 0,
      redClearThreeRounds: 0,
      redClearThreeSecondsLowerBound: [],
      redClearThreeSecondsLowerBoundSum: 0,
      redRoundsWithoutThreeClears: 0,
    }),
    (into, from) => {
      into.redRounds += from.redRounds
      into.redClearThreeRounds += from.redClearThreeRounds
      /* 라운드별 초를 **버리지 않는다.** 나중에 중앙값·분포로 다시 볼 수 있어야 한다 */
      into.redClearThreeSecondsLowerBound.push(...from.redClearThreeSecondsLowerBound)
      into.redClearThreeSecondsLowerBoundSum += from.redClearThreeSecondsLowerBoundSum
      into.redRoundsWithoutThreeClears += from.redRoundsWithoutThreeClears
    },
  )

  sum.lastSniper = sumParts(
    tallies.map((tally) => tally.lastSniper),
    (): LastSniperTallyLike => ({
      redWonRounds: 0,
      redWonSniperLast: 0,
      wonRounds: 0,
      wonSniperLast: 0,
      noFoeDeathRounds: 0,
      unknownLastWeaponRounds: 0,
      ambiguousLastRounds: 0,
    }),
    (into, from) => {
      into.redWonRounds += from.redWonRounds
      into.redWonSniperLast += from.redWonSniperLast
      into.wonRounds += from.wonRounds
      into.wonSniperLast += from.wonSniperLast
      into.noFoeDeathRounds += from.noFoeDeathRounds
      into.unknownLastWeaponRounds += from.unknownLastWeaponRounds
      into.ambiguousLastRounds += from.ambiguousLastRounds
    },
  )

  sum.attackZone = sumParts(
    tallies.map((tally) => tally.attackZone),
    (): AttackZoneTallyLike => ({
      redRounds: 0,
      redWonRounds: 0,
      redWonZoneSniperRounds: zeroZone(),
      redLostZoneSniperRounds: zeroZone(),
      sniperKillsWithPosition: zeroZone(),
      sniperKillsInNamedZone: zeroZone(),
      sniperKillsOutsideNamedZone: zeroZone(),
      zoneLabels: [],
    }),
    (into, from) => {
      into.redRounds += from.redRounds
      into.redWonRounds += from.redWonRounds
      addZone(into.redWonZoneSniperRounds, from.redWonZoneSniperRounds)
      addZone(into.redLostZoneSniperRounds, from.redLostZoneSniperRounds)
      addZone(into.sniperKillsWithPosition, from.sniperKillsWithPosition)
      addZone(into.sniperKillsInNamedZone, from.sniperKillsInNamedZone)
      addZone(into.sniperKillsOutsideNamedZone, from.sniperKillsOutsideNamedZone)
      /* 구역 이름은 **합집합**이다. 경기마다 다른 구역을 썼다면 그 사실이 남아야 한다 */
      const labels = [...into.zoneLabels]
      for (const label of from.zoneLabels) if (!labels.includes(label)) labels.push(label)
      into.zoneLabels = labels
    },
  )

  return sum
}

/* -------------------------------------------------------------------------- */
/* 원값                                                                         */
/* -------------------------------------------------------------------------- */

/** 화면 글자. **`raw` 가 `null` 이면 언제나 `측정중`** 이다 */
export function clanHexV2Text(key: ClanHexV2AxisKey, raw: number | null): string {
  if (raw === null) return CLAN_HEX_V2_PENDING_LABEL
  switch (CLAN_HEX_V2_AXIS_UNITS[key]) {
    case 'ratio':
      return `${Math.round(raw * 100)}%`
    case 'seconds':
      return `${raw.toFixed(1)}초`
    /* 라운드당 킬수는 1을 넘을 수 있어 `%` 로 못 적는다 (`CLAN_HEX_V2_AXIS_UNITS` 주석) */
    case 'perRound':
      return `${raw.toFixed(2)}킬`
  }
}

/** 못 잰 축 한 칸 */
function pendingAxis(
  key: ClanHexV2AxisKey,
  pending: ClanHexV2PendingReason,
  parts?: { numerator?: number | null; denominator?: number | null },
): ClanHexV2Axis {
  return {
    key,
    label: CLAN_HEX_V2_AXIS_LABELS[key],
    numerator: parts?.numerator ?? null,
    denominator: parts?.denominator ?? null,
    raw: null,
    value: null,
    text: CLAN_HEX_V2_PENDING_LABEL,
    pending,
  }
}

/** 잰 축 한 칸. **`value` 는 아직 `null` 이다** — 정규화는 다음 단계다 */
function measuredAxis(
  key: ClanHexV2AxisKey,
  numerator: number,
  denominator: number,
): ClanHexV2Axis {
  const raw = numerator / denominator
  return {
    key,
    label: CLAN_HEX_V2_AXIS_LABELS[key],
    numerator,
    denominator,
    raw,
    value: null,
    text: clanHexV2Text(key, raw),
    pending: null,
  }
}

/**
 * 하위 tally 가 `null` 일 때 이유를 고른다.
 *
 * `nexon` 쪽은 `restorable`(라운드 복원)과 `sniperKnown`(상대 스나 확정) 두 관문으로
 * `null` 을 만든다. 여기서는 그 둘을 되짚을 수 없으므로 **`foeSnipers` 로 가른다** —
 * 0이면 스나를 못 짚은 것이고, 아니면 배틀로그가 온전치 않았던 것이다.
 */
function tallyMissingReason(tally: ClanHexTallyLike, needsSniper: boolean): ClanHexV2PendingReason {
  if (needsSniper && tally.foeSnipers === 0) return 'foeSniper'
  return 'battlelog'
}

/**
 * 합친 tally → **원값(raw)까지**. `value` 는 `null` 이다 (정규화가 아직 안 됐다).
 *
 * 축별 분자/분모는 **D-235 를 그대로 옮긴 것**이다. 임의로 바꾸지 않는다.
 *
 * ```
 * ① sniperFight  aSideKills.byKiller + bLongKills.byKiller   / redRounds       라운드당 킬수
 * ② outnumbered  won                                          / rounds          비율
 * ③ save         won                                          / rounds          비율
 * ④ tempo        redClearThreeSecondsLowerBoundSum            / redClearThreeRounds   초 (짧을수록 좋다)
 * ⑤ lastSniper   redWonSniperLast                             / redWonRounds    비율
 * ⑥ attackZone   redWonZoneSniperRounds.byKiller              / redWonRounds    비율
 * ```
 *
 * 분모가 0이면 **`0` 이 아니라 `pending='sample'`** 이다. 나눌 수 없는 것과
 * 「겪었는데 한 번도 못 했다」(=0)는 다른 말이다 (D-106).
 */
export function buildClanHexV2Raw(input: {
  tally: ClanHexTallyLike | null
  matches: number
  config?: ClanHexV2Config
}): ClanHexV2 {
  const config = input.config ?? CLAN_HEX_V2_CONFIG
  const tally = input.tally

  const axes: ClanHexV2Axis[] = CLAN_HEX_V2_AXIS_KEYS.map((key) => {
    if (tally === null) return pendingAxis(key, 'battlelog')
    switch (key) {
      case 'sniperFight': {
        const part = tally.sniperFight
        if (part === null) return pendingAxis(key, tallyMissingReason(tally, true))
        /* 구역을 안 준 경기는 자리를 나눌 수 없다. 0 으로 세면 «안 잡았다» 가 된다 */
        if (part.aSideKills === null || part.bLongKills === null) {
          return pendingAxis(key, 'zone', { denominator: part.redRounds })
        }
        if (part.redRounds === 0) return pendingAxis(key, 'side')
        return measuredAxis(
          key,
          part.aSideKills.byKiller + part.bLongKills.byKiller,
          part.redRounds,
        )
      }
      case 'outnumbered': {
        const part = tally.outnumbered
        if (part === null) return pendingAxis(key, tallyMissingReason(tally, false))
        /* ②③ 은 진영을 보지 않는다 (D-202) — 그래서 `side` 가 아니라 `sample` 이다 */
        if (part.rounds === 0) return pendingAxis(key, 'sample', { numerator: part.won })
        return measuredAxis(key, part.won, part.rounds)
      }
      case 'save': {
        const part = tally.save
        if (part === null) return pendingAxis(key, tallyMissingReason(tally, false))
        if (part.rounds === 0) return pendingAxis(key, 'sample', { numerator: part.won })
        return measuredAxis(key, part.won, part.rounds)
      }
      case 'tempo': {
        const part = tally.tempo
        if (part === null) return pendingAxis(key, tallyMissingReason(tally, false))
        if (part.redRounds === 0) return pendingAxis(key, 'side')
        /* 3명을 못 지운 라운드는 **분모에서 뺐다** (D-235 Q4). 하나도 없으면 못 잰다 */
        if (part.redClearThreeRounds === 0) return pendingAxis(key, 'sample')
        return measuredAxis(
          key,
          part.redClearThreeSecondsLowerBoundSum,
          part.redClearThreeRounds,
        )
      }
      case 'lastSniper': {
        const part = tally.lastSniper
        if (part === null) return pendingAxis(key, tallyMissingReason(tally, true))
        if (tally.redRounds === 0) return pendingAxis(key, 'side')
        if (part.redWonRounds === 0) {
          return pendingAxis(key, 'sample', { numerator: part.redWonSniperLast })
        }
        return measuredAxis(key, part.redWonSniperLast, part.redWonRounds)
      }
      case 'attackZone': {
        const part = tally.attackZone
        /* `null` 은 «상대 스나를 못 짚었다» 이거나 «구역을 안 줬다» 둘 중 하나다 */
        if (part === null) {
          return pendingAxis(key, tally.foeSnipers === 0 ? 'foeSniper' : 'zone')
        }
        if (part.redRounds === 0) return pendingAxis(key, 'side')
        if (part.redWonRounds === 0) {
          return pendingAxis(key, 'sample', { numerator: part.redWonZoneSniperRounds.byKiller })
        }
        return measuredAxis(key, part.redWonZoneSniperRounds.byKiller, part.redWonRounds)
      }
    }
  })

  return {
    axes,
    measured: axes.filter((axis) => axis.pending === null).length,
    matches: input.matches,
    rounds: tally?.rounds ?? 0,
    redRounds: tally?.redRounds ?? 0,
    zoneLabelsUsed: tally?.attackZone?.zoneLabels.length ?? 0,
    zoneLabelsTotal: CLAN_HEX_V2_ZONE_LABELS_TOTAL,
    formulaVersion: config.formulaVersion,
  }
}

/* -------------------------------------------------------------------------- */
/* 정규화 ① — 경기 상세 (D-235 Q7)                                               */
/* -------------------------------------------------------------------------- */

const cloneAxis = (axis: ClanHexV2Axis): ClanHexV2Axis => ({ ...axis })

const withAxes = (hex: ClanHexV2, axes: ClanHexV2Axis[]): ClanHexV2 => ({
  ...hex,
  axes,
  measured: axes.filter((axis) => axis.pending === null).length,
})

/**
 * **경기 상세용.** 그 경기 두 클랜 중 **큰 쪽을 1.0** 으로 두고 나머지를 비율로 (D-235 Q7).
 *
 * 한 경기는 표본이 1이라 리그 백분위를 쓸 수 없고, 고정 상한을 우리가 정하면 그건
 * **지어낸 값**이다. 사용자 원문이 *"크기차이로 비교하기 편하게끔"* 이라 했으므로
 * 상대 비교가 그 말 그대로다.
 *
 * - **게임템포는 뒤집는다** — 짧을수록 좋으므로 `작은 쪽`이 1.0 이다
 * - 한쪽만 값이 있는 축은 **양쪽 다 `null`** 이고, 값이 있던 쪽에 `pending='compare'` 를 준다.
 *   혼자만 꽉 찬 육각형은 «잘한다» 가 아니라 «상대를 못 쟀다» 이기 때문이다
 * - 둘 다 0이면 둘 다 0이다. 0은 실제 관측이므로 `null` 로 바꾸지 않는다
 *
 * `raw` · `numerator` · `denominator` · `text` 는 **건드리지 않는다.** 화면은 여전히
 * `18.3초` 를 적어야 한다. 바뀌는 것은 `value` 와 (필요하면) `pending` 뿐이다.
 */
export function normalizeAgainstFoe(
  ours: ClanHexV2,
  theirs: ClanHexV2,
): [ClanHexV2, ClanHexV2] {
  const ourAxes = ours.axes.map(cloneAxis)
  const foeAxes = theirs.axes.map(cloneAxis)

  for (const key of CLAN_HEX_V2_AXIS_KEYS) {
    const a = ourAxes.find((axis) => axis.key === key)
    const b = foeAxes.find((axis) => axis.key === key)
    if (a === undefined || b === undefined) continue

    if (a.raw === null && b.raw === null) continue
    if (a.raw === null || b.raw === null) {
      /* 값이 있는 쪽만 남았다 — 겹쳐 그릴 수 없으므로 그리지 않는다 */
      for (const axis of [a, b]) {
        if (axis.raw === null) continue
        axis.value = null
        axis.pending = 'compare'
      }
      continue
    }

    if (CLAN_HEX_V2_LOWER_IS_BETTER[key]) {
      const best = Math.min(a.raw, b.raw)
      /* 0초는 있을 수 없지만, 있어도 «가장 빠름»이다. 0으로 나누지 않는다 */
      a.value = a.raw === 0 ? 1 : best / a.raw
      b.value = b.raw === 0 ? 1 : best / b.raw
    } else {
      const best = Math.max(a.raw, b.raw)
      /* 둘 다 0이면 둘 다 0이다 — «겪었는데 한 번도 못 했다» 는 실제 관측이다 */
      a.value = best === 0 ? 0 : a.raw / best
      b.value = best === 0 ? 0 : b.raw / best
    }
  }

  return [withAxes(ours, ourAxes), withAxes(theirs, foeAxes)]
}

/* -------------------------------------------------------------------------- */
/* 정규화 ② — 클랜 페이지 (D-235 Q8)                                             */
/* -------------------------------------------------------------------------- */

/**
 * **클랜 페이지용.** 같은 리그 표본들 안에서의 **백분위(0~1)** (D-235 Q8).
 *
 * 클랜 페이지는 표본이 여럿이라 백분위가 선다. 축마다 모집단이 다르다 —
 * 어떤 클랜은 ④ 를 못 재고 ② 만 잴 수 있기 때문이다. **축별로 따로 센다.**
 *
 * 두 가지 문턱이 있고 **둘 다 넘어야** 값이 나온다.
 *
 * ```
 * minDenominator   그 축의 분모(라운드 수)가 이만큼은 돼야 한다      D-235 Q8 = 20
 * minSamples       견줄 클랜이 이만큼은 있어야 한다                  = 5
 * ```
 *
 * 못 넘으면 `value=null` · `pending='sample'` 이다. **0 으로 찍지 않는다** — 0은 꼴찌라는
 * 뜻이고, 여기서는 «아직 모른다» 이다 (D-106).
 *
 * `leagueSamples` 에 `target` 이 들어 있어도 된다. **여기서 넣거나 빼지 않는다** —
 * 모집단을 무엇으로 볼지는 부르는 쪽(질의)이 정하는 일이다.
 */
export function normalizeByPercentile(
  target: ClanHexV2,
  leagueSamples: readonly ClanHexV2[],
  opts?: { minSamples?: number; minDenominator?: number },
): ClanHexV2 {
  const minSamples = opts?.minSamples ?? CLAN_HEX_V2_MIN_SAMPLES
  const minDenominator = opts?.minDenominator ?? CLAN_HEX_V2_CONFIG.minDenominator

  /**
   * 표본으로 쓸 수 있는 원값 — 재료가 있고 분모가 문턱을 넘었을 때만.
   *
   * `0` 은 그대로 돌려준다. **0 은 실제 관측이고 「없음」이 아니다** (D-106).
   */
  const rawIfUsable = (axis: ClanHexV2Axis | undefined): number | null => {
    if (axis === undefined || axis.raw === null) return null
    if (axis.denominator === null || axis.denominator < minDenominator) return null
    return axis.raw
  }

  const axes = target.axes.map((axis) => {
    const next = cloneAxis(axis)
    const raw = rawIfUsable(next)
    if (raw === null) {
      /* 이미 못 잰 축이면 그 이유를 유지한다. 잰 값인데 분모가 모자라면 `sample` 이다 */
      next.value = null
      if (next.pending === null) next.pending = 'sample'
      return next
    }

    const cohort: number[] = []
    for (const sample of leagueSamples) {
      const other = rawIfUsable(sample.axes.find((entry) => entry.key === axis.key))
      if (other !== null) cohort.push(other)
    }
    if (cohort.length < minSamples) {
      next.value = null
      next.pending = 'sample'
      return next
    }

    /* 작을수록 좋은 축은 부호를 뒤집어 재고, 그러면 큰 백분위가 곧 잘함이 된다 */
    const sign = CLAN_HEX_V2_LOWER_IS_BETTER[axis.key] ? -1 : 1
    const sorted = cohort.map((value) => value * sign).sort((a, b) => a - b)
    const percentile = percentileOf(sorted, raw * sign)
    if (percentile === null) {
      next.value = null
      next.pending = 'sample'
      return next
    }
    /* `percentileOf` 는 0~100 이다. 육각형은 0~1 을 쓴다 */
    next.value = percentile / 100
    next.pending = null
    return next
  })

  return withAxes(target, axes)
}
