/**
 * ★깃발 점수★ — 그날(17:00~03:00) 뛴 것만으로 1·2·3등을 가린다 (2026-09-15 사장님).
 *
 * > «막 경쟁해서 새벽 3시에 1등인 사람이 깃발 꽂고»
 * > «맨위 육각그래프는 (…) 그 날 마감기준 1,2,3등 (…)
 * >  이것도 그 날 1700-0300까지의 육각이다 알겠지?»
 *
 * ── ★이 파일이 왜 계약에 있나★
 *   같은 계산을 ★두 곳★ 이 해야 한다.
 *   ```
 *   라이브 (17:00~03:00)   apps/web   — 지금 누가 1등인지 실시간으로 보여 준다
 *   마감   (03:00)         apps/worker — 그 순간의 1·2·3등을 깃발로 박는다
 *   ```
 *   둘이 다른 식을 쓰면 ★라이브에서 1등이던 사람이 깃발을 못 받는다.★
 *   그래서 식은 여기 한 곳에만 둔다. 양쪽은 재료만 모아서 넘긴다.
 *
 * ── ⚠ ★시즌 점수와는 다른 계산이다★
 *   `apps/worker/src/lib/playerHexScore.ts` 의 실력 점수는 ★시즌 누적★ 이고
 *   티어계수·신뢰·클랜보정이 붙는다. 깃발은 ★하루★ 라 그런 보정이 뜻이 없다
 *   (하루치는 표본이 작아 신뢰 보정을 걸면 전부 0 에 눌린다).
 *   ★축을 구하는 식(`dayAxisValues`)만 그쪽 `axisValuesOf` 와 같다.★
 *   한쪽을 고치면 다른 쪽도 같이 고친다 — 서로를 가리키는 주석을 달아 두었다.
 *
 * ── 줄 세우는 법 — 「오늘의 셋」과 ★같은 잣대★ 다
 *   사장님: «육각축이 고르게 전부 잘한 사람 + 승률도 좋아야함».
 *   `apps/web/lib/server/queries/dailyPodium.ts` 가 쓰는 그 무게를 그대로 쓴다.
 *   두 화면이 한 리그에서 다른 사람을 1등이라고 하면 안 된다.
 *
 * 순수 함수라 DB 없이 시험한다 (`__tests__/flagScore.test.ts`).
 */

import { z } from 'zod'

/** 여섯 축 — 순서를 바꾸지 않는다. 화면의 육각형이 이 차례로 그린다 */
export const FLAG_AXIS_ORDER = ['save', 'duel', 'carry', 'opening', 'burst', 'outnumbered'] as const
export type FlagAxisKey = (typeof FLAG_AXIS_ORDER)[number]

/**
 * ★하루에 이만큼은 뛰어야 깃발을 다툰다★.
 *
 * 「오늘의 셋」과 같은 값이다 (`dailyPodium.MIN_GAMES`). 3판으로 두면
 * «3판 전승» 이 «6판 4승» 을 이긴다 — 그건 그날 잘한 게 아니라 적게 한 것이다.
 */
export const FLAG_MIN_GAMES = 4

/** 그날 승률이 이보다 낮으면 안 꽂는다 — 사장님: «승률도 좋아야함» */
export const FLAG_MIN_WIN_RATE = 50

/**
 * 축을 잴 수 있는 최소 표본.
 * ⚠ `playerHexScore.ts` 의 `MIN_SITUATION_ROUNDS`·`MIN_DUELS` 와 ★같은 뜻★ 이지만
 *   ★값은 더 작다★ — 저쪽은 시즌 누적이고 이쪽은 하루다. 시즌 값을 그대로 쓰면
 *   하루에 그만큼 겪는 사람이 거의 없어 축이 전부 «측정중» 이 된다.
 */
export const FLAG_MIN_SITUATION_ROUNDS = 3
export const FLAG_MIN_DUELS = 5

/** 몇 명에게 깃발을 주나 — 1등만 정상에 꽂고 2·3 등도 같이 남긴다 */
export const FLAG_PODIUM_SIZE = 3

/**
 * 점수 무게 — 「오늘의 셋」(`dailyPodium`)과 ★같은 값★ 이다.
 * 가장 낮은 축을 제일 무겁게 본다 — «고르게 잘한 사람» 이 사장님 말씀이다.
 */
export const FLAG_W_LOW = 0.45
export const FLAG_W_AVG = 0.25
export const FLAG_W_WIN = 0.3

