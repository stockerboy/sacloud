/**
 * 클랜페이지 **배틀로그 지표** — 라운드를 복원해야만 잴 수 있는 것들
 * (`docs/SITE_SPEC_V2.md` 5-5절).
 *
 * ```
 * 블루방어율   "평균적으로 블루 5라운드중 1.7라운드를 허용"
 * 어택성공률   "평균적으로 레드 5라운드중 2.6라운드를 따고 폭탄설치 1.4번 성공"
 * 조직력       "레드 라운드 시작 후 … 평균 30초가 넘는 시간동안 아무도 죽지 않은 횟수"
 * 폭발력       "레드선수들이 2초이하 단위로 상대팀을 3명이상 제거한 횟수"
 * 게임템포     "레드일 때 라운드가 빨리 끝날수록 높다"
 * 클린시트     "800판중 120회" — 반코트(한 진영에서 5라운드 전승)
 * ```
 *
 * **원본(3rd.supply)에 없는 화면이다.** 사용자 지시로 만든 신규 지표이고
 * `CLAUDE.md` 3장 3번(임의 기능 추가 금지)의 명시적 예외다 — 육각형(D-185) ·
 * 클랜 지표(`clanMetrics.ts`)와 같은 취급이다. 원본과 동일함이 검증되지 않았다.
 *
 * ── 왜 계약에 두는가
 *   실제 서버(`apps/web/lib/server/queries/clanRoundMetrics.ts`)와
 *   Mock(`packages/mock/src/store.ts`)이 **같은 함수**를 부른다. 두 곳에서 따로 판정하면
 *   mock↔live 대조가 조용히 어긋난다 (`clanMetrics.ts` 와 같은 구조다).
 *
 * ── 세는 규칙은 여기 없다
 *   분자·분모는 `@sacloud/nexon` 의 순수 함수가 배틀로그에서 세고
 *   (`packages/nexon/src/clanRound.ts`), 잡이 `ClanRoundProfile` 에 쌓는다
 *   (`apps/worker/src/jobs/clanRoundBuild.ts`). 이 파일은 그 분자·분모를 받아
 *   **비율과 표시 판정만** 만든다.
 *
 * ── 모르는 값을 0 으로 채우지 않는다 (D-106)
 *   진영을 모르는 라운드는 **분모에서도 뺐다.** 그래서 표본이 얇고, 얇은 만큼 값이
 *   흔들린다. 최소 표본에 못 미치면 비율은 `null` 이고 화면은 `측정중` 이다 —
 *   **0% 가 아니다.** 0% 는 "한 라운드도 못 막았다" 는 뜻이라 못 잰 클랜이
 *   최악의 성적으로 보인다.
 *
 * ── 표본이 얼마나 얇은지 (2026-08-30 실측 · 로컬)
 *   ```
 *   클랜 단위 배틀로그 원문        3,942줄
 *     그중 모집단(래더+시즌창) 안   1,526줄
 *       그중 진영 교대를 확인        220줄   ← 지표에 실제로 쓴 몫
 *   본 라운드 17,780 · 진영을 알아 쓴 라운드 1,816 (10.2%)
 *   ```
 */
import { z } from 'zod'
import { Count, Percent } from './common'
import { percentileOf } from './traits'

/* -------------------------------------------------------------------------- */
/* 최소 표본                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * 비율 한 축을 보여 주기 시작하는 최소 **라운드** 수.
 *
 * 판수가 아니라 라운드 수다 — 한 경기에서 진영을 아는 라운드가 두세 개뿐인 경우가
 * 흔해서, 판수로 재면 "10판 봤는데 라운드는 12개" 같은 일이 생긴다.
 *
 * 20 이면 `블루 5라운드중 n라운드` 의 눈금이 0.25라운드다. 10 이면 0.5라운드까지
 * 밖에 못 나눠 값이 계단처럼 튄다.
 *
 * > `[미확인]` 사양에 숫자가 없다. 20은 우리가 고른 값이고 **원본과 동일함이
 * > 검증되지 않았다** (`CLAUDE.md` 3장 7번).
 * > 실측(2026-08-30 · 로컬): 이 선을 넘는 클랜이 수비 20팀 · 공격 15팀이다.
 */
export const CLAN_ROUND_MIN_ROUNDS = 20

/**
 * 게임템포의 중앙값을 내기 시작하는 최소 라운드 수.
 *
 * > `[미확인]` 위와 같은 이유로 20이다. 실측에서 이 선을 넘는 클랜은
 * > `sanply` 8팀 · `supply` 5팀이었다.
 */
export const CLAN_TEMPO_MIN_ROUNDS = 20

