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

/**
 * 꼭지점 여섯. **이 순서가 화면의 시계방향 순서**이고, 축 배열은 항상 이 순서다.
 *
 * ⚠ **정정 (2026-09-02 · D-256) — 축 셋이 바뀌었다.** 옛 배열은 이랬다:
 * ```
 * ['sniperFight', 'outnumbered', 'save', 'tempo', 'lastSniper', 'attackZone']
 *   ①구역 스나싸움                          ⑤B어택성공    ⑥A어택성공
 * ```
 *
 * 사용자가 ①을 다시 정의하고 ⑤⑥ 을 뺐다. **키를 그대로 두고 뜻만 바꾸지 않았다** —
 * 그러면 옛 값과 새 값이 같은 이름으로 섞인다. D-235 가 「게임템포는 이름만 같고 다른
 * 지표다」로 겪은 함정이 그것이다. **키를 바꿔서 부르는 쪽이 전부 깨지게** 했다.
 */
export const CLAN_HEX_V2_AXIS_KEYS = [
  'sniperDuel',
  'outnumbered',
  'save',
  'tempo',
  'firstBlood',
  'trade',
] as const
export type ClanHexV2AxisKey = (typeof CLAN_HEX_V2_AXIS_KEYS)[number]

/**
 * 화면에 그대로 쓰는 이름 — **사용자가 직접 고른 말이다.**
 *
 * ★ `선짤` 은 「선취점」이 아니고 `교환` 은 「되잡기」·「트레이드」가 아니다.
 *   2026-09-02 에 사용자가 *"선취점을 **선짤** >이걸로 바꾸고 진행시켜 / 되잡기를 **교환**
 *   이라고 바꾸고 적용"* 이라고 못 박았다. **바꾸지 마라.**
 */
export const CLAN_HEX_V2_AXIS_LABELS: Record<ClanHexV2AxisKey, string> = {
  sniperDuel: '스나싸움',
  outnumbered: '소수싸움',
  save: '세이브',
  tempo: '게임템포',
  firstBlood: '선짤',
  trade: '교환',
}

/**
 * **게임템포만 「짧을수록 좋다」.** 나머지 다섯은 클수록 좋다.
 *
 * 정규화(`normalizeAgainstFoe` · `normalizeByPercentile`)가 이 표를 보고 부호를 뒤집는다.
 * 원값(`raw`)은 **뒤집지 않는다** — 화면에 `18.3초` 라고 적어야 하기 때문이다.
 */
export const CLAN_HEX_V2_LOWER_IS_BETTER: Record<ClanHexV2AxisKey, boolean> = {
  sniperDuel: false,
  outnumbered: false,
  save: false,
  tempo: true,
  firstBlood: false,
  trade: false,
}

/**
 * 원값의 단위 — `text` 를 어떻게 적을지가 여기서 갈린다.
 *
 * ⚠ **정정 (2026-09-02 · D-256)** — 이 주석은 «① 스나싸움은 비율이 아니다. D-235 Q1 이
 * 「합」으로 정했고 분모가 레드 라운드라 **라운드당 킬수**가 나온다» 였다.
 * 사용자가 ① 을 **스나 대 스나**로 다시 정의했고 분모를 `won + lost` 로 골랐다.
 * 그래서 지금 ① 은 **0~1 비율**이다. 지금 `perRound` 를 쓰는 축은 하나도 없지만
 * 단위 자체는 **남겨 둔다** — 옆 ①(구역 판)이 되살아나면 다시 필요하다 (`CLAUDE.md` 10-4).
 */
export const CLAN_HEX_V2_AXIS_UNITS: Record<
  ClanHexV2AxisKey,
  'ratio' | 'seconds' | 'perRound'