/** 그 선수의 하루치 배틀로그 합 (`MatchPlayerHex` 를 더한 것) */
export interface FlagDayTally {
  /** 그날 뛴 경기 수 */
  games: number
  win: number
  lose: number
  kill: number
  death: number
  /** 등장한 라운드 수 — 선짤·연속킬의 분모 */
  rounds: number
  firstKills: number
  burstRounds: number
  /**
   * ★한 라운드에 몰아친 최대 킬★ — 새 캐리력 (2026-09-15 사장님).
   *
   * > «캐리력은 라운드당 한 최대 킬 수 / 12라운드를 경기했으면 a선수가 7라쯤 한라운드에 4킬»
   *
   * 창이 여러 판이면 ★그 창 전체의 최고★ 다. 하루면 그날 최고 몰아치기다.
   */
  maxRoundKills: number
  /** 그 최고를 몇 라운드에서 냈나 — 동점을 가르는 꼬리 */
  maxRoundTimes: number
  /**
   * ★우위를 만든 킬★ — 지금의 게임영향력 재료 (2026-09-15 사장님).
   *
   * 킬을 날린 ★그 순간★ 우리 생존자가 상대보다 많지 않았던 킬만 센 것.
   * 값은 이걸 ★등장 라운드★ 로 나눈다 — «라운드마다 한 번» 이 100% 다.
   */
  evenKills: number
  /**
   * ★교환★ — 동료가 죽은 직후(5초 안) 그 킬러를 되잡은 횟수 (2026-09-15 사장님).
   * 값은 `tradeKills / mateDeaths` 다 — 동료의 죽음을 헛되게 안 만든 비율.
   */
  tradeKills: number
  /** 그 경기에서 ★내 동료가 죽은 횟수★ — 교환의 분모다 */
  mateDeaths: number
  aloneRounds: number
  aloneWon: number
  outRounds: number
  outWon: number
  /** 주무기 기준 싸움 */
  sniperDuelWon: number
  sniperDuelLost: number
  rifleDuelWon: number
  rifleDuelLost: number
  /** 그날 주무기 (0 라플 · 1 스나). 모르면 null → 싸움 축이 null */
  weapon: 0 | 1 | null
}

const round1 = (v: number): number => Math.round(v * 10) / 10

/**
 * 축 원값 (%) — ★표본이 모자라면 `null`★. 0 으로 채우지 않는다 (D-106).
 *
 * ⚠ `playerHexScore.ts` 의 `axisValuesOf` 와 ★같은 식★ 이다. 문턱만 하루용이다.
 */
/**
 * ★문턱★ — 축을 잴 최소 표본. 화면에 따라 다르다 (2026-09-15 사장님).
 *
 *   ★순위를 매기는 화면★ (랭킹 · 깃발) — 문턱이 있어야 한다.
 *     «1번 중 1번 = 100%» 가 «10번 중 7번 = 70%» 를 이기면 줄이 뒤집힌다.
 *
 *   ★그 판을 설명하는 화면★ (경기 상세) — 문턱을 두지 않는다.
 *     사장님: «1번중 1번은 100퍼센트가 맞잖아». 순위를 매기는 게 아니라
 *     «이 판에서 뭘 했나» 를 말하는 자리다. 대신 ★분모를 같이 적는다.★
 */
export interface FlagAxisGate {
  situationRounds: number
  duels: number
  /**
   * ★겪은 적이 아예 없을 때★ — `true` 면 0%, `false` 면 «못 잼»(`null`).
   *
   * 2026-09-15 사장님:
   * > «세이브 상황없었으면 0%(0/0) 있었는디 못해도 0%(0/1) 두번중한번하면(1/2) 50% 이런식»
   *
   * 랭킹에서는 `false` 다 — «상황이 없었다» 와 «못했다» 를 같은 0 으로 놓고
   * 줄을 세우면 안 겪은 사람이 못한 사람과 같이 바닥에 깔린다.
   * 한 판 설명에서는 `true` 다 — 육각이 비면 «못 잼» 이 «못함» 처럼 보인다.
   */
  emptyIsZero: boolean
}

/** 줄을 세울 때 (랭킹 · 깃발) */
export const FLAG_GATE_RANKED: FlagAxisGate = {
  situationRounds: FLAG_MIN_SITUATION_ROUNDS,
  duels: FLAG_MIN_DUELS,
  emptyIsZero: false,
}

/** 한 판을 설명할 때 (경기 상세) — ★한 번만 겪어도 적고, 안 겪었으면 0% 다★ */
export const FLAG_GATE_RAW: FlagAxisGate = {
  situationRounds: 1,
  duels: 1,
  emptyIsZero: true,
}

/**
 * ★세이브는 백분위가 아니라 고정 눈금이다★ (2026-09-15 사장님).
 *
 * > «세이브도 그냥 횟수로 넣어야할듯 퍼센트가 아니라 1회 2회 3회 4회 5회까지
 * >  0회는 그래프가 움직이면 안되고 (…) 중간크기 6각형 테두리에 1회부터 여기에 점을 찍어
 * >  그리고 젤큰 육각형과 그다음으로 큰 육각형 사이의 공간을 4개로 나눠서
 * >  (세이브 4번이 가장큰그래프의 테두리에 찍힌다 5회이상은 걍 4회로친다)»
 *
 * ── 왜 백분위를 버리나
 *   세이브는 ★한 판에 전원 0회★ 인 경기가 흔하다 (실측). 백분위로 그리면 그 열 명이
 *   모두 «가운데» 에 찍혀서, ★아무도 세이브를 안 한 판★ 이 «다들 보통은 했다» 처럼 보인다.
 *   횟수는 그런 거짓말을 안 한다 — 0회면 도형이 중심에서 안 움직인다.
 *
 * ── 눈금 (그림의 세 겹과 맞물린다)
 *   ```
 *   0회   0.00   중심 — 움직이지 않는다
 *   1회   0.66   ★중간 육각 테두리★
 *   2회   0.77   ┐ 1회와 4회 사이를
 *   3회   0.89   ┘ 고르게 나눈 자리
 *   4회   1.00   ★가장 큰 육각 테두리★
 *   5회 이상 → 4회로 친다
 *   ```
 *
 * ★한 판 육각에서만 쓴다.★ 시즌·하루는 판수가 많아 세이브가 수십 번이라
 * 4회 상한을 두면 전원 만점이 된다 — 거기는 그대로 비율이다.
 */