/**
 * 템포 **백분위**를 내려면 같은 리그에 견줄 클랜이 최소 이만큼은 있어야 한다.
 *
 * 모집단이 1팀이면 `percentileOf` 는 **항상 50** 이고 2팀이면 25 아니면 75다.
 * 그걸 `상위 50%` 라고 적으면 "혼자 잰 값" 이 "절반보다 빠르다" 로 읽힌다.
 *
 * > `[미확인]` 선수 육각형은 20팀/명을 쓴다(`TRAIT_MIN_COHORT`). 여기서 그 값을 쓰면
 * > **어느 리그도 못 넘긴다** — 실측 최대가 8팀이다. 그래서 5로 낮췄고, 그만큼
 * > 백분위가 거칠다는 사실을 화면이 `n팀 중` 으로 함께 적는다.
 */
export const CLAN_TEMPO_MIN_COHORT = 5

/**
 * 클린시트(반코트) 비율을 보여 주기 시작하는 최소 **경기** 수.
 *
 * 이쪽만 라운드가 아니라 경기 단위다 — 원문 표기가 `800판중 120회` 다.
 *
 * > `[미확인]` 우리가 고른 값이다. 실측에서 이 선을 넘는 클랜이 11팀이다.
 */
export const CLAN_CLEAN_SHEET_MIN_MATCHES = 5

/** 사양이 쓰는 표기 단위 — `5라운드중 n라운드` */
export const CLAN_ROUND_PER = 5

/* -------------------------------------------------------------------------- */
/* 스키마                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * 표본 — **이 값들이 몇 판, 몇 라운드를 보고 나온 것인가.**
 *
 * 화면에 반드시 함께 적는다. 진영을 모르는 라운드를 분모에서 뺐기 때문에,
 * 표본 크기를 감추면 "10라운드로 잰 82%" 와 "500라운드로 잰 82%" 가 같아 보인다.
 */
export const ClanRoundSample = z.object({
  /** 배틀로그가 있고 모집단 안이라 훑은 경기 수 */
  matches: Count,
  /** 그중 진영 교대를 확인해 **실제로 지표에 쓴** 경기 수 */
  sided_matches: Count,
  /** 이벤트로 확인된 라운드 수 */
  rounds_total: Count,
  /** 그중 진영을 알아 실제로 쓴 라운드 수 */
  rounds_known: Count,
})
export type ClanRoundSample = z.infer<typeof ClanRoundSample>

/**
 * 블루방어율 — 수비(블루) 라운드를 얼마나 지켰나.
 *
 * `rate` 는 **막은 비율**이다 (원문 "블루방어율 n%"). `conceded_per5` 가
 * 원문의 설명 줄(`평균적으로 블루 5라운드중 1.7라운드를 허용`)에 해당한다.
 */
export const ClanBlueDefense = z.object({
  rounds: Count,
  conceded: Count,
  /** 표본이 모자라면 `null`. **0% 로 채우지 않는다** (D-106) */
  rate: Percent.nullable(),
  /** `5라운드중 n라운드를 허용` */
  conceded_per5: z.number().min(0).max(CLAN_ROUND_PER).nullable(),
})
export type ClanBlueDefense = z.infer<typeof ClanBlueDefense>

/**
 * 어택성공률 — 공격(레드) 라운드를 얼마나 땄나 + 폭탄을 몇 번 심었나.
 *
 * 라운드 승패의 분모(`rounds`)와 설치의 분모(`plant_rounds`)가 다르다.
 * 승패를 모르는 라운드는 앞의 분모에서만 빠지고, 설치는 승패를 안 봐도 세기 때문이다.
 */
export const ClanAttack = z.object({
  rounds: Count,
  won: Count,
  rate: Percent.nullable(),
  /** `5라운드중 n라운드를 딴다` */
  won_per5: z.number().min(0).max(CLAN_ROUND_PER).nullable(),
  /** 설치의 분모 — 진영이 공격인 라운드 전체 */
  plant_rounds: Count,
  plants: Count,
  /** `폭탄설치 n번 성공` (5라운드 기준) */
  plant_per5: z.number().min(0).max(CLAN_ROUND_PER).nullable(),
})
export type ClanAttack = z.infer<typeof ClanAttack>

/**
 * 조직력 · 폭발력 — 둘 다 원문이 **"횟수"** 다.
 *
 * 횟수만으로는 클랜끼리 견줄 수 없다 — 많이 뛴 클랜이 무조건 크다.
 * 그래서 `count`(원문 그대로)와 `per5`(5라운드당 몇 번)를 함께 낸다.
 */
export const ClanRoundEventRate = z.object({
  /** 잰 공격 라운드 수 */
  rounds: Count,
  /** 원문이 말하는 **횟수** */
  count: Count,
  /** 5라운드당 몇 번. 표본이 모자라면 `null` */
  per5: z.number().min(0).nullable(),
})
export type ClanRoundEventRate = z.infer<typeof ClanRoundEventRate>