> = {
  sniperDuel: 'ratio',
  outnumbered: 'ratio',
  save: 'ratio',
  tempo: 'seconds',
  firstBlood: 'ratio',
  trade: 'ratio',
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
  /**
   * 구역 좌표를 안 넘겨받았다 — 그 경기를 **구역 없이** 집계했다는 뜻이다.
   *
   * ⚠ **정정 (2026-09-02)** — 이 주석은 «`녹뒤` · `머리` 는 아직 칠해지지 않았다 (D-235 Q6)»
   * 였다. **그때는 맞았고 지금은 틀리다.** 사용자가 2026-08-29 에 `design/zone-paint.html`
   * 로 직접 칠했고, `data/barracks/style-zones.json` 에 **8구역 208칸이 다 있다**
   * (`BIRONG 97 · BUNKER 25 · GJA 25 · CONDWI 19 · DALBANG 15 · SEOLDAE 15 ·
   *  NOKDWI 6 · MERI 6`). 낡은 서술은 지우지 않고 여기 정정을 단다 (`CLAUDE.md` 10-4).
   *
   * ★ **이 낡은 주석이 실제로 사람을 속였다.** 이것을 읽고 사용자에게 「녹뒤·머리가 없다」고
   *   보고한 일이 있었다. 사용자가 손으로 칠한 것이라 상심하셨다. 다시 그러지 않게 적어 둔다.
   */
  zone: '구역 좌표 필요',
  /** 겹쳐 그릴 상대 값이 없다 (경기 정규화 전용) */
  compare: '비교 대상 없음',
}

/** 화면에 `측정중` 이라고 적는다 (옛 판·선수 육각형과 같은 말) */
export const CLAN_HEX_V2_PENDING_LABEL = '측정중'

/**
 * ⑥ 이 쓰는 구역 수 — **넷이다** (`컨뒤` · `A설대` · `녹뒤` · `머리`).
 *
 * 화면에 `구역 4/4` 를 적기 위한 분모다.
 *
 * ⚠ **정정 (2026-09-02)** — 이 주석은 «사용자가 말한 넷 중 **둘**만 좌표가 있다
 * (D-235 Q6 · `[미확인]`). 화면에 `구역 2/4` 를 적기 위한 분모다. `녹뒤` · `머리` 의 좌표는
 * 사용자가 칠해야 생긴다» 였다. **값(4)은 늘 옳았고 주석만 낡아 있었다.**
 * 좌표는 2026-08-29 에 사용자가 `design/zone-paint.html` 로 직접 칠했다
 * (`녹뒤` x36~38·y26~27 6칸 / `머리` x33~35·y26~27 6칸, 기존 칸과 한 칸도 안 겹친다).
 * 낡은 서술을 지우지 않고 남긴다 (`CLAUDE.md` 10-4).
 *
 * ⚠ 실제로 몇 구역을 썼는지는 이 상수가 아니라 `zoneLabelsUsed` 가 말한다.
 * 그 값은 **집계 당시 파일에 있던 라벨**에서 나오므로, 재빌드 전 옛 행은 2로 남아 있다.
 * 둘이 다르면 그 행은 옛 규칙으로 만들어진 것이다 — `formulaVersion` 으로도 갈린다.
 */
export const CLAN_HEX_V2_ZONE_LABELS_TOTAL = 4

/* -------------------------------------------------------------------------- */
/* 구역을 **누구 자리로** 볼 것인가 (2026-09-02 · D-256)                          */
/* -------------------------------------------------------------------------- */

/**
 * `에이쪽에서 잡은` 이 **누가 거기 있었다는 말인가.**
 *
 * ```
 * 'victim'  죽은 상대 스나가 서 있던 자리   ← 사용자 확정. 기본값이다
 * 'killer'  잡은 사람(우리)이 서 있던 자리   ← 2026-09-01 까지 쓰던 해석
 * ```
 *
 * ── 사용자 원문 (2026-09-01)
 *   > "죽은 사람이 에이쪽에 있는거지"
 *
 * ── 왜 이렇게까지 갈리나
 *   `컨뒤` · `A설대` 는 **수비 스나가 앉는 자리**다. 레드(공격)인 우리가 거기 설 일이 드물다.
 *   그래서 `killer` 로 세면 거의 안 잡히고 값이 뭉개진다. 실측(검증관, 2026-09-01):
 *
 *   ```
 *                     byKiller(옛)            byVictim(확정)
 *   ⑥ SPL 35곳       중앙 0.031 · 0인곳 4     중앙 0.266 · 0인곳 0
 *   ⑥ 10mountain 67곳 중앙 0.023 · 0인곳 12    중앙 0.236 · 0인곳 0
 *   두 해석의 상관   ⑥ +0.107/+0.286 · ① -0.046/-0.190   ← ① 은 **음수**다
 *   ```
 *
 *   상관이 음수라는 것은 «비슷한 지표의 눈금 차이» 가 아니라 **서로 다른 것을 재고 있었다**는
 *   뜻이다. 그래서 옛 값은 눈금을 고쳐 쓸 수 없고 **버려야 한다**. 그것이 `formulaVersion`
 *   을 올리는 이유다.
 *
 * ── **옛 해석을 지우지 않는다** (`CLAUDE.md` 10-4)
 *   고른 것은 **해석**이지 데이터가 아니다. `ZoneCountLike` 는 여전히 `byKiller` 를 저장하고,
 *   여기 `'killer'` 를 주면 옛 값이 그대로 다시 나온다. 재수집도 재빌드도 필요 없다 —
 *   나누는 일이 `buildClanHexV2Raw` 한 곳에서만 일어나기 때문이다.
 */