export const SAVE_SCALE_FULL = 4
/** 1회가 찍히는 자리 — 그림의 ★중간 육각★ 테두리다 (`0.66 * R`) */
export const SAVE_SCALE_FIRST = 66

/** 세이브 횟수 → 그림 반지름 백분율 (0~100) */
export function saveScaleOf(saves: number): number {
  if (saves <= 0) return 0
  const capped = Math.min(saves, SAVE_SCALE_FULL)
  /* 1회(66) 와 4회(100) 사이를 고르게 나눈다 */
  return round1(SAVE_SCALE_FIRST + ((100 - SAVE_SCALE_FIRST) * (capped - 1)) / (SAVE_SCALE_FULL - 1))
}

/**
 * ★캐리력 = 한 라운드에 몰아친 최대 킬★ (2026-09-15 사장님).
 *
 * > «캐리력은 라운드당 한 최대 킬 수 (…) a선수가 7라쯤 한라운드에 4킬을 함 > 캐리력1등»
 *
 * ── ⚠ 옛 기준은 ★판당 킬★ 이었다 (`kill / games`). 지우지 않고 `CARRY_BY_TOTAL_KILLS`
 *   로 되돌릴 수 있게 남긴다. 두 기준의 상관은 0.636 이라 ★서로 다른 것을 잰다.★
 *
 * ── 왜 꼬리를 붙이나 (실측 · 8명 이상 뛴 134판)
 *   ```
 *   최대킬만        갈래 3.34개   최다 동점묶음 5.27명  ← 열 명 중 절반이 동점
 *   + 몇 번 냈나    갈래 5.84개   최다 동점묶음 3.48명
 *   [견줌] 판당 킬  갈래 7.09개   최다 동점묶음 2.51명
 *   ```
 *   값이 1·2·3·4 네 칸뿐이라 최대킬만으로는 줄이 안 선다.
 *   «4킬을 두 번 낸 사람이 4킬 한 번 낸 사람보다 위» 라는 꼬리가 그걸 가른다.
 *   ★연속킬 축과 겹치지 않는다★ — 연속킬은 «2초 안에 이어 잡은 라운드» 라 시간 조건이 다르다.
 *
 * ★화면 값은 최대킬 그대로★ 다 («4킬»). 꼬리는 ★줄 세우기에만★ 쓴다.
 */
/**
 * ★한 라운드에 지울 수 있는 최대 인원★ — 5대5 이므로 다섯이다 (2026-09-15 사장님).
 *
 * > «5킬까지 눈금을 만들어야해»
 *
 * 실측에서도 한 라운드 최고가 5킬이었다 (1,060판에 6킬은 한 번 — 인원이 어긋난 응답).
 * 5킬을 넘는 값은 100% 로 자른다.
 */
export const INFLUENCE_FULL_KILLS = 5

/**
 * ★게임영향력 = «우위를 만든 킬»★ (2026-09-15 사장님).
 *
 * > «나는 킬을 가장 많이했다고 무조건 걔가 잘한것처럼 되는 그 구조가 싫은거야»
 * > «너무 좋다 그걸 게임영향력으로 넣자»
 *
 * 킬을 날린 ★그 순간★ 우리 생존자가 상대보다 많지 않았던 킬만 센다.
 * 4대1로 이기고 있을 때 딴 킬은 안 센다 — 이미 이긴 판이다.
 *
 * ── 왜 이걸로 바꿨나 (실측 515판 · 4,078 «경기×선수»)
 *   ```
 *   재료                     총 킬과 상관   한 판 갈래
 *   [옛] 최대 라운드 킬          0.913        3.43
 *   생존 기여 · 이긴라운드 관여율  0.909        2.10 / 1.85
 *   라운드를 끝낸 킬             0.667        4.98
 *   ★우위를 만든 킬★           ★0.620★      ★5.01★
 *   [견줌] 총 킬               1.000        5.25
 *   ```
 *   앞선 안들은 전부 ★킬 수의 변형★ 이라 «킬 많은 사람이 1등» 이 그대로였다.
 *   이 재료만 그 줄을 깬다.
 *
 * ── 눈금 — ★라운드당 1회 = 100%★
 *   실측 라운드당 중앙 0.50 · 75% 0.73 · 95% 1.08 · 최고 2.00.
 *   1.0 을 100% 로 잡으면 분포가 가장 고르고 «보통이면 절반» 으로 읽힌다.
 *
 * ── 무기 편향은 보정하지 않는다
 *   스나/라플 1.33배인데 ★킬 자체가 1.34배★ 다. 선짤(2.62배)처럼
 *   «역할 때문에 생기는 부당한 몫» 이 아니라 실제 킬 차이 그만큼이다.
 */