/**
 * 게임템포 — 공격 라운드 길이의 **중앙값**과 같은 리그 안에서의 백분위.
 *
 * ── 왜 중앙값인가 (사용자가 "더 좋은 판별법 있으면 제시해" 라고 열어 둔 자리)
 *   평균은 한 라운드가 늘어지면 통째로 끌려간다. 폭탄이 심긴 뒤 40초를 버티는
 *   라운드 하나가 평균을 10초씩 밀어 올린다. 중앙값은 그 한 판에 흔들리지 않는다.
 *
 * ── 왜 백분위인가
 *   "72초" 는 그 자체로 빠른지 느린지 알 수 없다. 원문이 `게임템포:n%` 라고 적은 것도
 *   절대 초가 아니라 **상대 위치**를 뜻한다고 읽었다. 같은 리그 클랜들 안에서 잰다 —
 *   리그가 다르면 판형과 실력대가 달라 견줄 수 없다.
 *
 *   **빠를수록 높다.** 중앙값이 작을수록 백분위가 크다.
 */
export const ClanTempo = z.object({
  /** 중앙값을 만든 라운드 수 */
  rounds: Count,
  /** 라운드 길이 중앙값(초). 표본이 모자라면 `null` */
  median_seconds: z.number().min(0).nullable(),
  /** 같은 리그 클랜들 안에서의 백분위(0~100). 견줄 클랜이 모자라면 `null` */
  percentile: Percent.nullable(),
  /** 그 백분위를 만든 클랜 수 — 화면이 `n팀 중` 이라고 적는다 */
  cohort: Count,
})
export type ClanTempo = z.infer<typeof ClanTempo>

/**
 * 클린시트(반코트) — 같은 진영으로 연속 5라운드를 전승한 경기.
 *
 * > `[미확인]` 원문 `클린시트(반코트):800판중 120회 n%` 가 "반쪽 5-0" 을 뜻했는지
 * > "한 진영에서 5연승" 을 뜻했는지 확정되지 않았다. 실측에서 전·후반이 5라운드씩이
 * > **아니었기 때문에**(`clanRoundBuild.ts` 주석의 분포 참조) 판형에 기대지 않는
 * > 뒤쪽으로 읽었다.
 */
export const ClanCleanSheet = z.object({
  /** 판정이 가능했던 경기 수 (분모) */
  matches: Count,
  /** 그중 전승한 경기 수 */
  count: Count,
  rate: Percent.nullable(),
})
export type ClanCleanSheet = z.infer<typeof ClanCleanSheet>

/** 클랜페이지가 한 번에 받는 배틀로그 지표 묶음 */
export const ClanRoundMetrics = z.object({
  sample: ClanRoundSample,
  blue_defense: ClanBlueDefense,
  attack: ClanAttack,
  organized: ClanRoundEventRate,
  burst: ClanRoundEventRate,
  tempo: ClanTempo,
  clean_sheet: ClanCleanSheet,
})
export type ClanRoundMetrics = z.infer<typeof ClanRoundMetrics>

/* -------------------------------------------------------------------------- */
/* 입력 — 실제 서버와 Mock 이 **같은 모양**으로 맞춰 넣는다                          */
/* -------------------------------------------------------------------------- */

/**
 * `ClanRoundProfile` 한 줄의 분자·분모.
 *
 * 칸 이름이 DB 모델과 같다. 여기서 이름을 바꾸면 두 곳을 맞춰 읽는 사람이 헷갈린다.
 */
export interface ClanRoundTallyInput {
  matches: number
  sidedMatches: number
  roundsTotal: number
  roundsKnown: number
  defenseRounds: number
  defenseConceded: number
  attackRounds: number
  attackWon: number
  attackSideRounds: number
  plantRounds: number
  organizedRounds: number
  organizedHeld: number
  burstRounds: number
  bursts: number
  /** 템포에 쓸 라운드 수와 중앙값. 어느 잣대(span/gap)를 쓸지는 부르는 쪽이 고른다 */
  tempoRounds: number
  tempoMedian: number | null
  cleanSheetMatches: number
  cleanSheets: number
}

/* -------------------------------------------------------------------------- */
/* 판정                                                                        */
/* -------------------------------------------------------------------------- */

/** 소수점 1자리 백분율. 분모가 최소 표본에 못 미치면 `null` (D-106) */
function rateOf(numerator: number, denominator: number, min: number): number | null {
  if (denominator < min || denominator <= 0) return null
  return Math.round((numerator / denominator) * 1000) / 10
}

/**
 * `5라운드중 n라운드` — 분모가 모자라면 `null`.
 *
 * 자릿수를 받는 이유: 방어·공격은 사양 표기가 `1.7` · `2.6` 이라 한 자리면 되지만,
 * 조직력·폭발력은 5라운드당 0.05회 같은 값이라 한 자리로 자르면 **`0` 이 된다.**
 * 실제로 센 횟수가 있는데 `0` 으로 보이면 "한 번도 없었다" 로 읽힌다 (D-106).
 */