export type ClanHexV2ZoneAttribution = 'victim' | 'killer'

/** `ZoneCountLike` 에서 지금 해석에 맞는 칸을 꺼낸다. **분기를 여기 한 곳에만 둔다** */
export function zoneCountOf(
  zone: ZoneCountLike,
  attribution: ClanHexV2ZoneAttribution,
): number {
  return attribution === 'victim' ? zone.byVictim : zone.byKiller
}

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
  /**
   * ①⑥ 의 구역을 **누구 자리로** 볼 것인가 (2026-09-02 · D-256).
   *
   * 기본은 `'victim'`(사용자 확정). `'killer'` 를 주면 2026-09-01 까지의 값이 그대로 나온다 —
   * **옛 경로를 지우지 않기 위해 스위치로 남긴 것이다** (`CLAUDE.md` 10-4).
   */
  zoneAttribution: ClanHexV2ZoneAttribution
  /**
   * ⑥ **교환** 의 「직후」를 어디까지로 볼 것인가 (2026-09-02 · D-256).
   *
   * **사용자가 `5` 초를 골랐다.** 후보 다섯을 실측해 보였고(클랜 151곳) 그렇게 정했다.
   *
   * ```
   * 'sameRound'  같은 라운드 안     중앙 0.483   느슨하다
   * 3            3초 안             중앙 0.127   1초 해상도 잡음과 크기가 비슷하다
   * 5            5초 안             중앙 0.176   ← 확정
   * 10           10초 안            중앙 0.262
   * ```
   *
   * `TradeTallyLike` 가 **창 넷을 다 저장**하므로 여기를 바꾸면 **재빌드 없이** 값이 바뀜다.
   * 그것이 `zoneAttribution` 과 같은 이유로 여기 있는 이유다 — **고른 것은 해석이고
   * 데이터는 다 남긴다.**
   */
  tradeWindow: ClanHexV2TradeWindow
  /** 이 값으로 계산했다는 표시 (`CLAUDE.md` 3-B 5번 — 옛 값을 덮어쓰지 않기 위한 꼬리표) */
  formulaVersion: string
}

/** ⑥ 교환의 「직후」 후보. 사용자가 `5` 를 골랐다 */
export type ClanHexV2TradeWindow = 3 | 5 | 10 | 'sameRound'