/**
 * ★5번 축이 «연속킬» 에서 «교환율» 로 바뀌었다★ (2026-09-15 사장님 «교환율로 해줘»).
 *
 * ★동료가 죽은 직후(5초 안) 그 킬러를 되잡은 비율★ 이다 —
 * 동료의 죽음을 헛되게 만들지 않는 능력. 클랜 육각 6번 축과 같은 뜻이고
 * 그걸 개인 단위로 내린 것이다.
 *
 * ── 왜 이걸 골랐나 (500판 · 3,466 «경기×선수»)
 *   ```
 *   후보                      총킬상관  영향력상관  세이브상관  갈래   스나/라플
 *   캐리력(판당 킬)              0.73     0.87      0.12    8.34   1.21배  ← 3번과 겹친다
 *   멀티킬 라운드                0.64     0.75      0.11    6.85   1.36배  ← 겹친다
 *   생존력(안 죽은 라운드)         0.46     0.46      0.03    6.88   1.24배
 *   라운드를 끝낸 킬              0.35     0.33      0.12    5.46   1.16배
 *   안 짤림                    0.19     0.18      0.00    5.44   0.93배
 *   ★교환율★                 ★0.24★   ★0.37★   ★0.12★ ★7.06★ ★1.16배★
 *   ```
 *   킬 순위와 다른 줄을 세우면서 «안 짤림» 보다 촘촘하다.
 *
 * ⚠ 같은 날 «안 짤림» 이 잠깐 올랐다가 바뀌었다. 그 재료(`firstDeaths`)는 만들지 않았다.
 * `false` 면 옛 «연속킬» 로 돌아간다 (재료 `burstRounds` 가 그대로 있다).
 */
export const TRADE_AXIS = true

export const INFLUENCE_BY_EVEN_KILLS = true
/** 라운드당 이만큼이면 100% */
export const INFLUENCE_FULL_PER_ROUND = 1

/**
 * ★킬이 적으면 아주 약간 깎는다★ (2026-09-15 사장님).
 *
 * > «아무리 4킬 5킬을 했어도 킬수가 너무 적으면 아주약간 감점을 줘»
 *
 * 한 라운드만 몰아치고 나머지를 못 하면 «게임영향력» 이라 부르기 어렵다.
 * 다만 ★아주 약간★ 이라 하셨으므로 ★최대 10%★ 만 깎는다 —
 * 그래야 5킬이 4킬 아래로 내려가지 않는다 (100×0.9 = 90 > 80).
 *
 * ```
 * 판당 8킬 이상   깎지 않는다 (실측 판당 평균이 8.48킬이다)
 * 판당 0킬        90% 만 남는다  ← 바닥
 * 그 사이         고르게
 * ```
 * 예) 5킬을 냈는데 그 판 총 5킬이면 100% → 96.3% · 총 12킬이면 100% 그대로.
 */
export const INFLUENCE_VOLUME_FULL_KPG = 8
/** 아무리 킬이 적어도 이만큼은 남는다 */
export const INFLUENCE_VOLUME_FLOOR = 0.9

/**
 * 한 라운드 최대 킬 → «적 팀의 몇 %를 혼자 지웠나» (1킬 20% … 5킬 100%).
 *
 * `killsPerGame` 을 주면 위의 «킬이 적으면 약간 감점» 이 걸린다. 모르면 안 깎는다.
 */
/** «우위를 만든 킬» → 퍼센트. 라운드당 1회가 100% 다 */
export function influenceOf(evenKills: number, rounds: number): number | null {
  if (rounds <= 0) return null
  const perRound = evenKills / rounds
  return round1(Math.min(1, perRound / INFLUENCE_FULL_PER_ROUND) * 100)
}

/** ⚠ 옛 게임영향력 — «한 라운드 최대 킬» (2026-09-15 낮). 되돌릴 때를 위해 남긴다 */
export function influencePercentOf(maxRoundKills: number, killsPerGame: number | null = null): number {
  if (maxRoundKills <= 0) return 0
  const base = (Math.min(maxRoundKills, INFLUENCE_FULL_KILLS) / INFLUENCE_FULL_KILLS) * 100
  if (killsPerGame === null || !Number.isFinite(killsPerGame)) return round1(base)
  const volume =
    INFLUENCE_VOLUME_FLOOR +
    (1 - INFLUENCE_VOLUME_FLOOR) * Math.min(1, Math.max(0, killsPerGame) / INFLUENCE_VOLUME_FULL_KPG)
  return round1(base * volume)
}