function per5Of(
  numerator: number,
  denominator: number,
  min: number,
  digits = 1,
): number | null {
  if (denominator < min || denominator <= 0) return null
  const factor = 10 ** digits
  return Math.round((numerator / denominator) * CLAN_ROUND_PER * factor) / factor
}

/** 조직력·폭발력처럼 5라운드당 값이 아주 작은 축의 자릿수 */
const EVENT_PER5_DIGITS = 2

/**
 * 템포 백분위 — **빠를수록 높다.**
 *
 * `percentileOf` 는 값이 클수록 높은 백분위를 준다. 템포는 반대라 부호를 뒤집어
 * 넣는다. `100 - percentile` 로 뒤집지 않는 이유: 동점을 절반씩 나누는 mid-rank
 * 처리가 두 번 뒤집히면서 어긋난다.
 *
 * 견줄 클랜이 `CLAN_TEMPO_MIN_COHORT` 에 못 미치면 `null` 이다.
 */
export function clanTempoPercentile(
  median: number | null,
  cohortMedians: readonly number[],
): number | null {
  if (median === null) return null
  if (cohortMedians.length < CLAN_TEMPO_MIN_COHORT) return null
  const sorted = cohortMedians.map((value) => -value).sort((a, b) => a - b)
  return percentileOf(sorted, -median)
}

/**
 * 배틀로그 지표 묶음.
 *
 * 재료가 하나도 없으면(`sidedMatches === 0`) `null` 이다 — 전부 `측정중` 인 빈 카드를
 * 그리지 않는다. 그 클랜은 **아직 배틀로그로 잰 것이 하나도 없다**는 뜻이고,
 * 화면은 카드 자체를 그리지 않는다 (`clanMetrics` 가 `null` 을 쓰는 방식과 같다).
 *
 * `tempoCohort` 는 **같은 리그** 클랜들의 템포 중앙값이다. 자기 자신도 들어 있어야
 * 백분위가 자기 위치를 제대로 잡는다.
 */
export function buildClanRoundMetrics(input: {
  tally: ClanRoundTallyInput
  tempoCohort: readonly number[]
}): ClanRoundMetrics | null {
  const t = input.tally
  if (t.sidedMatches <= 0) return null

  const tempoMedian = t.tempoRounds >= CLAN_TEMPO_MIN_ROUNDS ? t.tempoMedian : null
  const percentile = clanTempoPercentile(tempoMedian, input.tempoCohort)

  return {
    sample: {
      matches: t.matches,
      sided_matches: t.sidedMatches,
      rounds_total: t.roundsTotal,
      rounds_known: t.roundsKnown,
    },
    blue_defense: {
      rounds: t.defenseRounds,
      conceded: t.defenseConceded,
      /* 방어율이므로 **막은** 비율이다 */
      rate: rateOf(t.defenseRounds - t.defenseConceded, t.defenseRounds, CLAN_ROUND_MIN_ROUNDS),
      conceded_per5: per5Of(t.defenseConceded, t.defenseRounds, CLAN_ROUND_MIN_ROUNDS),
    },
    attack: {
      rounds: t.attackRounds,
      won: t.attackWon,
      rate: rateOf(t.attackWon, t.attackRounds, CLAN_ROUND_MIN_ROUNDS),
      won_per5: per5Of(t.attackWon, t.attackRounds, CLAN_ROUND_MIN_ROUNDS),
      plant_rounds: t.attackSideRounds,
      plants: t.plantRounds,
      plant_per5: per5Of(t.plantRounds, t.attackSideRounds, CLAN_ROUND_MIN_ROUNDS),
    },
    organized: {
      rounds: t.organizedRounds,
      count: t.organizedHeld,
      per5: per5Of(
        t.organizedHeld,
        t.organizedRounds,
        CLAN_ROUND_MIN_ROUNDS,
        EVENT_PER5_DIGITS,
      ),
    },
    burst: {
      rounds: t.burstRounds,
      count: t.bursts,
      per5: per5Of(t.bursts, t.burstRounds, CLAN_ROUND_MIN_ROUNDS, EVENT_PER5_DIGITS),
    },
    tempo: {
      rounds: t.tempoRounds,
      median_seconds: tempoMedian,
      percentile,
      cohort: input.tempoCohort.length,
    },
    clean_sheet: {
      matches: t.cleanSheetMatches,
      count: t.cleanSheets,
      rate: rateOf(t.cleanSheets, t.cleanSheetMatches, CLAN_CLEAN_SHEET_MIN_MATCHES),
    },
  }
}