/** `TradeTallyLike` 에서 지금 창에 맞는 칸을 꺼낸다. **분기를 여기 한 곳에만 둔다** */
export function tradeCountOf(trade: TradeTallyLike, window: ClanHexV2TradeWindow): number {
  switch (window) {
    case 3:
      return trade.within3
    case 5:
      return trade.within5
    case 10:
      return trade.within10
    case 'sameRound':
      return trade.sameRound
  }
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
  /* 「죽은 사람이 에이쪽에 있는거지」 — 사용자 확정 (2026-09-01 · D-256).
     지금 화면이 쓰는 축 중에는 구역을 쓰는 것이 없다. **옛 축이 되살아날 때를 위해 남긴다** */
  zoneAttribution: 'victim',
  /* 「직후」 = 5초. 사용자가 후보 다섯의 실측을 보고 골랐다 (2026-09-02) */
  tradeWindow: 5,
  /* ── ⚠ 2026-09-02 — **v2.3 에서 v2.1 로 되돌렸다. 새 축이 끝나면 v2.3 으로 올린다**
   *
   *   무슨 일이 있었나 — v2.3 으로 올린 코드가 **재빌드보다 먼저 배포됐다.**
   *   운영 `MatchClanHexV2` 는 전량 `clan-hex-v2.1`(9,384행 · 요약 155)인데
   *   화면 질의(`apps/web/lib/server/queries/clanHexV2.ts:135,250`)가 이 값으로 거르므로
   *   **맞는 행이 하나도 없어 클랜 육각형이 통째로 안 그려졌다.**
   *   담당이 「재빌드 먼저, 배포 나중」이라고 순서를 경고했는데 지키지 못했다.
   *
   *   되돌리는 쪽을 골랐다 — 새 축(선짤 · 교환)이 아직 미완이라 지금 재빌드해도
   *   버전이 또 바뀐다. **육각형이 아예 없는 것보다 옛 값이라도 보이는 게 낫다.**
   *
   *   ⚠ 지금 화면에 그려지는 것은 **옛 축(A어택 · B어택 포함) · 2구역**이다.
   *     사용자가 뺀 축들이 아직 보인다.
   *     ★다만 `zoneAttribution` 은 `victim` 그대로 둔다★ — 저장된 tally 가
   *     `byKiller` 와 `byVictim` 을 **둘 다** 들고 있고 나누는 일은 읽을 때 일어난다.
   *     그래서 옛 행을 그대로 두고도 사용자가 확정한 해석으로 읽을 수 있다.
   *     즉 이 버전 문자열은 **「어느 행을 읽을까」의 열쇠**이지 해석의 이름이 아니다.
   *     (구역이 둘뿐인 것은 남는다 — 녹뒤 · 머리는 재빌드해야 들어온다)
   *
   *     새 축이 끝나면 **재빌드를 먼저 하고** 이 값을 `clan-hex-v2.3` 으로 올린다.
   *     순서를 거꾸로 하면 같은 일이 반복된다.
   *
   *   `apps/worker/src/lib/clanHexV2Version.ts` 도 함께 되돌렸다 — 두 값은 같아야 한다.
   */
  formulaVersion: 'clan-hex-v2.1',
}

/**
 * 2026-09-01 까지 쓰던 설정. **지우지 않는다** (`CLAUDE.md` 10-4).
 *
 * `buildClanHexV2Raw({ ..., config: CLAN_HEX_V2_CONFIG_KILLER })` 로 옛 값을 그대로
 * 되살릴 수 있다. 재수집도 재빌드도 필요 없다 — `ZoneCountLike` 가 두 자리를 다 들고 있고
 * 나누는 일은 읽을 때 한 번뿐이기 때문이다.
 *
 * ⚠ **두 판을 한 화면에 나란히 놓지 않는다.** ① 은 두 해석의 상관이 **음수**라
 * (-0.046 / -0.190) 같은 것의 눈금 차이가 아니다. 섞으면 거짓이 된다.
 */