export const CARRY_BY_TOTAL_KILLS = false
/** 꼬리의 무게 — 한 번 더 냈을 때 최대킬 0.1 만큼 앞선다 (1킬 차이를 못 넘게 작게) */
export const CARRY_TIE_WEIGHT = 0.1

/** 줄 세우기용 캐리력 점수 — 화면에 적는 값이 아니다 */
export function carryScoreOf(t: FlagDayTally): number | null {
  /*
   * ★«우위를 만든 킬» 은 값이 곧 잣대다★ (2026-09-15) — 한 판 열 명이 5.01 갈래로
   * 갈려서 동점을 가르는 꼬리가 필요 없다. 옛 재료(최대 라운드 킬)는 3.43 갈래라
   * «그 최고를 몇 번 냈나» 꼬리를 붙여야 했다.
   */
  if (INFLUENCE_BY_EVEN_KILLS) return t.rounds > 0 ? t.evenKills / t.rounds : null
  if (CARRY_BY_TOTAL_KILLS) return t.games > 0 ? t.kill / t.games : null
  if (t.maxRoundKills <= 0) return 0
  return round1(t.maxRoundKills + Math.max(0, t.maxRoundTimes - 1) * CARRY_TIE_WEIGHT)
}

/**
 * ★선짤은 무기를 탄다 — 기준값으로 나눠 줄 세운다★ (2026-09-15 사장님:
 * «선짤 부문이 스나수한테 너무 유리한데 어떡하지»).
 *
 * ── 실측 (54,863 «경기×선수»)
 *   ```
 *   라플  판당 선짤 0.87   스나  판당 선짤 2.29   →  ★2.62배★
 *   (견줌: 킬은 1.34배 · 연속킬은 1.17배 — ★선짤만 유독 심하다★)
 *   스나는 인원의 20%인데 선짤의 40%를 가져간다
 *   ```
 *
 * ── ⚠ ★진영으로 갈라도 안 사라진다★ (2026-09-15 · 킬 20,958건)
 *   «수비 때 롱에서 따는 게 원인» 이라 보고 C4 판정(`roundSidesOf`)으로 갈라 재 봤다.
 *   ```
 *   레드(공격)  스나 쏠림 1.30배      블루(수비)  스나 쏠림 1.44배
 *   ```
 *   수비가 더 심할 뿐 ★공격에서도 남는다.★ 레드만 재도 1.44 가 1.30 이 될 뿐이다.
 *   그래서 진영 분리는 답이 아니다.
 *
 * ── 그래서 기준값으로 나눈다
 *   스나 2.29 · 라플 0.87 을 각각 «1.0» 으로 놓고 그 대비로 줄을 세운다.
 *   ★표본을 쪼개지 않으므로 한 판 열 명 안에서도 그대로 쓴다★ —
 *   무기별로 모집단을 가르면 «스나 둘 중 1등» 이 되어 버린다.
 *
 * ★화면 값은 원값 그대로★ 다 («2.3회»). 기준값은 ★줄 세우기에만★ 쓴다.
 */
export const OPENING_BASELINE = { sniper: 2.29, rifle: 0.87 } as const
/** 무기를 모르면 둘의 가운데로 — 어느 쪽으로도 밀지 않는다 */
const OPENING_BASELINE_UNKNOWN = (OPENING_BASELINE.sniper + OPENING_BASELINE.rifle) / 2

/** 줄 세우기용 선짤 점수 — 그 무기의 «보통» 을 1.0 으로 본 값 */
export function openingScoreOf(t: FlagDayTally): number | null {
  if (t.games <= 0) return null
  const raw = t.firstKills / t.games
  const base =
    t.weapon === 1 ? OPENING_BASELINE.sniper : t.weapon === 0 ? OPENING_BASELINE.rifle : OPENING_BASELINE_UNKNOWN
  return round1((raw / base) * 100) / 100
}

/** 축마다 «몇 번 중 몇 번» — 화면이 «100% (1/1)» 로 적을 수 있게 */
export interface FlagAxisParts {
  numerator: number | null
  denominator: number | null
}

/** 축의 분자·분모 — 값과 같은 규칙으로 고른다 */
export function dayAxisParts(t: FlagDayTally): Record<FlagAxisKey, FlagAxisParts> {
  const duelWon = t.weapon === 1 ? t.sniperDuelWon : t.weapon === 0 ? t.rifleDuelWon : 0
  const duelLost = t.weapon === 1 ? t.sniperDuelLost : t.weapon === 0 ? t.rifleDuelLost : 0
  return {
    save: { numerator: t.aloneWon, denominator: t.aloneRounds },
    duel: { numerator: duelWon, denominator: duelWon + duelLost },
    /* ★캐리력의 «몇 번»은 그 최고를 낸 라운드 수★ 다 (2026-09-15 사장님) —
       화면이 «4킬 ×2» 로 적는다. 옛 기준일 때만 판당 킬의 분자·분모다 */
    carry: INFLUENCE_BY_EVEN_KILLS
      ? { numerator: t.evenKills, denominator: t.rounds }
      : CARRY_BY_TOTAL_KILLS
        ? { numerator: t.kill, denominator: t.games }
        : { numerator: t.maxRoundTimes, denominator: t.maxRoundKills },
    opening: { numerator: t.firstKills, denominator: t.games },
    burst: TRADE_AXIS
      ? { numerator: t.tradeKills, denominator: t.mateDeaths }
      : { numerator: t.burstRounds, denominator: t.games },
    outnumbered: { numerator: t.outWon, denominator: t.outRounds },
  }
}

export function dayAxisValues(
  t: FlagDayTally,
  gate: FlagAxisGate = FLAG_GATE_RANKED,
): Record<FlagAxisKey, number | null> {
  const duelWon = t.weapon === 1 ? t.sniperDuelWon : t.weapon === 0 ? t.rifleDuelWon : 0
  const duelLost = t.weapon === 1 ? t.sniperDuelLost : t.weapon === 0 ? t.rifleDuelLost : 0
  const duels = duelWon + duelLost
  return {
    save:
      t.aloneRounds >= gate.situationRounds
        ? round1((t.aloneWon / t.aloneRounds) * 100)
        : gate.emptyIsZero
          ? 0
          : null,
    duel:
      t.weapon !== null && duels >= gate.duels
        ? round1((duelWon / duels) * 100)
        : gate.emptyIsZero
          ? 0
          : null,
    /*
     * ★캐리력은 «한 라운드 최대 킬» 이다★ (2026-09-15 사장님).
     * ⚠ 옛 값은 판당 킬이었다 — `CARRY_BY_TOTAL_KILLS` 로 되돌릴 수 있다.
     *   줄 세우는 잣대는 여기가 아니라 `carryScoreOf` 다 (동점을 가르는 꼬리가 붙는다).
     */
    /*
     * ★게임영향력 — 한 라운드에 적 팀의 몇 %를 혼자 지웠나★ (2026-09-15 사장님:
     * «5킬까지 눈금을 만들어야해 / 앞으로 캐력의 이름은 게임영향력»).
     *
     * ⚠ 이름과 뜻이 같은 날 두 번 바뀌었다.
     *   ① 옛 판 — «판당 킬» (`CARRY_BY_TOTAL_KILLS` 로 되돌릴 수 있다)
     *   ② 낮 — «한 라운드 최대 킬» (3킬 처럼 횟수로 적었다)
     *   ③ 지금 — 그 최대 킬을 ★적 다섯 기준 퍼센트★ 로 적는다
     *   ③으로 바꾼 이유: «15킬 한 사람이 3킬로 뜬다» 는 게 어색했고,
     *   다른 축이 전부 % 라 단위도 안 맞았다.
     *
     * 줄 세우는 잣대는 여기가 아니라 `carryScoreOf` 다 — 동점을 가르는 꼬리가 붙는다.
     */
    carry: INFLUENCE_BY_EVEN_KILLS
      ? influenceOf(t.evenKills, t.rounds)
      : CARRY_BY_TOTAL_KILLS
        ? t.games > 0
          ? Math.round((t.kill / t.games) * 100) / 100
          : null
        : t.maxRoundKills > 0
          ? influencePercentOf(t.maxRoundKills, t.games > 0 ? t.kill / t.games : null)
          : gate.emptyIsZero
            ? 0
            : null,
    /*
     * ★선짤·연속킬은 「판당 몇 번」 이다★ (2026-09-15 사장님:
     * «연속킬이랑 선짤 이 두개만 판당평균 n.n회 이런식으로 바꿔»).
     *
     * ⚠ 옛 값은 ★라운드 비율(%)★ 이었다 (`firstKills / rounds × 100`).
     *   퍼센트로 적으니 «선짤 7%» 처럼 작은 숫자만 나와서 무슨 뜻인지 안 와닿았다.
     *   지금은 캐리력(판당 킬)과 ★같은 단위★ 라 나란히 읽힌다.
     *   ★백분위는 그대로다★ — 순위를 가리는 잣대는 안 바뀐다 (단조 변환이다).
     */
    opening: t.games > 0 ? Math.round((t.firstKills / t.games) * 100) / 100 : null,
    /* ★5번 축은 «교환율»★ — 동료가 죽은 직후 그 킬러를 되잡은 비율 (2026-09-15 사장님) */
    burst: TRADE_AXIS
      ? t.mateDeaths > 0
        ? round1((t.tradeKills / t.mateDeaths) * 100)
        : gate.emptyIsZero
          ? 0
          : null
      : t.games > 0
        ? Math.round((t.burstRounds / t.games) * 100) / 100
        : null,
    outnumbered:
      t.outRounds >= gate.situationRounds
        ? round1((t.outWon / t.outRounds) * 100)
        : gate.emptyIsZero
          ? 0
          : null,
  }
}

/**
 * 백분위 — ★나보다 낮은 사람의 비율 × 100★. 오름차순 배열을 받는다.
 * ⚠ `playerHexScore.ts` 의 `percentileOf` 와 같은 식이다.
 */