export const CLAN_HEX_V2_CONFIG_KILLER: ClanHexV2Config = {
  ...CLAN_HEX_V2_CONFIG,
  zoneAttribution: 'killer',
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
/**
 * 구역을 **누구 자리로** 셌나. 두 칸을 다 저장한다 — 고르는 것은 읽을 때다.
 *
 * ⚠ **정정 (2026-09-02 · D-256)** — `byKiller` 주석이 «**화면이 쓰는 기준이다**
 * (D-235 「남은 미확인」)» 였다. **더 이상 아니다.** 사용자가 *"죽은 사람이 에이쪽에 있는거지"*
 * 라고 확정해 화면 기준은 `byVictim` 이 됐다. 어느 칸을 쓸지는
 * `ClanHexV2Config.zoneAttribution` 이 정하고, 분기는 `zoneCountOf` 한 곳에만 있다.
 *
 * **두 칸을 다 저장하는 구조는 그대로 둔다.** 해석이 또 바뀌어도 재수집 없이 되돌아갈 수 있다.
 */
export interface ZoneCountLike {
  /** 잡은 사람(우리)이 서 있던 자리 — 2026-09-01 까지의 화면 기준. 지금은 안 쓴다 */
  byKiller: number
  /** 죽은 상대 스나가 서 있던 자리 — **지금 화면이 쓰는 기준이다** (D-256) */
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
/**
 * ① **스나싸움** — 스나 대 스나 (2026-09-02 · D-256). **구역을 안 쓴다**
 *
 * 사용자 원문: *"A팀스나가 B팀스나를 잡은횟수랑 그 반대횟수를 비교하는거야"*
 * 분모는 사용자가 **`won / (won + lost)`** 로 골랐다. `rounds` 는 고르지 않은 후보
 * `(won - lost) / rounds` 를 나중에 만들 수 있게 **함께 저장한 것**이다.
 */
export interface SniperDuelTallyLike {
  rounds: number
  won: number
  lost: number
}

/** ⑤ **선짤** — 라운드 첫 킬 (2026-09-02 · D-256) */
export interface FirstBloodTallyLike {
  /** 첫 킬이 있고 **동시각이 아닌** 라운드 수 = 분모 */
  rounds: number
  won: number
  /** 동시각이라 양 팀 다 분모에서 뺀 라운드 (사용자 (가)). **버리지 않고 센다** */
  tiedRounds: number
}

/** ⑥ **교환** — 팀원이 죽은 「직후」 되잡기 (2026-09-02 · D-256) */
export interface TradeTallyLike {
  /** 우리 팀원이 상대에게 죽은 수 = 분모 */
  deaths: number
  within3: number
  /** 사용자가 고른 창 */
  within5: number
  within10: number
  sameRound: number
}

export interface ClanHexTallyLike {
  teamNo: string
  foeTeamNo: string | null
  rounds: number
  sidedRounds: number
  redRounds: number
  foeSnipers: number

  /* ── 지금 화면이 쓰는 축 (D-256) ── */
  sniperDuel: SniperDuelTallyLike | null
  firstBlood: FirstBloodTallyLike | null
  trade: TradeTallyLike | null
  outnumbered: OutnumberedTallyLike | null
  save: SaveTallyLike | null
  tempo: TempoTallyLike | null

  /* ── 옛 축. **화면이 안 본다. 지우지 않는다** (`CLAUDE.md` 10-4) ──
     계산은 계속 돌고 저장도 된다. 사용자가 포지션 판정을 이유로 ⑤⑥ 을 뺐으므로
     그게 좋아지면 되살릴 수 있어야 하고, 그때 재수집이 필요하지 않아야 한다 */
  sniperFight: SniperFightTallyLike | null
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
  /**
   * ⑥ 이 **실제로** 쓴 구역 수.
   *
   * ⚠ 정정 (2026-09-02) — 이 주석은 «(지금 2)» 였다. 좌표가 넷 다 생겼으므로
   * **`clan-hex-v2.2` 로 다시 만든 행은 4** 다. 옛 행(`v2.1`)은 그대로 2다 —
   * 집계 당시 파일에 둘밖에 없었기 때문이고, 그 사실이 값과 함께 남는 것이 맞다.
   */
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
    sniperDuel: null,
    firstBlood: null,
    trade: null,
    outnumbered: null,
    save: null,
    tempo: null,
    sniperFight: null,
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

  /* ── 지금 화면이 쓰는 축 셋 (D-256). **비율을 평균 내지 않는다** — 분자·분모를 쌓는다 ── */
  sum.sniperDuel = sumParts(
    tallies.map((tally) => tally.sniperDuel),
    (): SniperDuelTallyLike => ({ rounds: 0, won: 0, lost: 0 }),
    (into, from) => {
      into.rounds += from.rounds
      into.won += from.won
      into.lost += from.lost
    },
  )

  sum.firstBlood = sumParts(
    tallies.map((tally) => tally.firstBlood),
    (): FirstBloodTallyLike => ({ rounds: 0, won: 0, tiedRounds: 0 }),
    (into, from) => {
      into.rounds += from.rounds
      into.won += from.won
      into.tiedRounds += from.tiedRounds
    },
  )

  sum.trade = sumParts(
    tallies.map((tally) => tally.trade),
    (): TradeTallyLike => ({ deaths: 0, within3: 0, within5: 0, within10: 0, sameRound: 0 }),
    (into, from) => {
      into.deaths += from.deaths
      /* 창 넷을 다 쌓는다 — 창을 바꿔도 **재빌드 없이** 바뀜다 */
      into.within3 += from.within3
      into.within5 += from.within5
      into.within10 += from.within10
      into.sameRound += from.sameRound
    },
  )

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
 * ① sniperFight  aSideKills[자리] + bLongKills[자리]          / redRounds       라운드당 킬수
 * ② outnumbered  won                                          / rounds          비율
 * ③ save         won                                          / rounds          비율
 * ④ tempo        redClearThreeSecondsLowerBoundSum            / redClearThreeRounds   초 (짧을수록 좋다)
 * ⑤ lastSniper   redWonSniperLast                             / redWonRounds    비율
 * ⑥ attackZone   redWonZoneSniperRounds[자리]                 / redWonRounds    비율
 * ```
 *
 * ⚠ **`[자리]` 는 2026-09-02 에 `byKiller` 에서 `byVictim` 으로 바뀌었다** (D-256).
 * 옛 표기는 `① aSideKills.byKiller + bLongKills.byKiller` · `⑥ redWonZoneSniperRounds.byKiller`
 * 였다. 사용자가 *"죽은 사람이 에이쪽에 있는거지"* 라고 확정했다. 지금은 `config.zoneAttribution`
 * 이 고르고 기본이 `'victim'` 이다. `CLAN_HEX_V2_CONFIG_KILLER` 를 주면 옛 값이 그대로 나온다.
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
  /* ⚠ `config.zoneAttribution` 은 **지금 여섯 축 중 아무것도 안 쓴다** (D-256).
     사용자가 ① 을 스나 대 스나로 바꾸고 ⑤⑥ 을 빼면서 구역을 보는 축이 사라졌다.
     설정과 `zoneCountOf` 를 **지우지 않는다** — 옛 축이 되살아나면 그대로 쓴다 (`CLAUDE.md` 10-4) */

  const axes: ClanHexV2Axis[] = CLAN_HEX_V2_AXIS_KEYS.map((key) => {
    if (tally === null) return pendingAxis(key, 'battlelog')
    switch (key) {
      /**
       * ① **스나싸움** — 스나 대 스나 (D-256). **구역도 진영도 안 본다.**
       *
       * 분모는 사용자가 `won + lost` 를 골랐다. 둘 다 0 이면 **교전이 한 번도 없었다**는
       * 뜻이지 «못 했다» 가 아니다. 그래서 0 이 아니라 `sample` 이다 (D-106).
       */
      case 'sniperDuel': {
        const part = tally.sniperDuel
        if (part === null) return pendingAxis(key, tallyMissingReason(tally, true))
        const duels = part.won + part.lost
        if (duels === 0) return pendingAxis(key, 'sample', { numerator: part.won })
        return measuredAxis(key, part.won, duels)
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
      /**
       * ⑤ **선짤** — 라운드 첫 킬을 우리가 냈나 (D-256).
       *
       * 분모는 **첫 킬이 있고 동시각이 아닌** 라운드 수다. 동시각은 양 팀 다 미리 뺀다
       * (사용자 (가) · 실측 4.48%). 그 수는 `tiedRounds` 에 남아 있다.
       */
      case 'firstBlood': {
        const part = tally.firstBlood
        if (part === null) return pendingAxis(key, tallyMissingReason(tally, false))
        if (part.rounds === 0) return pendingAxis(key, 'sample', { numerator: part.won })
        return measuredAxis(key, part.won, part.rounds)
      }
      /**
       * ⑥ **교환** — 팀원이 죽은 「직후」 그 킬러를 되잡았나 (D-256).
       *
       * 「직후」는 `config.tradeWindow` 가 고른다 (사용자 확정 **5초**).
       * tally 가 창 넷을 다 들고 있어서 창을 바꿔도 **재빌드가 필요 없다.**
       */
      case 'trade': {
        const part = tally.trade
        if (part === null) return pendingAxis(key, tallyMissingReason(tally, false))
        const back = tradeCountOf(part, config.tradeWindow)
        if (part.deaths === 0) return pendingAxis(key, 'sample', { numerator: back })
        return measuredAxis(key, back, part.deaths)
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