export function flagPercentile(sorted: readonly number[], v: number | null): number | null {
  if (v === null || !Number.isFinite(v) || sorted.length === 0) return null
  let lo = 0
  let hi = sorted.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if ((sorted[mid] as number) < v) lo = mid + 1
    else hi = mid
  }
  return round1((lo / sorted.length) * 100)
}

/** 점수 — 「오늘의 셋」과 같은 식. 낮은 축을 제일 무겁게 본다 */
export function flagScoreOf(low: number, avg: number, winRate: number): number {
  return low * FLAG_W_LOW + avg * FLAG_W_AVG + winRate * FLAG_W_WIN
}

/** 한 사람의 하루치 — 점수를 매기기 전 재료 */
export interface FlagCandidate<T> {
  /** 부르는 쪽이 붙이는 꼬리표 (선수 id 같은 것). 이 파일은 안 들여다본다 */
  ref: T
  tally: FlagDayTally
}

/** 줄 세운 결과 한 줄 */
export interface FlagRanked<T> {
  ref: T
  /** 1부터 */
  rank: number
  score: number
  /** 백분위로 바꾼 여섯 축 (그날 뛴 사람들 사이에서) */
  axes: { key: FlagAxisKey; value: number | null; pct: number | null }[]
  /** 가장 낮은 축의 백분위와 이름 */
  lowPct: number
  lowKey: FlagAxisKey
  winRate: number
  /** 킬 ÷ (킬+데스) · % — 사이트 공통 잣대. 잴 수 없으면 null */
  kdRate: number | null
  games: number
  win: number
  lose: number
}

/**
 * ★그날 1·2·3등★.
 *
 * 백분위는 ★그날 뛴 사람들 안에서★ 낸다 — 시즌 분포를 쓰면 «오늘 잘한 사람» 이 아니라
 * «원래 잘하는 사람» 이 나온다 (사장님이 짚어 주신 자리다).
 *
 * ── 누가 후보에서 빠지나 (★지어내지 않는다★)
 *   · 그날 `FLAG_MIN_GAMES` 판을 못 채웠다
 *   · 여섯 축 중 하나라도 못 쟀다 — 고르게 잘했는지 말할 수가 없다
 *   · 그날 승률이 `FLAG_MIN_WIN_RATE` 미만이다
 *
 * 아무도 못 채우면 ★빈 배열★ 이다. 억지로 세 명을 채우지 않는다.
 */
/**
 * ★동점을 가운데로 놓는 백분위★ — 한 판 육각처럼 ★모집단이 열 명뿐★ 일 때 쓴다.
 *
 * ⚠ 왜 따로 두나 (2026-09-15 실측)
 *   `flagPercentile` 은 «나보다 ★낮은★ 사람의 비율» 이다. 시즌처럼 사람이 많으면
 *   동점이 드물어 문제가 없는데, ★한 판 열 명★ 에서는 «세이브 0%» 가 일곱 명씩 나온다.
 *   그러면 일곱 명이 ★전부 0 백분위★ 가 되어 육각이 통째로 찌그러진다 —
 *   실측: cks♡ 의 여섯 축 중 넷이 0 이라 도형이 선 한 줄로 보였다.
 *
 *   여기서는 «낮은 사람» 과 «나 이하인 사람» 의 ★가운데★ 를 쓴다.
 *   일곱 명이 0 으로 묶이면 일곱 명 모두 35 가 된다 — 순서는 그대로면서 도형이 산다.
 *
 * ★줄 세우기에는 쓰지 않는다★ — 깃발·랭킹은 `flagPercentile` 그대로다.
 */
export function flagPercentileMid(sorted: readonly number[], v: number | null): number | null {
  if (v === null || sorted.length === 0) return null
  let lo = 0
  let hi = sorted.length
  while (lo < hi) {
    const m = (lo + hi) >> 1
    if ((sorted[m] as number) < v) lo = m + 1
    else hi = m
  }
  const below = lo
  let lo2 = 0
  let hi2 = sorted.length
  while (lo2 < hi2) {
    const m = (lo2 + hi2) >> 1
    if ((sorted[m] as number) <= v) lo2 = m + 1
    else hi2 = m
  }
  return round1((((below + lo2) / 2 / sorted.length) * 100))
}

/**
 * ★줄 세우는 잣대★ — 화면에 적는 값(`dayAxisValues`)과 ★다른 축이 둘★ 있다.
 *
 *   캐리력  «4킬» 로 적지만 «4킬 + 그 최고를 몇 번 냈나» 로 줄을 세운다
 *           (최대킬만으로는 열 명 중 다섯이 동점이었다 — 실측 갈래 3.34개)
 *   선짤    «2.3회» 로 적지만 «그 무기의 보통 대비» 로 줄을 세운다
 *           (스나가 라플보다 2.62배 유리하고, 진영을 갈라도 안 사라진다)
 *
 * 나머지 네 축은 적는 값이 곧 잣대다.
 * ★백분위의 모집단은 반드시 이 값으로 만든다★ — 적는 값으로 만들면 편향이 그대로 남는다.
 */
export function dayAxisScores(
  t: FlagDayTally,
  gate: FlagAxisGate = FLAG_GATE_RANKED,
): Record<FlagAxisKey, number | null> {
  const values = dayAxisValues(t, gate)
  return {
    ...values,
    carry: carryScoreOf(t),
    opening: t.games > 0 ? openingScoreOf(t) : values.opening,
  }
}

export function rankFlagDay<T>(
  candidates: readonly FlagCandidate<T>[],
  size: number = FLAG_PODIUM_SIZE,
): FlagRanked<T>[] {
  /*
   * ① 축을 먼저 다 구한다. ★적는 값과 줄 세우는 잣대를 따로 든다★ (2026-09-15) —
   *   캐리력·선짤은 둘이 다르다. 백분위의 모집단은 ★잣대★ 로 만든다.
   */
  const withValues = candidates.map((c) => ({
    c,
    values: dayAxisValues(c.tally),
    scores: dayAxisScores(c.tally),
  }))

  /* ② 축마다 그날의 분포 (null 은 모집단에 안 넣는다) */
  const pools = {} as Record<FlagAxisKey, number[]>
  for (const key of FLAG_AXIS_ORDER) {
    pools[key] = withValues
      .map((w) => w.scores[key])
      .filter((v): v is number => v !== null)
      .sort((a, b) => a - b)
  }

  /* ③ 문턱을 넘은 사람만 점수를 낸다 */
  const scored: FlagRanked<T>[] = []
  for (const { c, values, scores } of withValues) {
    const t = c.tally
    if (t.games < FLAG_MIN_GAMES) continue
    const winRate = t.games === 0 ? 0 : (t.win / t.games) * 100
    if (winRate < FLAG_MIN_WIN_RATE) continue

    const axes = FLAG_AXIS_ORDER.map((key) => ({
      key,
      /* 적는 값은 원값이고, 자리는 ★잣대★ 가 정한다 */
      value: values[key],
      pct: flagPercentile(pools[key], scores[key]),
    }))
    /* 하나라도 못 잰 축이 있으면 «고르게» 를 말할 수 없다 */
    if (axes.some((a) => a.pct === null)) continue

    const pcts = axes.map((a) => a.pct as number)
    const lowPct = Math.min(...pcts)
    const lowIndex = pcts.indexOf(lowPct)
    const avg = pcts.reduce((a, b) => a + b, 0) / pcts.length
    const kills = t.kill
    const deaths = t.death
    scored.push({
      ref: c.ref,
      rank: 0,
      score: flagScoreOf(lowPct, avg, winRate),
      axes,
      lowPct,
      lowKey: FLAG_AXIS_ORDER[lowIndex] as FlagAxisKey,
      winRate: round1(winRate),
      kdRate: kills + deaths === 0 ? null : round1((kills / (kills + deaths)) * 100),
      games: t.games,
      win: t.win,
      lose: t.lose,
    })
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, size)
    .map((row, i) => ({ ...row, rank: i + 1 }))
}

/* -------------------------------------------------------------------------- */
/* 화면이 받는 모양                                                              */
/* -------------------------------------------------------------------------- */

/** 깃발판 한 줄 — 1·2·3등 */
export const FlagBoardRowSchema = z.object({
  rank: z.number().int(),
  player_id: z.string(),
  name: z.string(),
  clan: z
    .object({
      slug: z.string(),
      name: z.string(),
      mark: z.object({ bg: z.string().nullable(), front: z.string().nullable() }),
    })
    .nullable(),
  score: z.number(),
  games: z.number().int(),
  win: z.number().int(),
  lose: z.number().int(),
  win_rate: z.number(),
  /** 킬 ÷ (킬+데스) · % */
  kd_rate: z.number().nullable(),
  /** 그날 육각 — 백분위. 마감 뒤 저장본에는 빈 배열이다 */
  axes: z.array(
    z.object({
      key: z.string(),
      value: z.number().nullable(),
      pct: z.number().nullable(),
    }),
  ),
  /** 지금까지 받은 깃발 수 (1등만) */
  flags: z.number().int(),
})
export type FlagBoardRowSchema = z.infer<typeof FlagBoardRowSchema>

/** 깃발판 — 산 하나 */
/** 능선 한 점 — «그 시각까지의 1등 점수» */
export const FlagTimelinePointSchema = z.object({
  slot: z.number().int(),
  score: z.number().nullable(),
  player_id: z.string().nullable(),
})

export const FlagBoard = z.object({
  league: z.string(),
  /** 마감일 `YYYY-MM-DD` (KST) */
  day_key: z.string(),
  opens_at: z.string(),
  closes_at: z.string(),
  /** 아직 경쟁 중인가 */
  live: z.boolean(),
  /** 한 칸이 몇 분인가 */
  slot_minutes: z.number().int().default(30),
  /** ★능선★ — 시각마다 «그때까지의 1등 점수» */
  timeline: z.array(FlagTimelinePointSchema).default([]),
  rows: z.array(FlagBoardRowSchema),
})
export type FlagBoard = z.infer<typeof FlagBoard>
