/**
 * **클랜 육각형 V2** — 배틀로그 원문 한 건에서 여섯 축의 **분자/분모**를 뽑는다
 * (`docs/CLAN_HEXAGON_V2_SPEC.md` · D-217).
 *
 * 순수 함수만 있다. DB 도 네트워크도 모른다. `roundState.ts` · `roundSide.ts` ·
 * `clanRound.ts` · `duel.ts` 의 형제 모듈이고, **라운드 복원과 진영 판정을 새로 짜지 않는다** —
 * 그 넷을 그대로 부른다.
 *
 * ── 여섯 축 (사양 2장)
 *
 * ```
 * ① 스나싸움     레드일 때 상대 스나를 잡은 킬을 `A쪽` / `B롱` 으로 나눠 센다
 * ② 소수싸움     기존 클랜 정의 그대로 (D-202) — 이 축만 진영을 보지 않는다
 * ③ 세이브       우리 생존자가 1명이 된 적이 있는 라운드 중 이긴 비율
 * ④ 게임템포     레드일 때 상대 3명을 지우기까지 걸린 초 — **짧을수록 좋다**
 * ⑤ B어택성공    이긴 라운드 중 상대 스나가 **마지막에** 죽은 라운드
 * ⑥ A어택성공    상대 스나를 **이름 있는 구역**에서 잡고 그 라운드를 이긴 라운드
 * ```
 *
 * ── **비율이 아니라 분자/분모를 돌려준다**
 *   경기 단위로 저장한 뒤 클랜 평균을 낼 때 **비율을 다시 평균 내면 틀린다** —
 *   5라운드 경기가 18라운드 경기와 같은 무게를 갖는다. 분자와 분모를 따로 쌓아
 *   마지막에 한 번만 나눈다. 비율은 부르는 쪽이 만든다 (`clanRound.ts` 의 `rateOf`).
 *
 *   못 잰 축은 **`null` 이다. 0 이 아니다** (D-106). 0 은 "겪었는데 없었다" 라는
 *   실제 관측이고, `null` 은 "셀 수 없다" 이다. 화면에서는 `측정중` 이다.
 *
 * ── **한 응답으로 양쪽 클랜이 다 나온다**
 *   클랜 단위 배틀로그 한 건에 양 팀 10명이 함께 실려 온다 (D-184 실측).
 *   폭파미션은 한 라운드에 공격이 한 팀뿐이므로 상대 진영은 우리 진영을 뒤집은 것이고
 *   (D-208), 라운드 승패도 뒤집은 것이다. 그래서 `byTeam` 에 두 팀이 다 담긴다.
 *
 *   ⚠ **`win_flag` 는 조회한 클랜 기준이다** (D-184). `wonRound` 를 넘길 때 그 응답의
 *   주인(`teamNo`)과 짝이 맞아야 한다. 안 넘기면 `roundResultsOf(events)` 를 쓴다.
 *
 * ── 무엇을 **못** 재는지 먼저 적는다
 *
 *   1. **라운드 시작 시각이 관측되지 않는다.** 배틀로그에 라운드 시작 이벤트가 없다.
 *      그래서 ④ 는 `그 라운드 첫 이벤트 → 상대 3번째 사망` 만 잴 수 있고 **실제 값의
 *      하한**이다. 필드 이름에 그 사실을 박아 뒀다 (`redClearThreeSecondsLowerBound`).
 *      `clanRound.ts` 의 옛 `tempoOf`/`roundSpans`(라운드 길이 중앙값)와는 **정의가 다른
 *      지표다. 섞지 않는다** (사양 6장).
 *   2. ~~**`녹뒤` · `머리` 구역의 좌표가 없다**~~ (⑥-1) →
 *      ### ⚠ **정정 (2026-09-01) — 넷이 다 있다. 이 줄은 더 이상 사실이 아니다**
 *      사용자가 `design/zone-paint.html` 로 **직접 칠했다.** 지금
 *      `data/barracks/style-zones.json` 에는 **8곳이 다 있고**
 *      (`BIRONG · BUNKER · GJA · DALBANG · SEOLDAE · CONDWI · NOKDWI · MERI`),
 *      `A_ATTACK_ZONE_LABELS_MISSING` 이 **빈 배열**이다. 자세한 것은 그 상수의 주석.
 *
 *      **이 낡은 서술이 실제로 사람을 속였다** (2026-09-01) — 이 머리말만 읽고
 *      「녹뒤·머리 좌표가 없다」고 사용자에게 보고한 일이 있었다. 지우지 않고 남기되
 *      (`CLAUDE.md` 10-4), **여기서 먼저 정정을 만나게** 해 둔다.
 *
 *      <아래는 그때의 서술이다>
 *      사용자가 말한 넷 중 `컨뒤` · `에이설대`
 *      둘만 `data/barracks/style-zones.json` 에 있다. 없는 지명을 지어내지 않는다.
 *      그래서 ⑥ 은 **둘만으로** 세고, 이름 없는 자리에서 난 킬이 몇인지를 함께 돌려준다
 *      (실측 57.8%). 나중에 사용자가 두 곳을 칠하면 무엇이 달라지는지 그 숫자로 안다.
 *   3. **`A쪽` 이 어디까지인지 모른다** (①-2). 그래서 구역을 **입력으로 받는다.**
 *      안 주면 그 칸은 `null` 이고, 자리를 안 나눈 총합(`foeSniperKills`)만 남는다.
 *      ⚠ `data/barracks/sniper-lane.json` 은 **폐기 표시가 붙어 있다** (실제 사격 위치의
 *      16.2%만 덮는다). 그 파일을 `A쪽`·`B롱` 으로 쓰지 않는다.
 *   4. **① 의 `비교` 가 무엇을 견주는 말인지 모른다** (①-1). 그래서 여기서는
 *      `aSideKills` · `bLongKills` · `redRounds` 를 **따로** 낸다. 합이든 비율이든
 *      상대 클랜과의 비교든, 나중에 어느 해석이든 이 셋으로 만들 수 있다.
 *      **여기서 해석을 고르지 않는다.**
 *   5. **⑤ 의 `B` 가 B사이트인지 모른다** (⑤-1). 정의문에 자리 조건이 없어서 자리로
 *      좁히지 않았다. 대신 진영을 본 것(`redWon*`)과 안 본 것(`won*`)을 둘 다 낸다.
 *   6. **⑤ · ⑥ 의 분모가 확정되지 않았다** (⑤-3). `redRounds` · `redWonRounds` 를
 *      함께 담아 어느 쪽으로도 나눌 수 있게 했다.
 *   7. **구역을 누구 자리로 판정하는지 모른다** — 이 파일이 새로 찾은 `[미확인]` 이다
 *      (①-3 · ⑥-2). `에이쪽에서 잡은` · `컨뒤에서 죽인` 은 잡은 사람이 거기 있었다는
 *      말로도, 죽은 스나가 거기 있었다는 말로도 읽힌다. 실측(클랜 응답 300건 ·
 *      상대 스나 킬 4,362)에서 여섯 구역 적중률이 `죽인 쪽` 35.4% · `죽은 쪽` 47.3% 로
 *      **크게 달랐다.** 그래서 `ZoneCount` 로 **둘 다** 낸다. 고르지 않는다.
 *
 * ── 상대 무기는 **death 행**에서 온다
 *   클랜 응답에는 우리 선수가 죽은 줄이 함께 오고, 그 줄의 `target_weapon` 이
 *   **죽인 사람(=상대)** 의 무기다. `killsOf()` 가 이미 그 짝을 맞춰 읽으므로
 *   (`duel.ts`), `weaponByPlayerOf()` 로 상대 선수의 무기까지 되짚을 수 있다.
 *   실측: 경기×상대선수 97.8% 판정 · 상대팀 스나 1명 확정 경기 95.3%.
 *
 *   **상대 스나를 한 명도 못 짚은 경기는 ①⑤⑥ 을 통째로 `null` 로 둔다.** 0 으로 두면
 *   "스나를 한 번도 못 잡았다" 가 되어 못 잰 경기가 최악의 성적으로 보인다 (D-106).
 *   ⚠ 상대가 **정말로 스나를 안 들었을** 수도 있는데 그 둘을 가르지 못한다 `[미확인]`.
 *
 * ── 이벤트가 온전한 경기에서만 세는 축이 있다
 *   `②③④⑤` 는 "몇 명 남았나" · "누가 마지막에 죽었나" 를 보므로 이벤트가 한 명분이라도
 *   빠지면 조용히 거짓이 된다. 그래서 양 팀이 정확히 `teamSize` 명 확인된 경기에서만
 *   센다 (`isRestorable` · 실측 복원율 99.7%). `①⑥` 은 킬을 세는 축이라 빠진 이벤트가
 *   값을 **낮추는** 쪽으로만 틀리므로 표본을 버리지 않는다.
 */
import { judgeExchange, judgeShort, type SideKill, type SideVerdict } from './sideAxes'
import {
  bombScore,
  emptyMatchScore,
  killScore,
  saveScore,
  scoreSlotOf,
  type MatchScoreTally,
} from './matchScore'
import {
  outnumberedRound,
  roundClocksOf,
  type ClanRoundEvent,
} from './clanRound'
import {
  inZone,
  killsOf,
  weaponByPlayerOf,
  type DuelEvent,
  type Weapon,
  type ZoneCells,
} from './duel'
import { playstyleKillsOf, type PlaystyleEvent, type PlaystyleKill } from './playstyle'
import {
  isRestorable,
  rosterOf,
  roundStatesOf,
  type RoundDeath,
} from './roundState'
import {
  bombEvidenceOf,
  roundResultsOf,
  roundSidesOf,
  type BombEvidence,
  type RoundResultEvent,
  type RoundSide,
} from './roundSide'

/** 클랜전은 5대5 다 */
export const CLAN_HEX_TEAM_SIZE = 5

/** ④ 가 재는 것 — 상대를 **이만큼** 지우기까지 걸린 시간 (사양 원문 "3명 이상 제거") */
export const TEMPO_CLEAR_KILLS = 3

/**
 * ⑥ 이 쓸 수 있는 구역 이름 — **넷이 다 있다** (⑥-1 · D-183).
 *
 * `data/barracks/style-zones.json` 의 라벨 키다.
 *
 * ⚠ 정정 (2026-09-01) — 이 주석은 «넷 중 **둘**뿐이다» 였다. **값은 늘 넷이었는데
 * 주석만 낡아 있었다.** 좌표가 없던 `녹뒤`·`머리` 를 사용자가 칠해서 지금은 넷이 다 돈다
 * (`A_ATTACK_ZONE_LABELS_MISSING` 주석). 낡은 서술이 실제로 사람을 속인 적이 있다.
 */
export const A_ATTACK_ZONE_LABELS = ['CONDWI', 'SEOLDAE', 'NOKDWI', 'MERI'] as const

/**
 * ⚠ **정정 (2026-09-01) — `녹뒤`·`머리` 의 좌표가 생겼다. 이제 넷이 다 있다.**
 *
 * 위 머리말의 «넷 중 둘뿐이다» 는 서술은 **그때는 맞았다.** 지우지 않고 여기 정정을 단다
 * (`CLAUDE.md` 10-4).
 *
 * 어떻게 생겼나 — 사용자가 **직접 칠했다.**
 * 실제 킬 좌표 568,138건을 같은 격자에 얹은 도구를 만들어 드렸고(`design/zone-paint.html`),
 * 이미 칠해진 여섯 구역을 지형지물로 놓고 그 위에 손으로 칠했다.
 *
 * ```
 * 머리  x 33~35 · y 26~27   6칸
 * 녹뒤  x 36~38 · y 26~27   6칸
 * ```
 *
 * 둘은 **가로로 맞붙은 띠**다. 기존 칸과 겹친 것은 **한 칸도 없다.**
 *
 * 그래서 이 상수는 이제 **비어 있다.** 지우지 않는 이유는 «한때 없었다» 는 기록이기 때문이고,
 * 나중에 또 이름만 있고 좌표가 없는 구역이 생기면 여기에 넣는다.
 */
export const A_ATTACK_ZONE_LABELS_MISSING = [] as const

/** ① 의 `B롱` — 구역 파일의 `비롱` 이다 */
export const B_LONG_ZONE_LABEL = 'BIRONG'

/**
 * ★A롱★ — 스나싸움(①)의 **A쪽 롱**. 사장님이 2026-09-10 에 정의했다.
 *
 * > "에이롱에서 죽었다 라고 하면 컨뒤 녹뒤 머리 홀정면과 ㄱ자 에서 죽은걸 에이롱에서
 * >  죽었다고 하는건데" — 사용자, 2026-09-10
 *
 * 위 `A_ATTACK_ZONE_LABELS`(자리 축 ⑥ 의 A어택 4구역)과 **다르다** — 설대가 빠지고
 * 홀정면·ㄱ자가 들어간다. 홀정면(`HOLJEONG`)은 같은 날 사장님이 새로 칠했다 (268칸 판).
 */
export const A_LONG_ZONE_LABELS = ['CONDWI', 'NOKDWI', 'MERI', 'HOLJEONG', 'GJA'] as const

/**
 * ★스나싸움을 어디서 세나★ (2026-09-10 · 사장님 확정)
 *
 * - `'long-only'` — **지금 쓰는 것.** A롱(5구역) 또는 비롱 안에서 **잡은 쪽과 죽은 쪽이
 *   둘 다** 롱 안에 있을 때만 스나싸움이다. "둘다 그 구역 안에 있어야함" — 사용자.
 *   구역 파일이 없으면 `sniperDuel` 은 `null`(못 잼)이다 — 맵 전체를 세어 놓고
 *   스나싸움이라 부르지 않는다.
 * - `'anywhere'` — 옛 판(clan-hex-v2.3 까지). 스나 대 스나 킬을 맵 어디서든 셌다.
 *   지우지 않는다 (`CLAUDE.md` 1-4). 값만 바꾸면 옛 판으로 돌아간다.
 */
export const SNIPER_DUEL_ZONE_RULE: 'long-only' | 'anywhere' = 'long-only'

/**
 * 이 모듈이 보는 칸 — 라운드 복원 · 진영 판정 · 킬 좌표 · 라운드 승패를 합친 것이다.
 *
 * `win_flag` 가 들어 있는 이유는 `wonRound` 를 안 넘겼을 때 `roundResultsOf()` 로
 * 되짚기 때문이다. **그 값은 조회한 클랜 기준이다** (D-184).
 */
export interface ClanHexEvent
  extends ClanRoundEvent,
    DuelEvent,
    PlaystyleEvent,
    RoundResultEvent {}

/**
 * 구역 입력. **하나도 주지 않아도 된다** — 그러면 자리를 나누는 칸이 `null` 이 된다.
 *
 * 파일을 읽지 않는다. 이 모듈은 순수 함수라 `data/barracks/*.json` 을 모른다.
 * 부르는 쪽이 `zoneCellsOfLabels()` 로 만들어 넘긴다.
 */
/** ★구역별 어택★ 의 그릇 — 넷을 한 덩어리로 담는다 (2026-09-17) */
export interface ZoneAttackTally {
  aN: number; aOk: number
  bN: number; bOk: number
  f2N: number; f2Ok: number
  shortN: number; shortOk: number
}

export interface ClanHexZones {
  /** ① `A쪽` — **확정된 구역 이름이 아니다** (①-2). 안 주면 `aSideKills` 가 `null` */
  aSide?: ZoneCells | null
  /** ① `B롱`(비롱) */
  bLong?: ZoneCells | null
  /** ★A롱 5구역★ (`A_LONG_ZONE_LABELS`) — 스나싸움(①) 전용. 자리 축의 `aSide` 와 다르다 */
  aLong?: ZoneCells | null
  /**
   * ⑥ 어택 성공으로 인정하는 구역.
   *
   * ⚠ 정정 (2026-09-01) — «지금은 `컨뒤` + `A설대` 둘뿐이다» 였다. **이제 넷이 다 있다**
   * (`컨뒤`·`A설대`·`녹뒤`·`머리`). 무엇을 넣을지는 여전히 부르는 쪽이 정한다.
   */
  attack?: ZoneCells | null
  /** ⑥ 에 실제로 쓴 구역 이름 — 값의 출처를 함께 남기려는 것뿐이다 */
  attackLabels?: readonly string[]
  /**
   * ★구역별 어택★ 넷 (2026-09-17 사장님). 규칙은 `sideAxes.ts` 하나뿐이다.
   * 안 주면 `zoneAttack` 이 `null` 이고 화면이 «측정중» 이라 적는다.
   */
  sideA?: ZoneCells | null
  sideB?: ZoneCells | null
  sideF2?: ZoneCells | null
  sideShort?: ZoneCells | null
}

/* -------------------------------------------------------------------------- */
/* 구역 파일 → 셀 집합                                                          */
/* -------------------------------------------------------------------------- */

/** `data/barracks/style-zones.json` 의 모양 중 우리가 보는 칸만 */
export interface LabeledZoneFile {
  cell: number
  /** `"x,y"` → 라벨 키 */
  zone: Record<string, string>
}

/**
 * 라벨 몇 개를 골라 `ZoneCells` 로 만든다.
 *
 * **없는 라벨을 지어내지 않는다** — 파일에 없는 이름을 주면 그 이름은 그냥 0칸이고,
 * 부르는 쪽이 `cells.length` 로 확인할 수 있다.
 */
export function zoneCellsOfLabels(
  file: LabeledZoneFile,
  labels: readonly string[],
): ZoneCells {
  const wanted = new Set(labels)
  const cells: string[] = []
  for (const [key, label] of Object.entries(file.zone)) {
    if (wanted.has(label)) cells.push(key)
  }
  return { cell: file.cell, cells }
}

/* -------------------------------------------------------------------------- */
/* 축별 그릇                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * **어느 자리로 구역을 판정했나** — 둘 다 낸다. 고르지 않는다 (`[미확인]` ①-3 · ⑥-2).
 *
 * 원문 `에이쪽에서 상대스나를 잡은` · `상대스나이퍼를 (…) 컨뒤 (…) 에서 죽인` 은
 * **누가 그 자리에 있었는지**를 말하지 않는다. 두 읽기가 다 성립한다.
 *
 * ```
 * byKiller  잡은 사람(우리)이 서 있던 자리 — `duel.ts` 의 선수 스나싸움이 쓰는 기준
 * byVictim  죽은 상대 스나가 서 있던 자리 — `컨뒤`·`A설대` 는 수비 스나가 앉는 자리다
 * ```
 *
 * 실측(2026-09-01 · 클랜 응답 800건 · 레드 라운드의 상대 스나 킬 4,323):
 *
 * ```
 *                              byKiller   byVictim
 * 컨뒤+A설대 안에서 난 킬          2.0%      32.2%
 * ⑥ 성공률 (이긴 레드 라운드 중)    2.4%      28.5%
 * ```
 *
 * 다른 조사가 먼저 잰 값(⑥ 25.5% · 이름 없는 자리 57.8%)에 가까운 쪽은 **`byVictim`** 이다.
 * 말이 되는 결과이기도 하다 — `컨뒤`·`A설대` 는 **수비 스나가 앉는 자리**이고, 레드(공격)인
 * 우리가 거기 서 있을 일은 드물다. 그래도 **여기서 고르지 않는다.** 사용자 원문이
 * 어느 쪽인지 말하지 않았고, 값이 이만큼 갈리는 것은 지어낼 수 있는 차이가 아니다.
 */
export interface ZoneCount {
  byKiller: number
  byVictim: number
}

/** ① 스나싸움 — **해석을 고르지 않는다.** 재료만 낸다 (①-1) */
export interface SniperFightTally {
  /** 진영=레드로 확정된 라운드 수 */
  redRounds: number
  /** 그 라운드들에서 우리가 잡은 **상대 스나** 총수 (자리를 안 나눈 값) */
  foeSniperKills: number
  /** 그중 좌표를 아는 킬 — 아래 자리별 칸의 분모다 */
  killsWithPosition: ZoneCount
  /** `A쪽` 구역 안. **구역을 안 주면 `null`** (①-2 미확인) */
  aSideKills: ZoneCount | null
  /** `B롱` 구역 안. 구역을 안 주면 `null` */
  bLongKills: ZoneCount | null
  /** 두 구역 어디에도 안 든 킬. **두 구역을 다 줘야** 값이 나온다 */
  unzonedKills: ZoneCount | null
}

/** ② 소수싸움 — 기존 클랜 정의 그대로 (D-202) */
export interface OutnumberedTally {
  /** 숫자가 밀린 순간이 있었고 **승패까지 아는** 라운드 (분모) */
  rounds: number
  /** 그중 이긴 라운드 (분자) */
  won: number
}

/**
 * ③ 세이브 — **클랜 단위 정의는 사용자가 확인해 준 적이 없다** (③-1).
 *
 * 여기서 쓴 읽기: `우리 생존자가 1명이 된 순간이 있었던 라운드 중 이긴 비율`.
 * 사용자 원문이 *"1대1이든 1대2든 전부 세이브로 간주"* 라고 못 박았으므로
 * **1대1을 빼지 않는다.**
 */
export interface SaveTally {
  /** 우리가 1명까지 몰렸고 **승패까지 아는** 라운드 (분모) */
  rounds: number
  /** 그중 이긴 라운드 (분자) */
  won: number
}

/**
 * ④ 게임템포 — ⚠ **전부 하한값이다.**
 *
 * 라운드 시작 시각이 관측되지 않아 `그 라운드 첫 이벤트` 를 시작으로 삼는다.
 * 실제 시작(스폰·구매)은 그보다 앞이므로 **재는 구간은 항상 실제보다 짧다.**
 */
export interface TempoTally {
  /** 진영=레드로 확정된 라운드 수 (참고값) */
  redRounds: number
  /** 그중 상대를 3명 지운 라운드 — **분모** */
  redClearThreeRounds: number
  /** 그 라운드들의 초. **하한이다** (위 설명) */
  redClearThreeSecondsLowerBound: number[]
  /** 그 초의 합 — 여러 경기를 이어 붙일 때 평균의 분자로 쓴다 */
  redClearThreeSecondsLowerBoundSum: number
  /** 3명을 못 지운 레드 라운드 — **분모에서 뺐다** (④-2 미확인) */
  redRoundsWithoutThreeClears: number
  /**
   * ★라운드가 실제로 몇 초에 끝났나★ (2026-09-14 저녁 사장님).
   *   30초 미만(역개)·140초 초과는 세지 않는다 — 아래 `roundLengthDropped*` 에 남는다.
   */
  roundLengthRounds: number
  roundLengthSecondsSum: number
  roundLengthDroppedShort: number
  roundLengthDroppedLong: number
}

/**
 * ⑤ B어택성공 — `이긴 라운드 중 상대 스나가 가장 마지막에 죽은 라운드`.
 *
 * 진영을 본 것과 안 본 것을 **둘 다** 낸다. 이름의 `B` 가 B사이트인지 모르기 때문이다 (⑤-1).
 */
export interface LastSniperTally {
  /** 이긴 **레드** 라운드 중 판정할 수 있었던 것 (분모) */
  redWonRounds: number
  /** 그중 상대 스나가 마지막에 죽은 라운드 (분자) */
  redWonSniperLast: number
  /** 진영을 보지 않은 같은 계산 — ⑤-1 의 다른 해석을 위해 함께 낸다 */
  wonRounds: number
  wonSniperLast: number
  /** 이겼는데 상대가 **아무도 안 죽은** 라운드 — 분모에서 뺐다 (⑤-2 미확인) */
  noFoeDeathRounds: number
  /** 마지막에 죽은 상대의 무기를 몰라 뺀 라운드 */
  unknownLastWeaponRounds: number
  /** 같은 초에 둘 이상 죽어 **누가 마지막인지 못 가린** 라운드 */
  ambiguousLastRounds: number
}

/**
 * ⑥ A어택성공 — `상대 스나를 그 자리에서 잡고 그 라운드를 이긴 라운드`.
 *
 * 사용자가 *"저 위치중 한곳에서 잡았는데 라운드 못따면 어택성공X"* 라고 직접 못 박았다.
 * 그래서 못 딴 라운드도 따로 센다 — 자리에서 잡는 것 자체는 했는지 보이게.
 */
export interface AttackZoneTally {
  /** 진영=레드로 확정된 라운드 수 */
  redRounds: number
  /** 그중 이긴 라운드 (⑤ 와 같은 분모 후보 · ⑤-3) */
  redWonRounds: number
  /** 이름 있는 구역에서 상대 스나를 잡고 **이긴** 라운드 (분자) */
  redWonZoneSniperRounds: ZoneCount
  /** 잡았는데 라운드를 **못 딴** 라운드 — 성공이 아니다 */
  redLostZoneSniperRounds: ZoneCount
  /** 레드 라운드에서 잡은 상대 스나 킬 중 **좌표를 아는** 것 (아래 둘의 분모) */
  sniperKillsWithPosition: ZoneCount
  /** 그중 이름 있는 구역 안 */
  sniperKillsInNamedZone: ZoneCount
  /**
   * 그중 **어느 이름도 없는 자리**.
   *
   * ⚠ 정정 (2026-09-01) — 예전에는 «`녹뒤`·`머리` 가 여기 섞여 있다» 였다.
   * **이제 아니다.** 그 둘은 칠해져서 이름 있는 구역이 됐다
   * (`A_ATTACK_ZONE_LABELS_MISSING` 주석). 지금 여기 남는 것은 **정말 이름 없는 자리**다.
   */
  sniperKillsOutsideNamedZone: ZoneCount
  /**
   * 판정에 쓴 구역 이름을 값과 함께 남긴다.
   *
   * ⚠ 정정 (2026-09-01) — 예전 주석은 «넷 중 **둘**뿐» 이었다. **지금은 넷이 다 있다.**
   */
  zoneLabels: readonly string[]
}

/* ==========================================================================
 * 2026-09-02 — 사용자가 축 셋을 다시 정했다 (D-256).
 *
 * ```
 * ① 스나싸움  구역으로 나누던 것을 그만둔다 → **스나 대 스나**
 * ⑤ B어택성공 → **선짤**
 * ⑥ A어택성공 → **교환**
 * ```
 *
 * ── 옛 칸(`SniperFightTally` · `LastSniperTally` · `AttackZoneTally`)을 **지우지 않는다**
 *   (`CLAUDE.md` 10-4). 계산도 계속 돈다. **읽는 쪽이 안 볼 뿐이다.**
 *   사용자가 *"포지션 판정이 미덥잖다"* 는 이유로 ⑤⑥ 을 뺐으므로, 포지션이 좋아지면
 *   되살릴 수 있다. 그때 재수집이 필요하지 않아야 한다.
 *
 * ── **분자·분모만 저장한다. 비율은 읽을 때 만든다** (D-235)
 *   ①의 분모와 ⑥의 「직후」 창은 사용자가 골랐지만, 고르지 않은 후보의 재료도 **함께 저장**한다.
 *   오늘 `byKiller`/`byVictim` 에서 겪었다 — 둘 다 저장돼 있어서 재수집 없이 바꿀 수 있었다.
 * ========================================================================== */

/**
 * ① **스나싸움** — 스나 대 스나 (2026-09-02 · 사용자 재정의).
 *
 * 사용자 원문:
 * > "걍 에롱 비롱 필요없고(에이롱에서 잡았네 비롱에서 잡았네 이런거 걍 하지말자 힘들다)
 * >  **A팀스나가 B팀스나를 잡은횟수랑 그 반대횟수를 비교하는거야**"
 *
 * **구역을 안 쓴다.** 그래서 이 축에는 `byKiller`/`byVictim` 문제가 아예 없다.
 *
 * ── 「비교」를 어떻게 숫자 하나로 만드나 — **사용자가 골랐다**
 *   후보 셋을 실측해 보였고(로컬 6,844경기 · 클랜 139곳) 사용자가 **(a)** 를 골랐다.
 *
 *   ```
 *   (a) won / (won + lost)      중앙 0.502 · 0~1 로 갇힌다 · 0.5 가 대등   ← 확정
 *   (b) won / lost              중앙 1.009 · 상한이 없다
 *   (c) (won - lost) / rounds   중앙 0.003 · 음수가 나온다
 *   ```
 *
 *   ⚠ **셋이 클랜을 똑같이 가른다.** 순위상관 (a)↔(b) 1.000 · (a)↔(c) 0.999 —
 *   셋 다 `won/lost` 의 단조 변환이라 수학적으로 그럴 수밖에 없다. 고른 것은
 *   **변별력이 아니라 읽기 좋은 눈금**이다. 그래서 `rounds` 도 함께 저장해 (c) 를 남겨 둔다.
 *
 * ── ⚠ 못 세는 것
 *   무기를 모르는 킬이 **13.8%** 다 (수류탄·근접 등, 실측 565,449건 중 78,220건).
 *   그건 어느 쪽으로도 안 센다. 값을 **낮추는 쪽으로만** 틀린다.
 */
export interface SniperDuelTally {
  /** 이벤트로 확인된 라운드 수 — (c) 후보를 나중에 만들 수 있게 남긴다 */
  rounds: number
  /** 우리 스나가 상대 스나를 잡은 수 */
  won: number
  /** 상대 스나가 우리 스나를 잡은 수 */
  lost: number
}

/**
 * ⑤ **선짤** — 라운드의 첫 킬을 우리가 냈나 (2026-09-02 · 신설).
 *
 * ★ 이름은 **「선짤」** 이다. 사용자가 직접 고른 말이다 (「선취점」이 아니다). 바꾸지 마라.
 *
 * ── 동시각 첫 킬 — **양 팀 모두 분모에서 뺀다** (사용자 확정)
 *   `event_time` 이 `MM:SS` 라 **1초 해상도**다. 같은 초에 양 팀이 하나씩 죽으면 누가 먼저인지
 *   알 수 없다. 실측 **6,698 / 149,456 라운드 = 4.48%**. 후보 둘을 보였고
 *   사용자가 **(가) 양 팀 모두 분모에서 뺀다** 를 골랐다.
 *   그 수를 `tiedRounds` 로 **남긴다** — 나중에 «양쪽 다 성공» 으로 바꿀 수 있게.
 *
 * ── ⚠ 못 세는 것
 *   킬 이벤트가 하나라도 빠지면 **첫 킬이 뒤바뀔 수 있다.** ①⑥ 처럼 «값이 낮아지는 쪽으로만»
 *   틀리지 않는다. 다만 복원율이 99.7% 라(`isRestorable` 실측) 영향은 작다고 본다 `[미확인]`.
 */
/**
 * ★스나영향력★ — 스나가 일하면 팀이 얼마나 더 이기나 (2026-09-16 사장님).
 *
 * 두 승률의 ★차★ 다. 그래서 분모가 둘이다:
 *   `won / rounds`           우리 스나가 1킬 이상 낸 라운드의 승률
 *   `quietWon / quietRounds` 우리 스나가 한 명도 못 잡은 라운드의 승률
 *
 * ★우리 스나가 있어야 잰다★ — 스나를 안 쓴 경기는 «침묵» 이 아니라 «해당 없음» 이다.
 */
export interface SniperInfluenceTally {
  /** ⚠ 옛 셈(A) — 우리 스나가 1킬 이상 낸 라운드. 지우지 않는다 (`CLAUDE.md` 1-4) */
  rounds: number
  won: number
  /** ⚠ 옛 셈(A) — 우리 스나가 한 명도 못 잡은 라운드 */
  quietRounds: number
  quietWon: number
  /**
   * ★스나가 «먼저» 죽지 않은 라운드★ (2026-09-16 밤 사장님 «b로 가자»).
   *
   * 라운드에서 죽은 차례 1~2번째에 우리 스나가 ★안 들어간★ 라운드다.
   * 값은 이 승률에서 «먼저 죽은» 라운드 승률을 뺀 것이다.
   *
   * ⚠ 사장님 지적 — «원래 보통 스나가 먼저 죽는게 당연히 치명적이지».
   *   맞다. 전체 실측도 46.1% 대 50.9% 로 어느 팀이나 그렇다.
   *   ★이 축이 재는 것은 그 «당연한 것» 이 아니라 그 정도가 팀마다 얼마나 다른가★ 다.
   *   클랜별 범위 -3.4 ~ +27.1%p — 차가 크면 스나에 크게 기댄 팀이고,
   *   작으면 스나가 죽어도 라플이 수습하는 팀이다.
   */
  aliveRounds: number
  aliveWon: number
  /** 죽은 차례 1~2번째에 우리 스나가 든 라운드 */
  deadEarlyRounds: number
  deadEarlyWon: number
}

/**
 * ★선짤없이 라운드 시작★ — 먼저 맞지 않고 라운드를 연 비율 (2026-09-16 사장님).
 *
 *   값 = 1 − `lost` / `rounds`
 *
 * 옛 ⑤ 선짤은 «25초 안에 겨룬 라운드 중 먼저 딴 비율» 이라 분모가 좁았다.
 * 이 축은 ★분모가 겨룬 라운드 전부★ 이고 «먼저 맞았나» 만 본다.
 * 두 팀 값을 더해도 100% 가 아니다 — 둘 다 안 당한 라운드는 없기 때문이 아니라,
 * 한 라운드에 한 팀만 «당한» 쪽이 되기 때문이다 (동시각은 양 팀 다 뺀다).
 */
export interface FirstBloodlessTally {
  /** 킬이 하나라도 있었던 라운드 수 = 분모 */
  rounds: number
  /** 그중 ★우리 쪽에서 첫 죽음이 난★ 라운드 수 */
  lost: number
  /** 같은 초에 양 팀이 하나씩 죽어 어느 쪽도 «당했다» 로 세지 않은 라운드 */
  tiedRounds: number
}

export interface FirstBloodTally {
  /** 첫 킬이 있고 **동시각이 아닌** 라운드 수 = 분모 */
  rounds: number
  /** 그중 우리가 첫 킬을 낸 라운드 = 분자 */
  won: number
  /** 동시각이라 분모에서 뺀 라운드. **버리지 않고 센다** */
  tiedRounds: number
}

/**
 * ⑥ **교환** — 팀원이 죽은 직후 그 킬러를 되잡았나 (2026-09-02 · 신설).
 *
 * ★ 이름은 **「교환」** 이다. 사용자가 직접 고른 말이다 (「되잡기」·「트레이드」가 아니다).
 *
 * ── 「직후」 — **5초** (사용자 확정)
 *   후보 다섯을 실측해 보였다 (클랜 151곳 · 우리 사망 ≥ 20):
 *
 *   ```
 *   (a) 같은 라운드 안        중앙 0.483   느슨하다 — 「그 라운드에 걔가 죽었다」에 가깝다
 *   (b) 3초 안               중앙 0.127   1초 해상도 잡음과 크기가 비슷하다
 *   (c) 5초 안               중앙 0.176   ← 확정
 *   (d) 10초 안              중앙 0.262
 *   (e) 그 킬러의 다음 죽음    중앙 0.921   **못 쓴다** — 거의 항상 참이라 클랜을 안 가른다
 *   ```
 *
 *   (a)와의 순위상관이 0.469 / 0.590 / 0.654 / 0.705 로 낮다 =
 *   **창을 좁힐수록 진짜 다른 지표가 된다.** 그래서 창은 지어낼 수 없는 선택이었다.
 *
 * ── **창 넷을 다 저장한다**
 *   지금 쓰는 것은 `within5` 하나뿐이다. 그래도 넷을 다 넣는다 —
 *   창을 바꿀 때 **재빌드 없이** 바뀌게 하려는 것이다. 한 줄에 정수 넷이 느는 것뿐이다.
 *
 * ── 되잡기는 **같은 라운드 안에서만** 센다
 *   `event_time` 이 경기 누적이라 라운드를 안 보면 다음 라운드의 킬이 5초 안에 들어올 수 있다.
 */
/**
 * ④ **라이플화력** — 스나가 일찍 지워져도 라플이 라운드를 살렸나 (2026-09-15 · 신설).
 *
 * ★ 이름은 **「라이플화력」** 이다. 사장님이 직접 고른 말이다.
 *
 * ── 사장님 원문
 *   *"팀 스나가 1킬도 하지못하고 팀에서 1,2,3번째(4,5때는 제외) 죽었는데
 *     라플들끼리 남아서 라운드를 획득한 경우"*
 *
 * ── 「1,2,3번째」 는 **우리 팀 안에서의 사망 차례**다. 상대 포함이 아니다.
 *   4·5번째로 죽었으면 이미 라운드가 거의 끝났거나 스나가 제 몫을 한 뒤라
 *   «라플이 살려냈다» 고 말할 수 없다.
 *
 * ── 「1킬도 하지못하고」 — 그 라운드에 그 스나의 킬이 0이어야 한다.
 *   한 킬이라도 했으면 스나가 값을 했으므로 라플만의 공이 아니다.
 *
 * ── ★죽지 않은 스나도 센다★ (2026-09-15 밤 사장님)
 *   > *"스나가 1킬도 못하고 살아있는데 라플끼리 딴 라운드도 포함시켜"*
 *
 *   살아만 있고 킬이 0이면 그 라운드에 한 일이 없다 — 일찍 죽은 것과 마찬가지로
 *   ★라플이 해낸 라운드★ 다. 그래서 걸리는 라운드가 55.2% → **63.5%** 로 늘었고,
 *   한 팀이 0% 로 뜨는 경우가 11.0% → **8.7%** 로 줄었다 (라운드 84,762 실측).
 *   4·5번째로 죽은 경우만 여전히 빠진다.
 *
 * ── 「라플들끼리」 — 스나를 **전원** 따져야 하나 한 명만 따져야 하나
 *   실측(라운드 66,113): 한 라운드에 우리 스나는 **93%가 딱 1명**이다
 *   (0명 6.5% · 2명 이상 0%). 그래서 두 읽기의 값이 같다 (18,628 대 18,615).
 *   **엄한 쪽**을 쓴다 — 스나가 둘인 드문 경기에서 «라플들끼리» 가 참이 된다.
 *
 * ── ★분모는 «양 팀 공통» 이다★ (2026-09-15 저녁 사장님이 화면을 보고 고치심)
 *   > *"0:0이랑 100:0은 안되는데 어카지 무조건 있긴 있어야하는데
 *   >   양팀 다 스나싸움처럼 둘이 합쳐서 100퍼센트면 좋겠는데"*
 *
 *   ```
 *   분모  그런 라운드들에서 ★양 팀이 낸 킬★ 의 합      ← 양 팀이 같은 수
 *   분자  그중 ★우리가 낸★ 킬
 *   ```
 *   모든 킬은 한 쪽이 낸 것이므로 두 팀 값을 더하면 **정확히 100%** 다.
 *
 * ── ★왜 «라운드» 가 아니라 «킬» 인가★ (2026-09-15 밤 사장님: «0퍼만 아니면 된다»)
 *   라운드를 «이긴 쪽이 1점» 으로 나누면, 그런 라운드를 ★다 진 팀은 0회★ 가 되어
 *   화면에 «0%» 가 뜬다 (한 판에 8.7%). 킬로 나누면 0% 가 되려면 그 라운드 내내
 *   ★킬을 하나도 못 내야★ 한다 — 실측 **0.1%** 다.
 *
 *   ```
 *                          양팀 0:0   한 팀이 0%   판당 분모   승률겹침
 *     라운드로 나누기         0.1%       8.7%        7.6라운드    0.826
 *     ★킬로 나누기 (지금)★   0.1%       0.1%       53.3킬       0.775
 *   ```
 *   겹침도 오히려 낮아졌다. 이름이 「라이플★화력★」 이니 킬로 재는 것이 뜻에도 맞다.
 *
 *   ⚠ 첫 판(②안)은 «내 스나가 지워진 라운드 중 내가 이긴 비율» 이었다.
 *     뜻은 더 곧았지만 양 팀 분모가 달라 합이 100% 가 아니었고, 한 판에 걸리는
 *     라운드가 1~2개뿐이라 화면이 «0% · 0%» 로 떴다.
 *
 *   ── 한 판에서 얼마나 극단적인가 (경기×클랜 56,388 · 66,113라운드 실측)
 *   ```
 *                          0:0     한 팀이 0%   둘 다 있음
 *     스나싸움              3.1%      16.6%       80.3%
 *     소수싸움              2.0%      21.0%       77.0%
 *     세이브                3.7%      39.7%       56.6%
 *     ②안 (각자 분모)      19.5%      49.8%       30.8%   ← 못 쓴다
 *     ③안 (일찍 죽은 것만)  0.2%      11.0%       88.8%
 *     ④안 (+살아남은 스나)  0.1%       8.7%       91.3%
 *     ★⑥안 (킬로 나누기)★  0.1%       0.1%       99.8%   ← 지금 쓰는 것
 *   ```
 *
 *   ★맞바꾼 것★: 라운드 승률과의 겹침이 0.552 → **0.775** 로 올랐다.
 *     합 100% 를 만들려면 모든 킬을 한 쪽에 몰아줘야 해서 조금은 피할 수 없다.
 *     소수싸움이 이미 0.824 라 그보다는 낮다.
 *
 * ── 왜 게임템포를 이걸로 바꿨나 (실측 근거)
 *   ```
 *                  클랜 25~75% 폭   승률과 겹침   사람이 읽히나
 *   게임템포          2.9초          -0.287      「26.1초」 — 뜻을 모른다
 *   라이플화력         8pt            0.552      스나 지워져도 라플이 살린다
 *   ```
 *   지금 다른 축들의 폭은 3~4pt 다. **라이플화력이 두 배 넓게 줄을 세운다.**
 *   승률 겹침 0.552 는 소수싸움(0.824)·세이브(0.617)와 선짤(0.428) 사이다 —
 *   실제로 승률 1·2·5위가 라이플화력 3·9·**83**위로 뒤집힌다.
 *
 * ── 표본
 *   조건에 걸리는 라운드가 **전체의 28.2%** 라 클랜 95곳이 10라운드를 넘긴다
 *   (평균 179라운드). 게임템포(레드 라운드 중 3명 지운 것)보다 넉넉하다.
 */
/**
 * ★죽은 차례를 몇 번째까지 «아무것도 못 했다» 로 볼 것인가★
 *
 *   3 — 2026-09-15 판 (1~3번째. 4·5번째는 뺀다)
 *   ★4★ — 2026-09-16 사장님 «1,2,3,4번째로 1킬도못하고 죽거나»
 *
 * 넓히면 걸리는 라운드가 63.4% → 70.0% 로 는다 (6,000판 실측).
 */
/**
 * ★몇 번째까지를 «먼저 죽었다» 로 볼 것인가★ — 스나영향력(⑤) 전용 (2026-09-16 밤).
 *
 * 실측은 1~2번째로 재서 골랐다 (클랜 54곳 · 퍼짐 5.6 · 스나싸움과 상관 0.115).
 * 1번째만 보면 표본이 반으로 줄고, 3번째까지 넓히면 «라운드 중반» 까지 들어와
 * «먼저» 라는 말이 흐려진다.
 */
/**
 * ★스나차이·라플차이 점수표★ — 사장님이 직접 주신 곡선 (2026-09-16 밤).
 *
 * > «상대스나를 선짤했다? 이러면 1점 / 거기서 1킬 더? 2점 / 거기서 또 1킬 더? 4점 /
 * >  거기서 1킬 더? 6점 / 올킬? 10점 / 이런느낌임»
 *
 * 오름폭이 +1 → +2 → +2 → +4 로 ★뒤로 갈수록 가팔라진다.★
 * 올킬이 선짤의 열 배다 — «혼자 판을 끝냈다» 를 확실히 띄우는 모양이다.
 */
export const GAP_OPEN_POINTS: readonly number[] = [1, 2, 4, 6, 10]
/**
 * ★판을 안 열고 킬만 한 라운드★ — 같은 킬 수에서 절반.
 *
 * 사장님 표는 «선짤했다» 에서 시작한다. 선짤 없이 3킬 한 스나를 0점 두면 안 되고,
 * 그렇다고 «균형을 먼저 무너뜨린» 선짤과 같은 값을 줄 수도 없다.
 */
export const GAP_PLAIN_POINTS: readonly number[] = [0.5, 2, 3, 5, 8]
/**
 * ★세이브★ — 혼자 남아 이기면 +3점.
 * 실측상 라운드의 3.9% 뿐이라 선짤(1점)보다 훨씬 귀하다.
 */
export const GAP_SAVE_POINT = 3
/** ★소수싸움에서 살아남아 1킬 이상★ — +2점. 밀린 판의 킬은 균형 판의 킬보다 무겁다 */
export const GAP_FEW_POINT = 2
/** 거기서 그 라운드까지 따면 +2점 더 */
export const GAP_FEW_WIN_POINT = 2

export const SNIPER_EARLY_DEATH_ORDER = 2

export const RIFLE_POWER_DEATH_ORDER_V1 = 3
export const RIFLE_POWER_DEATH_ORDER_V2 = 4

/**
 * ★킬로 나눌 것인가, 라운드로 나눌 것인가★
 *
 *   `true`  — 2026-09-15 판. 그 라운드들의 ★킬★ 을 나눠 갖는다
 *   ★`false`★ — 2026-09-16 사장님 «라플끼리 딴 라운드를 전부 뽑아서 몇대몇»
 *
 * 킬로 나누면 모든 클랜이 48~52% 로 몰려 «둘이 별로 차이가 안 난다» (퍼짐 1.7).
 * 라운드로 나누면 40.9~57.6 으로 벌어진다 (퍼짐 3.5) — 실측 6,000판.
 * 0% 가 되는 클랜은 ★한 곳도 없다★ (1~4 로 넓힌 덕이다).
 */
export const RIFLE_POWER_BY_KILLS = false

/**
 * ★무엇을 나눠 갖나★ (2026-09-16 사장님 «어 좋다 그렇게 ㄱㄱ»)
 *
 *   `'rifleKills'` — ★지금★. 그 라운드 ★양 팀 라플이 낸 킬★ 중 우리 몫
 *   `'rounds'`     — 2026-09-16 낮. 그 라운드를 땄나
 *   `'allKills'`   — 2026-09-15 밤. 그 라운드 전체 킬 중 우리 몫
 *
 * 라운드 승패로 세면 «스나가 못한 라운드» 는 대체로 지므로 ★라플이 잘해도 낮게★ 나온다.
 * 사장님이 «라플들은 잘했는데 스나가 못해서 진 판» 이 안 보인다고 짚으신 것이 이것이다.
 */
export const RIFLE_POWER_UNIT: 'rifleKills' | 'rounds' | 'allKills' = 'rifleKills'

/**
 * ★기회차단★ — 먼저 맞고 시작한 라운드를 끊어냈나 (2026-09-16 밤 사장님).
 *
 * > «불리한 시작» 이라 부르려다 «기회차단» 으로 못 박으셨다.
 *
 * ── 왜 이 모양인가 (실측 · 최근 2,500경기)
 *   첫 킬 뒤 «몇 초 잠잠했나» 는 축이 못 됐다 — 잠잠할수록 오히려 승률이 내려갔다
 *   (우위가 녹는다). 반면 «다음 킬을 누가 냈나» 는 창과 무관하게 갈랐다:
 *     우리가 열고 또 잡음  59.2%   /   맞고 못 끊음  ★40.8%★
 *   그리고 ★경기 승률과 상관 0.015★ — 여섯 축 중 유일하게 «그냥 강팀» 이 안 섞인다.
 */
export interface BlockChanceTally {
  /** 상대가 그 라운드 첫 킬을 낸 라운드 수 = 분모 */
  foeOpenRounds: number
  /** 그중 ★다음 킬을 우리가 낸★ 라운드 수 = 분자 */
  cutRounds: number
  /** 뒷면 — 우리가 연 라운드와 그중 이어서 우리가 또 잡은 수. 축에는 안 쓰고 남긴다 */
  openRounds: number
  heldRounds: number
}

/**
 * ★스나차이 · 라플차이★ — 무기별 점수를 상대와 견준다 (2026-09-16 밤 사장님).
 *
 * 점수표 (사장님이 직접 주신 곡선) —
 *   상대 스나를 «라운드 첫 킬» 로 잡음   1점
 *   + 1킬 더 (총 2킬)                  2점
 *   + 1킬 더 (총 3킬)                  4점
 *   + 1킬 더 (총 4킬)                  6점
 *   올킬 (5킬)                        10점
 *   선짤 없이 킬만 한 라운드            그 절반 (0.5 / 2 / 3 / 5 / 8)
 *   세이브(혼자 남아 이김)              +3점
 *   소수싸움에서 살아남아 1킬 이상       +2점 · 그 라운드까지 따면 +2점 더
 *
 * ★라플은 시작점만 «라운드 첫 킬» 로 바꾼다★ — 스나는 «상대 스나를» 잡아야 선짤이지만
 * 라플은 누구를 잡든 판을 연 것이다.
 *
 * ★사람 수로 나눈다★ (사장님: «순수 스나차이로 게임을 이기는 경우가 확연히 잘 보이면 좋겠어»).
 * 라플 점수가 2.7배 큰 건 실력이 아니라 머릿수다 (스나 1명 vs 라플 4명).
 * 나누면 한 사람당 스나 +0.68 · 라플 +0.45 로 ★스나가 더 크게★ 보인다.
 */
export interface GapScoreTally {
  /** 우리 스나·라플 점수 합 */
  ourSniper: number
  ourRifle: number
  /** 상대 스나·라플 점수 합 */
  foeSniper: number
  foeRifle: number
  /** 사람 수 (양 팀 평균) — 한 사람당으로 나눌 때 쓴다 */
  sniperHeads: number
  rifleHeads: number
  /** 위 점수를 센 라운드 수 = 분모 */
  rounds: number
}

export interface RiflePowerTally {
  /**
   * 조건에 걸린 라운드에서 **양 팀이 낸 킬의 합** (분모).
   * 양 팀 tally 가 **같은 수**를 갖는다 — 그래야 두 값의 합이 100% 가 된다.
   *
   * ⚠ 이름은 `rounds` 지만 **세는 것은 킬**이다 (2026-09-15 밤 · ⑥안).
   *   칸 이름을 바꾸면 이미 쌓인 행과 요약이 전부 어긋나므로 이름은 그대로 둔다.
   *   실제 라운드 수는 아래 `situationRounds` 에 따로 담는다.
   */
  rounds: number
  /** 그중 **우리가 낸** 킬 (분자) */
  won: number
  /**
   * 조건에 걸린 **라운드 수** — 화면에는 안 쓰고 «표본이 얼마나 되나» 를 볼 때 쓴다.
   * 옛 행에는 이 칸이 없다 (`undefined`).
   */
  situationRounds?: number
}

export interface TradeTally {
  /** 우리 팀원이 **상대에게** 죽은 수 = 분모 */
  deaths: number
  /** 그 킬러를 3초 안에 되잡은 수 */
  within3: number
  /** 5초 안 — **지금 화면이 쓰는 값** */
  within5: number
  /** 10초 안 */
  within10: number
  /** 같은 라운드 안이면 시간을 안 보고 다 센 것 (가장 느슨한 후보) */
  sameRound: number
}

/** 한 경기에서 **한 클랜**의 여섯 축 재료 */
export interface ClanHexTally {
  /** 이 집계의 주인 (`team_no` — 진영이 아니다 · D-184) */
  teamNo: string
  /** 상대 `team_no`. 못 찾으면 `null` 이고 그때는 여섯 축이 전부 `null` 이다 */
  foeTeamNo: string | null
  /** 이벤트로 확인된 라운드 수 (진영을 몰라도 센다) */
  rounds: number
  /** 그중 **우리가 이긴** 라운드 수 (`win_flag`) — 라운드 스코어 «6:2» 의 재료 (2026-09-10). 승패를 모르는 라운드는 안 센다 */
  roundsWon: number
  /** 그중 진영을 **아는** 라운드 수 */
  sidedRounds: number
  /** 그중 진영=레드(공격)인 라운드 수 */
  redRounds: number
  /** 상대 팀에서 **스나로 확정된** 선수 수. 0 이면 ①⑤⑥ 이 `null` 이다 */
  foeSnipers: number

  /** ① **지금 쓰는 것** — 스나 대 스나 (D-256) */ sniperDuel: SniperDuelTally | null
  /** ⑤ **지금 쓰는 것** — 스나영향력 (2026-09-16 사장님이 선짤과 바꾸심) */
  sniperInfluence: SniperInfluenceTally | null
  /** ⑥ **지금 쓰는 것** — 선짤없이 라운드 시작 (2026-09-16 사장님이 백어택과 바꾸심) */
  firstBloodless: FirstBloodlessTally | null
  /** 옛 ⑤ 선짤. 화면이 안 본다. 계속 세고 저장한다 (`CLAUDE.md` 1-4) */
  firstBlood: FirstBloodTally | null
  /** ⑥ **지금 쓰는 것** — 교환 (D-256) */ trade: TradeTally | null

  /**
   * ★구역별 어택★ (2026-09-17 사장님) — 경기 육각 ④⑤⑥ 이 쓴다.
   *
   *   `n`  우리가 ★공격한★ 라운드 중 그 구역에서 교전이 있었던 수 (판정된 라운드)
   *   `ok` 그중 ★뚫은★ 수
   *
   * 판정은 `sideAxes.ts` 가 한다 — 여기서 셈을 다시 적지 않는다.
   * 구역 파일이 없거나 진영을 모르면 `null` 이다 — 0% 로 우기지 않는다.
   */
  zoneAttack: ZoneAttackTally | null

  /**
   * ★점수제★ (2026-09-18 사장님) — 경기 육각의 점수 축 넷이 쓴다.
   *
   * > «이렇게 퍼센트로 보니까 진짜 잘모르겠음 (…) 걍 봤을때 별 생각이 안듦»
   * > «우리 이거 점수제로 해서 퍼센트를 매겨볼까»
   *
   * 셈은 `matchScore.ts` 가 한다 — 여기서 점수표를 다시 적지 않는다.
   * ⚠ ★`zoneAttack` 을 지우지 않는다★ (`CLAUDE.md` 1-4) — 둘 다 센다.
   */
  score: MatchScoreTally | null

  /** ★새 축 — 기회차단★ (2026-09-16 밤 사장님). 경기·클랜 둘 다 쓴다 */
  blockChance: BlockChanceTally | null
  /** ★새 축 — 스나차이·라플차이★ (2026-09-16 밤 사장님). 경기는 점수차, 클랜은 앞선 판 비율 */
  gapScore: GapScoreTally | null

  /** ② */ outnumbered: OutnumberedTally | null
  /** ③ */ save: SaveTally | null
  /** ④ **지금 쓰는 것** — 라이플화력 (2026-09-15 사장님) */ riflePower: RiflePowerTally | null

  /**
   * 옛 ④ 게임템포. **화면이 안 본다** — 사장님이 2026-09-15 에 라이플화력으로 바꿨다.
   * 지우지 않고 계속 센다 (`CLAUDE.md` 1-4) — 되살릴 때 재수집이 없어야 한다.
   */
  tempo: TempoTally | null

  /* ── 아래 셋은 **옛 축이다. 화면이 안 본다.** 지우지 않는다 (`CLAUDE.md` 10-4) ──
     계산은 계속 돈다. 사용자가 포지션 판정을 이유로 ⑤⑥ 을 뺐으므로, 그게 좋아지면
     되살릴 수 있어야 하고 그때 재수집이 필요하지 않아야 한다 */
  /** 옛 ① 구역 기반 스나싸움 */ sniperFight: SniperFightTally | null
  /** 옛 ⑤ B어택성공 */ lastSniper: LastSniperTally | null
  /** 옛 ⑥ A어택성공 */ attackZone: AttackZoneTally | null
}

/** 한 경기 — 양쪽 클랜이 함께 담긴다 */
export interface ClanHexMatch {
  /** 응답의 주인 (`wonRound` 의 기준이기도 하다) */
  teamNo: string
  /** 상대 `team_no`. 팀이 둘로 안 잡히면 `null` */
  foeTeamNo: string | null
  /** 이벤트로 확인된 라운드 수 */
  rounds: number
  /** 양 팀이 정확히 `teamSize` 명 확인됐나 — ②③④⑤ 의 관문이다 */
  restorable: boolean
  /** 진영 근거가 서로 어긋났나 — 그러면 진영을 하나도 확정하지 않는다 */
  sideConflict: boolean
  /**
   * 진영이 바뀐 첫 라운드. **`null` 이면 교대를 못 봤다.**
   *
   * ⚠ 그런 경기의 진영 기반 축(①④⑤⑥)은 **표본이 근거와 같아진다** —
   * 아는 라운드가 폭탄이 터진 라운드 그 자체뿐이다 (`clanRound.ts` 머리말 실측).
   * 쓸지 말지는 부르는 쪽이 정한다. 여기서는 버리지 않고 값과 함께 알린다.
   */
  switchRound: number | null
  /** `team_no` → 그 팀의 여섯 축 재료. **양쪽이 다 담긴다** */
  byTeam: Map<string, ClanHexTally>
}

/* -------------------------------------------------------------------------- */
/* 본체                                                                         */
/* -------------------------------------------------------------------------- */

const emptyTally = (teamNo: string, foeTeamNo: string | null): ClanHexTally => ({
  teamNo,
  foeTeamNo,
  rounds: 0,
  roundsWon: 0,
  sidedRounds: 0,
  redRounds: 0,
  foeSnipers: 0,
  sniperDuel: null,
  sniperInfluence: null,
  firstBloodless: null,
  firstBlood: null,
  trade: null,
  /* ★새 축 둘★ (2026-09-16 밤 사장님) */
  blockChance: null,
  zoneAttack: null,
  score: null,
  gapScore: null,
  outnumbered: null,
  save: null,
  riflePower: null,
  tempo: null,
  sniperFight: null,
  lastSniper: null,
  attackZone: null,
})

/**
 * ★한 라운드의 길이★ (초). 사장님: «한 라운드는 2분20초야».
 *
 * ⚠ ★계약(`@sacloud/contract`)에도 같은 값이 있다★ — `ROUND_FULL_SECONDS`.
 *   이 꾸러미는 ★계약을 모른다★ (`CLAUDE.md` 7장 — 순수 클라이언트다) 그래서 여기 따로 둔다.
 *   둘이 어긋나면 화면 글자와 계산이 달라진다. 고칠 때 ★두 곳을 같이★ 고친다.
 */
const ROUND_FULL_SECONDS = 140

/**
 * ★이보다 짧게 끝난 라운드는 안 센다★ (2026-09-14 저녁 사장님:
 * «1분 50초도 깨지기전에 끝난 라운드는 세지마 이건 역개당한거라 세도 의미가 없어»).
 * 시계가 2:20 에서 줄어드니 «1:50 이 깨지기 전» 은 ★시작 30초 안★ 이다.
 */
const TEMPO_MIN_ROUND_SECONDS = ROUND_FULL_SECONDS - 110

/**
 * ★경기 시작 → 1라운드 시작★ 까지 (초). **사장님이 직접 재신 값이다** (2026-09-14 저녁:
 * «첫라운드 시작은 정확히 10초후»).
 *
 * 배틀로그 시계는 ★경기 시작★ 이 0:00 이라, 1라운드 길이를 구하려면 이만큼 빼야 한다.
 */
export const MATCH_TO_FIRST_ROUND_SECONDS = 10

/**
 * ★라운드 끝 → 다음 라운드 시작★ 까지 (초). **사장님이 직접 재신 값이다** (2026-09-14 저녁:
 * «라운드랑 라운드 사이 간격(마지막킬기준) 정확히 8.45초»).
 *
 * 정산 · 리스폰 · 구매에 쓰는 시간이다. 킬 기록만으로는 라운드 시작을 알 수 없어서
 * 이 상수가 없으면 «싸운 시간» 에 이게 통째로 섞여 들어간다.
 *
 * ── ⚠ 내가 재려다 못 잰 값이다. 사장님이 주셔서 들어왔다
 *   나는 «앞 라운드 마지막 킬 → 다음 라운드 첫 킬» 16,028개를 재서
 *   ★최솟값 13초 · 1% 15초★ 라는 딱딱한 바닥까지만 찾았다. 그 13초 안에는
 *   «대기» 말고 «첫 접촉까지» 도 섞여 있어 둘을 가를 수가 없었다.
 *   따로 «140초를 넘을 수 없다» 는 성질로 벽을 찾아 ★8초★ 라는 값도 얻었는데,
 *   사장님 실측 8.45초와 맞았다. 두 길이 같은 곳을 가리켰으니 이 값을 쓴다.
 */
export const ROUND_GAP_SECONDS = 8.45

/**
 * ★선짤의 창★ — 라운드 시작 후 이 안에 난 첫 킬만 «선짤» 로 센다 (2026-09-15 사장님:
 * «라운드 시작 후 25초 안에 가장 먼저 죽이면 선짤점수가 올라야해»).
 *
 * ★분모도 같이 좁힌다★ (사장님이 회의에서 ②안을 고르심) —
 * «25초 안에 첫 킬이 난 라운드» 만 분모다. 25초 안에 아무도 못 딴 라운드는
 * 양 팀 다 못 겨룬 것이라 «졌다» 로 적지 않는다.
 *
 * 실측(클랜 6,729라운드): 지금 52.5% → ②안 53.8% — ★값이 거의 안 움직인다.★
 * (분모를 안 좁히는 ①안이면 32.0% 로 떨어져 육각이 통째로 쪼그라든다)
 */
export const OPENING_WINDOW_SECONDS = 25

/**
 * 배틀로그 원문 한 건(클랜 응답) → **양쪽 클랜**의 여섯 축 분자/분모.
 *
 * `teamNo` 는 그 응답을 받은 클랜의 `team_no` 다 (`clanByTeamNo()` 로 찾는다).
 * `wonRound` 는 **그 팀 기준** 라운드 승패다. 안 주면 `roundResultsOf(events)` 를 쓴다 —
 * `win_flag` 가 조회 클랜 기준이므로 결과가 같다.
 *
 * 라운드를 하나도 못 읽으면 `null` 이다. **0 을 돌려주지 않는다** (D-106).
 *
 * ── 상대 팀 값은 어떻게 나오나
 *   진영은 뒤집고(폭파미션은 한 라운드에 공격이 한 팀뿐이다 · D-208),
 *   승패도 뒤집는다(폭파미션 라운드에는 무승부가 없다). 킬·죽음·좌표·무기는 원래
 *   양 팀 것이 다 실려 온다. 그래서 **같은 응답으로 두 클랜을 다 잰다.**
 */
export function clanHexV2Of(input: {
  events: readonly ClanHexEvent[]
  /** 응답을 받은 클랜의 `team_no` */
  teamNo: string
  /** 기본 5 */
  teamSize?: number
  /** **그 팀 기준** 라운드 승패. 안 주면 `roundResultsOf(events)` */
  wonRound?: (round: number) => boolean | null
  zones?: ClanHexZones
}): ClanHexMatch | null {
  const teamSize = input.teamSize ?? CLAN_HEX_TEAM_SIZE
  const zones = input.zones ?? {}

  const clocks = roundClocksOf(input.events)
  if (clocks.size === 0) return null
  const roundNumbers = [...clocks.keys()].sort((a, b) => a - b)
  const totalRounds = roundNumbers[roundNumbers.length - 1] as number

  const results = input.wonRound ?? null
  const fallback = results === null ? roundResultsOf(input.events) : null
  const wonRound = (round: number): boolean | null =>
    results ? results(round) : (fallback?.get(round) ?? null)

  /* 진영은 폭탄이 방향을, 5승 규칙이 교대 지점을 정한다 (D-208) */
  const sides = roundSidesOf(input.events, input.teamNo, totalRounds, wonRound)

  const roster = rosterOf(input.events)
  const restorable = isRestorable(roster, teamSize)
  const foeTeamNo = roster.teams.includes(input.teamNo)
    ? (roster.teams.find((team) => team !== input.teamNo) ?? null)
    : null

  const states = roundStatesOf(input.events)
  /* 무기는 `killsOf` 로 되짚는다 — 죽인 쪽의 무기 칸을 짝지어 읽는 곳이 거기다 */
  const weaponByPlayer = weaponByPlayerOf(killsOf(input.events))

  /** 라운드 → 그 라운드의 킬들. **좌표가 양쪽 다 필요해서** `playstyleKillsOf` 를 쓴다 */
  const killsByRound = new Map<number, PlaystyleKill[]>()
  for (const kill of playstyleKillsOf(input.events)) {
    const list = killsByRound.get(kill.round)
    if (list) list.push(kill)
    else killsByRound.set(kill.round, [kill])
  }

  /* ★점수제★ 가 쓰는 폭탄 설치. 진영 판정이 이미 읽는 것을 그대로 쓴다 */
  const bombs = bombEvidenceOf(input.events)

  const shared = {
    teamSize,
    zones,
    clocks,
    roundNumbers,
    states,
    killsByRound,
    roster,
    weaponByPlayer,
    restorable,
    bombs,
  }

  const byTeam = new Map<string, ClanHexTally>()
  if (foeTeamNo === null) {
    byTeam.set(input.teamNo, emptyTally(input.teamNo, null))
  } else {
    byTeam.set(
      input.teamNo,
      tallyFor({ ...shared, teamNo: input.teamNo, foeTeamNo, sideOf: sides.side, wonRound }),
    )
    /* 상대 — 진영도 승패도 뒤집는다 */
    const foeSide = new Map<number, RoundSide>()
    for (const [round, side] of sides.side) {
      foeSide.set(round, side === 'attack' ? 'defense' : 'attack')
    }
    const foeWon = (round: number): boolean | null => {
      const won = wonRound(round)
      return won === null ? null : !won
    }
    byTeam.set(
      foeTeamNo,
      tallyFor({
        ...shared,
        teamNo: foeTeamNo,
        foeTeamNo: input.teamNo,
        sideOf: foeSide,
        wonRound: foeWon,
      }),
    )
  }

  return {
    teamNo: input.teamNo,
    foeTeamNo,
    rounds: clocks.size,
    restorable,
    sideConflict: sides.conflict,
    switchRound: sides.switchRound,
    byTeam,
  }
}

/* -------------------------------------------------------------------------- */
/* 한 팀                                                                        */
/* -------------------------------------------------------------------------- */

function tallyFor(input: {
  teamNo: string
  foeTeamNo: string
  teamSize: number
  zones: ClanHexZones
  clocks: ReadonlyMap<number, { first: number; last: number }>
  roundNumbers: readonly number[]
  states: ReadonlyMap<number, { round: number; deaths: RoundDeath[] }>
  killsByRound: ReadonlyMap<number, readonly PlaystyleKill[]>
  roster: { teamOf: ReadonlyMap<string, string> }
  weaponByPlayer: ReadonlyMap<string, Weapon>
  restorable: boolean
  sideOf: ReadonlyMap<number, RoundSide>
  wonRound: (round: number) => boolean | null
  /** ★점수제★ 가 쓰는 폭탄 설치. 좌표를 모르면 그 줄은 버린다 */
  bombs: readonly BombEvidence[]
}): ClanHexTally {
  const tally = emptyTally(input.teamNo, input.foeTeamNo)

  /*
   * ★구역별 어택★ (2026-09-17 사장님) — 우리가 ★공격한★ 라운드만 센다.
   *
   * 판정은 `sideAxes.ts` 의 `judgeExchange` / `judgeShort` 가 한다 — 셈을 여기서 다시 적지 않는다.
   * 구역 파일이 없으면 그 칸이 안 쌓이고, 넷 다 0 이면 `zoneAttack` 을 `null` 로 둔다
   * (0% 로 우기지 않는다 · D-106).
   */
  {
    const z = input.zones
    const anyZone = z.sideA ?? z.sideB ?? z.sideF2 ?? z.sideShort ?? null
    if (anyZone !== null) {
      const zt: ZoneAttackTally = { aN: 0, aOk: 0, bN: 0, bOk: 0, f2N: 0, f2Ok: 0, shortN: 0, shortOk: 0 }
      for (const round of input.roundNumbers) {
        /* 진영을 모르는 라운드는 통째로 건너뛴다 — 뒤집히면 조용히 거짓이 된다 */
        if (input.sideOf.get(round) !== 'attack') continue
        const kills = input.killsByRound.get(round) ?? []
        const side: SideKill[] = kills.map((k) => ({
          killAt: { x: k.killerX, y: k.killerY },
          deathAt: { x: k.victimX, y: k.victimY },
          /* ★수비는 상대다★ — 우리가 공격하는 라운드만 세고 있다 */
          victimIsDefence: (input.roster.teamOf.get(k.victim) ?? null) === input.foeTeamNo,
          killerIsDefence: (input.roster.teamOf.get(k.killer) ?? null) === input.foeTeamNo,
        }))
        const add = (
          v: SideVerdict,
          nk: 'aN' | 'bN' | 'f2N' | 'shortN',
          ok: 'aOk' | 'bOk' | 'f2Ok' | 'shortOk',
        ): void => {
          if (!v.judged) return
          zt[nk] += 1
          if (v.breached) zt[ok] += 1
        }
        add(judgeExchange(side, z.sideA ?? null), 'aN', 'aOk')
        add(judgeExchange(side, z.sideB ?? null), 'bN', 'bOk')
        add(judgeExchange(side, z.sideF2 ?? null), 'f2N', 'f2Ok')
        add(judgeShort(side, z.sideShort ?? null), 'shortN', 'shortOk')
      }
      if (zt.aN + zt.bN + zt.f2N + zt.shortN > 0) tally.zoneAttack = zt
    }
  }

  /*
   * ★점수제★ (2026-09-18 사장님) — 규칙은 `matchScore.ts` 하나뿐이다.
   *
   * > «우리 이거 점수제로 해서 퍼센트를 매겨볼까»
   * > «우리 2층이 다른곳에서 킬을 더 많이하고 더 쭉쭉 뚫고 이러면 점수를 더주는거야»
   *
   * ⚠ ★구역 어택과 달리 진영을 안 가린다★ — 사장님 점수표에 «공격일 때만» 이 없다.
   *   공격이든 방어든 잡으면 점수다. 그래서 진영을 몰라도 셀 수 있다.
   * ⚠ ★스나는 「그 경기에서 든 총」 으로 가른다★ (`weaponByPlayer`). 자리표를 안 쓴다 —
   *   한 경기로 자리를 맞히면 69.8% 지만, 실제로 든 총은 틀릴 일이 없다.
   */
  {
    const z = input.zones
    const anyZone = z.sideA ?? z.sideB ?? z.sideF2 ?? z.sideShort ?? null
    /*
     * ★롱에서 난 스나 대 스나에는 +1점★ (2026-09-18 사장님).
     * 판정은 스나싸움 축과 ★같은 자★ 다 — 잡은 쪽·죽은 쪽이 둘 다 A롱·B롱 안.
     */
    const longs = [z.aLong, z.bLong].filter((zone): zone is ZoneCells => !!zone)
    /*
     * ⚠ ★스나싸움 축과 ★같은 자★ 로 잰다★ (2026-09-18 사장님) —
     *   「한쪽이라도 롱 안」 이면 스나싸움이다. 축은 이렇게 세는데 보너스만
     *   「둘 다 롱」 으로 두면 ★화면의 스나싸움 횟수와 점수가 어긋난다.★
     *
     *   비롱→벙커 · 벙커→비롱 · 비롱→비롱 전부 스나싸움이다 (사장님).
     */
    const bothLong = (kx: number | null, ky: number | null, dx: number | null, dy: number | null): boolean => {
      if (longs.length === 0) return false
      const hit = (x: number | null, y: number | null): boolean =>
        x !== null && y !== null && longs.some((zone) => inZone(zone, { x, y }))
      return hit(kx, ky) || hit(dx, dy)
    }
    if (anyZone !== null) {
      const sc = emptyMatchScore()
      let touched = false
      const isSniper = (who: string): boolean => input.weaponByPlayer.get(who) === 1

      for (const round of input.roundNumbers) {
        const kills = input.killsByRound.get(round) ?? []
        /* ★순번은 우리 팀이 그 라운드에서 몇 번째로 잡았나★ 다 — 스나 킬 2점의 문턱 */
        let rank = 0
        for (const kill of kills) {
          if ((input.roster.teamOf.get(kill.killer) ?? null) !== input.teamNo) continue
          rank += 1
          const points = killScore(
            { killerIsSniper: isSniper(kill.killer), victimIsSniper: isSniper(kill.victim) },
            rank,
            bothLong(kill.killerX, kill.killerY, kill.victimX, kill.victimY),
          )
          touched = true
          /* 스나가 번 점수는 ★구역을 안 보고★ 스나칸으로 간다 (사장님) */
          if (isSniper(kill.killer)) {
            sc.sniper += points
            /*
             * ★스나싸움 점수★ (2026-09-18 사장님: «스나싸움도 점수로 계산»).
             * ⚠ `sniper` 의 ★부분집합★ 이다 — 합계에 또 더하면 두 번 센다.
             */
            if (isSniper(kill.victim)) sc.duel += points
            continue
          }
          const at = { x: kill.victimX, y: kill.victimY }
          const point = at.x === null || at.y === null ? null : { x: at.x, y: at.y }
          const slot = scoreSlotOf({
            inF2: z.sideF2 ? inZone(z.sideF2, point) : false,
            inShortOrA:
              (z.sideShort ? inZone(z.sideShort, point) : false) ||
              (z.sideA ? inZone(z.sideA, point) : false),
            inB: z.sideB ? inZone(z.sideB, point) : false,
          })
          sc[slot] += points
        }

        /* ── 폭탄. ★B쪽에 심으면 져도 2점★ (사장님) */
        const won = input.wonRound(round)
        for (const bomb of input.bombs) {
          if (bomb.round !== round || bomb.action !== 'install') continue
          if (bomb.team !== input.teamNo) continue
          const point = bomb.x === null || bomb.y === null ? null : { x: bomb.x, y: bomb.y }
          const onB = z.sideB ? inZone(z.sideB, point) : false
          const points = bombScore(won === true, onB)
          touched = true
          /* 폭탄 점수도 ★심은 자리★ 로 간다 — 사장님 표에 폭탄이 자리마다 있었다 */
          const slot = scoreSlotOf({
            inF2: z.sideF2 ? inZone(z.sideF2, point) : false,
            inShortOrA:
              (z.sideShort ? inZone(z.sideShort, point) : false) ||
              (z.sideA ? inZone(z.sideA, point) : false),
            inB: onB,
          })
          sc[slot] += points
        }
      }
      if (touched) tally.score = sc
    }
  }

  /** 상대 팀에서 **스나로 확정된** 선수들 */
  const foeSnipers = new Set<string>()
  for (const [usn, weapon] of input.weaponByPlayer) {
    if (weapon !== 1) continue
    if (input.roster.teamOf.get(usn) !== input.foeTeamNo) continue
    foeSnipers.add(usn)
  }
  tally.foeSnipers = foeSnipers.size

  /* 상대 스나를 한 명도 못 짚었다 — ①⑤⑥ 을 세지 않는다.
     0 으로 두면 "한 번도 못 잡았다" 가 되어 못 잰 경기가 최악으로 보인다 (D-106) */
  const sniperKnown = foeSnipers.size > 0

  const zeroZone = (): ZoneCount => ({ byKiller: 0, byVictim: 0 })
  const sniperFight: SniperFightTally = {
    redRounds: 0,
    foeSniperKills: 0,
    killsWithPosition: zeroZone(),
    aSideKills: input.zones.aSide ? zeroZone() : null,
    bLongKills: input.zones.bLong ? zeroZone() : null,
    unzonedKills: input.zones.aSide && input.zones.bLong ? zeroZone() : null,
  }
  const outnumbered: OutnumberedTally = { rounds: 0, won: 0 }
  /** ★소수싸움 점수★ 합 — 라운드를 돌며 쌓아 마지막에 `tally.score` 로 옮긴다 */
  let scoreSave = 0
  const save: SaveTally = { rounds: 0, won: 0 }
  const tempo: TempoTally = {
    redRounds: 0,
    redClearThreeRounds: 0,
    redClearThreeSecondsLowerBound: [],
    redClearThreeSecondsLowerBoundSum: 0,
    redRoundsWithoutThreeClears: 0,
    roundLengthRounds: 0,
    roundLengthSecondsSum: 0,
    roundLengthDroppedShort: 0,
    roundLengthDroppedLong: 0,
  }

  /**
   * ★라운드 길이★ — 우리 진영을 가리지 않고 ★그 경기의 모든 라운드★ 를 센다
   * (2026-09-14 저녁 사장님: «평균적으로 라운드가 몇분 몇초에 끝나는지»).
   *
   * ── 어떻게 재나 (실측으로 찾은 길)
   *   배틀로그의 `event_time` 은 라운드별 경과가 아니라 ★경기 시작부터의 누적★ 이다.
   *   그래서 ★라운드의 마지막 이벤트 시각★ 을 이어 붙이면 길이가 나온다:
   *   ```
   *   1라운드            00:00 에 시작하니 «마지막 이벤트 시각» 이 곧 길이
   *   그 뒤 라운드 N     (N 의 마지막) − (N−1 의 마지막)
   *   ```
   * ── ★대기 시간을 뺀다★ (2026-09-14 저녁 · 사장님 실측)
   *   위 뺄셈에는 «싸운 시간» 말고 ★라운드 사이 대기★ 가 통째로 섞여 있다.
   *   정산 화면 · 리스폰 · 총 사는 시간이다. 사장님이 직접 재서 주셨다:
   *
   *     «첫라운드 시작은 정확히 10초후»
   *     «라운드랑 라운드 사이 간격(마지막킬기준) 정확히 8.45초»
   *
   *   그래서 실제로 쓰는 식은 이렇다:
   *   ```
   *   1라운드            (마지막 이벤트 시각) − 10
   *   그 뒤 라운드 N     (N 의 마지막) − (N−1 의 마지막) − 8.45
   *   ```
   *   내가 «140초를 넘을 수 없다» 는 성질로 따로 찾은 벽이 ★8초★ 였다 —
   *   사장님 값과 맞았다. 두 길이 같은 곳을 가리켰다.
   *
   *   ⚠ ★클랜 순위는 이 뺄셈으로 바뀌지 않는다.★ 모든 클랜에 똑같이 붙는 상수라
   *     육각 축(백분위)은 그대로다. 달라지는 것은 화면에 찍히는 «몇 분 몇 초» 다.
   *
   * ── 무엇을 빼나
   *   `< 30초`   ★역개★ — 사장님: «세도 의미가 없어». 실측 0.3%
   *   `> 140초`  한 라운드는 2분 20초다. 넘으면 연장이거나 자국이 섞인 것. 실측 1.5%
   */
  {
    const ends = [...input.clocks.entries()]
      .map(([round, c]) => ({ round, end: c.last }))
      .sort((a, b) => a.round - b.round)
    let prevEnd: number | null = null
    let prevRound: number | null = null
    for (const { round, end } of ends) {
      /*
       * 1라운드는 경기 시작 10초 뒤에 열린다 · 그 뒤는 앞 라운드 끝에서 8.45초 뒤다.
       * 라운드 번호가 건너뛰면(킬이 하나도 없는 라운드) 두 라운드가 붙어 버려서 못 잰다.
       */
      const length =
        prevRound === null
          ? round === 1
            ? end - MATCH_TO_FIRST_ROUND_SECONDS
            : null
          : round === prevRound + 1
            ? end - prevEnd! - ROUND_GAP_SECONDS
            : null
      prevRound = round
      prevEnd = end
      if (length === null) continue
      if (length < TEMPO_MIN_ROUND_SECONDS) {
        tempo.roundLengthDroppedShort += 1
        continue
      }
      if (length > ROUND_FULL_SECONDS) {
        tempo.roundLengthDroppedLong += 1
        continue
      }
      tempo.roundLengthRounds += 1
      tempo.roundLengthSecondsSum += length
    }
  }
  const lastSniper: LastSniperTally = {
    redWonRounds: 0,
    redWonSniperLast: 0,
    wonRounds: 0,
    wonSniperLast: 0,
    noFoeDeathRounds: 0,
    unknownLastWeaponRounds: 0,
    ambiguousLastRounds: 0,
  }
  const attackZone: AttackZoneTally = {
    redRounds: 0,
    redWonRounds: 0,
    redWonZoneSniperRounds: zeroZone(),
    redLostZoneSniperRounds: zeroZone(),
    sniperKillsWithPosition: zeroZone(),
    sniperKillsInNamedZone: zeroZone(),
    sniperKillsOutsideNamedZone: zeroZone(),
    zoneLabels: input.zones.attackLabels ?? [],
  }

  for (const round of input.roundNumbers) {
    const clock = input.clocks.get(round)
    if (clock === undefined) continue
    const won = input.wonRound(round)
    const deaths = input.states.get(round)?.deaths ?? []
    const ours = deaths.filter((death) => death.team === input.teamNo)
    const theirs = deaths.filter((death) => death.team === input.foeTeamNo)
    /* 인원보다 많이 죽었다 = 응답이 어긋났다. 사람 수를 보는 축에서는 그 라운드를 버린다 */
    const countable = ours.length <= input.teamSize && theirs.length <= input.teamSize

    /* ───────── ② 소수싸움 — **진영을 보지 않는다** (D-202) ───────── */
    if (input.restorable && countable && won !== null) {
      const pushed = outnumberedRound({
        deaths,
        ourTeam: input.teamNo,
        foeTeam: input.foeTeamNo,
        teamSize: input.teamSize,
      })
      if (pushed === true) {
        outnumbered.rounds += 1
        if (won) outnumbered.won += 1
      }
    }

    /* ───────── ③ 세이브 — **진영을 보지 않는다** ─────────
       우리 쪽에서 `teamSize - 1` 명이 죽었으면 생존자가 1명이 된 순간이 실제로 있었다.
       같은 초에 둘이 죽어도 **실시간에는 순서가 있으므로** 그 순간은 존재한다.
       1대1 을 빼지 않는다 — 사용자 원문이 "1대1이든 1대2든 전부 세이브" 라고 못 박았다 */
    if (input.restorable && countable && won !== null && ours.length >= input.teamSize - 1) {
      save.rounds += 1
      if (won) save.won += 1
    }

    /*
     * ★소수싸움 점수★ (2026-09-18 사장님: 여섯 축을 전부 점수로).
     *
     * ★몇 명 모자란 걸 뒤집었나★ 로 값이 갈린다 — 1명 1점 · 2명 3점 · 3명 5점 (2n−1).
     * 죽은 순서대로 따라가며 ★가장 나빴던 순간★ 의 인원 차를 찾는다.
     *
     * ⚠ ★진 라운드는 안 센다★ — 밀리기만 하고 못 뒤집었으면 세이브가 아니다.
     * ⚠ 이 점수는 ★합계에 안 더한다★ (`matchScoreTotal`) — 육각의 한 칸으로만 쓴다.
     */
    if (input.restorable && countable && won === true) {
      const alive = new Map<string, number>([
        [input.teamNo, input.teamSize],
        [input.foeTeamNo, input.teamSize],
      ])
      let worst = 0
      for (const death of [...deaths].sort((a, b) => a.at - b.at)) {
        const left = alive.get(death.team)
        if (left === undefined) continue
        alive.set(death.team, left - 1)
        const gap = (alive.get(input.teamNo) ?? 0) - (alive.get(input.foeTeamNo) ?? 0)
        if (gap < worst) worst = gap
      }
      if (worst < 0) scoreSave += saveScore(-worst)
    }

    /* ───────── ⑤ 의 진영 안 보는 판(⑤-1 대안) ───────── */
    const verdict =
      input.restorable && countable && sniperKnown && won === true
        ? lastFoeDeathVerdict(theirs, input.weaponByPlayer)
        : null
    if (verdict !== null) {
      if (verdict === 'noDeath') lastSniper.noFoeDeathRounds += 1
      else if (verdict === 'unknown') lastSniper.unknownLastWeaponRounds += 1
      else if (verdict === 'ambiguous') lastSniper.ambiguousLastRounds += 1
      else {
        lastSniper.wonRounds += 1
        if (verdict === 'sniper') lastSniper.wonSniperLast += 1
      }
    }

    const side = input.sideOf.get(round)
    /* 진영을 모르는 라운드는 **분모에도 넣지 않는다** (D-106) */
    if (side === undefined) continue
    tally.sidedRounds += 1
    if (side !== 'attack') continue

    /* ───────── 여기부터 레드(공격) 라운드다 ───────── */
    tally.redRounds += 1
    sniperFight.redRounds += 1
    tempo.redRounds += 1
    attackZone.redRounds += 1
    if (won === true) attackZone.redWonRounds += 1

    /* ───────── ④ 게임템포 — 상대 3번째 사망까지. **하한값이다** ─────────
       라운드 시작 시각이 없어 그 라운드 **첫 이벤트**를 시작으로 삼는다.
       3명을 못 지운 라운드는 분모에서 뺀다 (④-2 미확인 — 채우면 그 상한이 지어낸 값이 된다).
       ⚠ `3명 제거` 가 우리가 죽인 것만인지 탈주·자살을 포함하는지 모른다 (④-3).
       여기서는 **이유를 가리지 않고** 상대가 줄어든 것을 센다 */
    if (input.restorable && countable) {
      const third = theirs[TEMPO_CLEAR_KILLS - 1]
      if (third === undefined) {
        tempo.redRoundsWithoutThreeClears += 1
      } else {
        const seconds = third.at - clock.first
        tempo.redClearThreeRounds += 1
        tempo.redClearThreeSecondsLowerBound.push(seconds)
        tempo.redClearThreeSecondsLowerBoundSum += seconds
      }
    }

    /* ───────── ⑤ B어택성공 (레드 판) ───────── */
    if (verdict !== null && verdict !== 'noDeath' && verdict !== 'unknown' && verdict !== 'ambiguous') {
      lastSniper.redWonRounds += 1
      if (verdict === 'sniper') lastSniper.redWonSniperLast += 1
    }

    /* ───────── ① 스나싸움 · ⑥ A어택성공 — 레드 라운드의 상대 스나 킬 ─────────
       자리는 **죽인 쪽 / 죽은 쪽 둘 다**로 판정한다. 원문이 어느 쪽인지 말하지 않는다
       (①-3 · ⑥-2). 실측에서 두 값이 크게 달라, 한쪽만 내면 다른 해석을 못 만든다 */
    if (!sniperKnown) continue
    const zoneSniperKill: ZoneCount = { byKiller: 0, byVictim: 0 }
    for (const kill of input.killsByRound.get(round) ?? []) {
      if (input.roster.teamOf.get(kill.killer) !== input.teamNo) continue
      if (!foeSnipers.has(kill.victim)) continue

      sniperFight.foeSniperKills += 1

      const spots: [keyof ZoneCount, number | null, number | null][] = [
        ['byKiller', kill.killerX, kill.killerY],
        ['byVictim', kill.victimX, kill.victimY],
      ]
      for (const [which, x, y] of spots) {
        if (x === null || y === null) continue
        const spot = { x, y }
        sniperFight.killsWithPosition[which] += 1

        const inA = input.zones.aSide ? inZone(input.zones.aSide, spot) : false
        const inB = input.zones.bLong ? inZone(input.zones.bLong, spot) : false
        if (input.zones.aSide && inA && sniperFight.aSideKills) {
          sniperFight.aSideKills[which] += 1
        }
        if (input.zones.bLong && inB && sniperFight.bLongKills) {
          sniperFight.bLongKills[which] += 1
        }
        if (!inA && !inB && sniperFight.unzonedKills) sniperFight.unzonedKills[which] += 1

        if (input.zones.attack) {
          attackZone.sniperKillsWithPosition[which] += 1
          if (inZone(input.zones.attack, spot)) {
            attackZone.sniperKillsInNamedZone[which] += 1
            zoneSniperKill[which] += 1
          } else {
            attackZone.sniperKillsOutsideNamedZone[which] += 1
          }
        }
      }
    }
    /* 사용자가 못 박았다 — *"저 위치중 한곳에서 잡았는데 라운드 못따면 어택성공X"* */
    for (const which of ['byKiller', 'byVictim'] as const) {
      if (zoneSniperKill[which] === 0) continue
      if (won === true) attackZone.redWonZoneSniperRounds[which] += 1
      if (won === false) attackZone.redLostZoneSniperRounds[which] += 1
    }
  }

  /* ========================================================================
   * 지금 쓰는 축 셋 — ① 스나 대 스나 · ⑤ 선짤 · ⑥ 교환 (2026-09-02 · D-256)
   *
   * 위 루프와 **따로 돈다.** 위는 진영(레드/블루)을 보는 축들이고 이 셋은 진영을 안 본다.
   * 섞어 넣으면 위 루프의 진영 조건이 이쪽에도 걸려 표본이 조용히 반토막 난다.
   * ======================================================================== */

  /** 우리 팀에서 스나로 확정된 선수들 — ① 은 **양쪽** 스나가 있어야 성립한다 */
  const ourSnipers = new Set<string>()
  for (const [usn, weapon] of input.weaponByPlayer) {
    if (weapon !== 1) continue
    if (input.roster.teamOf.get(usn) !== input.teamNo) continue
    ourSnipers.add(usn)
  }

  /** 상대 팀에서 스나로 확정된 선수들 — ④ 는 **양 팀**을 다 본다 (2026-09-15) */
  const foeSniperSet = new Set<string>()
  for (const [usn, weapon] of input.weaponByPlayer) {
    if (weapon !== 1) continue
    const team = input.roster.teamOf.get(usn)
    if (team === undefined || team === input.teamNo) continue
    foeSniperSet.add(usn)
  }

  const sniperDuel: SniperDuelTally = { rounds: input.roundNumbers.length, won: 0, lost: 0 }
  /* ★스나싸움은 롱에서만★ — 잡은 쪽·죽은 쪽 좌표가 **둘 다** A롱 5구역 또는 비롱 안일 때만
     센다 (2026-09-10 사장님 확정 · `SNIPER_DUEL_ZONE_RULE`). 옛 판은 맵 전체를 셌다 */
  const longZones = [input.zones.aLong, input.zones.bLong].filter(
    (zone): zone is ZoneCells => !!zone,
  )
  const duelZonesKnown = SNIPER_DUEL_ZONE_RULE === 'anywhere' || longZones.length > 0
  const inLong = (x: number | null, y: number | null): boolean => {
    if (SNIPER_DUEL_ZONE_RULE === 'anywhere') return true
    if (x === null || y === null) return false
    const spot = { x, y }
    return longZones.some((zone) => inZone(zone, spot))
  }
  const firstBlood: FirstBloodTally = { rounds: 0, won: 0, tiedRounds: 0 }
  /** ⑥ 선짤없이 라운드 시작 — 먼저 맞지 않고 연 라운드 (2026-09-16 사장님) */
  const firstBloodless: FirstBloodlessTally = { rounds: 0, lost: 0, tiedRounds: 0 }
  /** ⑤ 스나영향력 — 우리 스나가 일한 라운드 / 침묵한 라운드 (2026-09-16 사장님) */
  const sniperInfluence: SniperInfluenceTally = {
    rounds: 0, won: 0, quietRounds: 0, quietWon: 0,
    aliveRounds: 0, aliveWon: 0, deadEarlyRounds: 0, deadEarlyWon: 0,
  }
  const trade: TradeTally = { deaths: 0, within3: 0, within5: 0, within10: 0, sameRound: 0 }
  /** ④ 라이플화력 — 스나가 아무것도 못 한 라운드의 ★킬★ 을 누가 냈나 (2026-09-15 사장님) */
  const riflePower: RiflePowerTally = { rounds: 0, won: 0, situationRounds: 0 }
  /* ★새 축 둘★ (2026-09-16 밤 사장님) */
  const blockChance: BlockChanceTally = { foeOpenRounds: 0, cutRounds: 0, openRounds: 0, heldRounds: 0 }
  const gapScore: GapScoreTally = {
    ourSniper: 0, ourRifle: 0, foeSniper: 0, foeRifle: 0,
    sniperHeads: 0, rifleHeads: 0, rounds: 0,
  }
  /* 한 팀 인원 — 세이브·소수싸움 가산을 가리는 데 쓴다 */
  let ourSize = 0
  let foeSize = 0
  for (const [, team] of input.roster.teamOf) {
    if (team === input.teamNo) ourSize += 1
    else foeSize += 1
  }
  /**
   * 「1,2,3번째」 의 경계. 4·5번째는 제외다 (사장님이 괄호로 못 박음).
   * ★죽지 않은 스나는 이 경계를 안 탄다★ — 2026-09-15 밤에 «살아있는데» 가 더해졌다.
   */
  const RIFLE_POWER_DEATH_ORDER = RIFLE_POWER_DEATH_ORDER_V2

  const isOurs = (usn: string): boolean => input.roster.teamOf.get(usn) === input.teamNo

  /*
   * ★라운드가 몇 초에 시작했나★ — 선짤의 25초 창을 재려면 필요하다 (2026-09-15 사장님).
   * 게임템포와 ★같은 값★ 을 쓴다: 1라운드는 경기 시작 +10초, 그 뒤는 직전 라운드
   * 마지막 킬 +8.45초. `input.roundNumbers` 는 오름차순이다.
   */
  let prevRoundEnd: number | null = null

  for (const round of input.roundNumbers) {
    const kills = input.killsByRound.get(round) ?? []
    if (kills.length === 0) continue
    const roundStart = prevRoundEnd === null ? MATCH_TO_FIRST_ROUND_SECONDS : prevRoundEnd + ROUND_GAP_SECONDS

    /* ── ① 스나 대 스나. 구역을 안 본다 ── */
    for (const kill of kills) {
      if (input.weaponByPlayer.get(kill.killer) !== 1) continue
      if (input.weaponByPlayer.get(kill.victim) !== 1) continue
      /*
       * ★한쪽만 롱 안이어도 스나싸움이다★ (2026-09-18 사장님).
       *
       * ⚠ 옛 규칙은 ★둘 다 롱 안★ 이었다 (2026-09-10). 그때는 뜻이 맞았지만
       *   실측에서 ★네 건이 새어 나갔다★ — 사장님이 손으로 세신 7:1 이 4:0 으로 찍혔다:
       *   ```
       *     r1   비롱(158,427→벙커) …  한쪽이 벙커라 안 셌다
       *     r8   비롱(174,207)→벙커
       *     r13  비롱(168,173)→벙커
       *     r12  벙커→비롱(172,206)
       *   ```
       *   비롱 칸은 y 160~400 인데 그 라인 ★바로 아래(y 427~436)가 벙커★ 로 칠해져 있다.
       *   같은 비롱 라인을 두고 벌인 싸움인데 한쪽 끝이 벙커라 빠진 것이다.
       *
       * ★스나싸움은 「롱 라인을 두고 벌어지는 싸움」★ 이다 — 한쪽이 롱에 있으면 그 싸움이다.
       * ⚠ 칠한 칸은 안 건드린다 — 벙커를 비롱으로 바꾸면 비리베 점수와 폭탄 B쪽 판정이 같이 흔들린다.
       * ⚠ 옛 규칙으로 되돌리려면 `||` 를 `&&` 로 바꾸면 된다.
       */
      if (!inLong(kill.killerX, kill.killerY) && !inLong(kill.victimX, kill.victimY)) continue
      if (isOurs(kill.killer) && !isOurs(kill.victim)) sniperDuel.won += 1
      else if (!isOurs(kill.killer) && isOurs(kill.victim)) sniperDuel.lost += 1
    }

    /* ── ⑤ 선짤. 같은 초에 양 팀이 하나씩이면 **양 팀 다 분모에서 뺀다** (사용자 (가)) ── */
    let earliest = Infinity
    for (const kill of kills) if (kill.at < earliest) earliest = kill.at
    let oursFirst = false
    let foeFirst = false
    for (const kill of kills) {
      if (kill.at !== earliest) continue
      if (isOurs(kill.killer)) oursFirst = true
      else foeFirst = true
    }
    /*
     * ★25초 창★ (2026-09-15 사장님 «2로 가») — 라운드 시작 후 25초 안에 첫 킬이 난
     * 라운드만 ★분모★ 다. 25초 안에 아무도 못 딴 라운드는 양 팀 다 못 겨룬 것이라
     * «졌다» 로 적지 않는다 (①안처럼 전 라운드를 분모로 쓰면 52.5% → 32.0% 로
     * 육각이 통째로 쪼그라든다).
     *
     * 실측(클랜 6,729라운드): 지금 52.5% → ②안 ★53.8%★ — 값이 거의 안 움직인다.
     */
    const openedInWindow = earliest - roundStart <= OPENING_WINDOW_SECONDS
    if (oursFirst && foeFirst) {
      firstBlood.tiedRounds += 1
    } else if (openedInWindow) {
      firstBlood.rounds += 1
      if (oursFirst) firstBlood.won += 1
    }

    /*
     * ── ⑥ 선짤없이 라운드 시작 (2026-09-16 사장님) ──
     *   «전체라운드를 분모에 두고 당한 라운드를 분자에 넣고 1에서 빼면»
     *
     *   ★25초 창을 안 본다★ — 옛 ⑤ 선짤은 «겨룬 라운드» 만 분모로 썼는데,
     *   이 축은 «라운드를 먼저 맞지 않고 열었나» 라서 모든 라운드가 분모다.
     *   동시각은 옛 선짤과 같은 규칙으로 양 팀 다 뺀다.
     */
    if (oursFirst && foeFirst) {
      firstBloodless.tiedRounds += 1
    } else {
      firstBloodless.rounds += 1
      /* `oursFirst` 는 «우리가 먼저 땄다» 다 — 아니면 우리가 먼저 맞은 것이다 */
      if (!oursFirst) firstBloodless.lost += 1
    }

    /*
     * ── ⑤ 스나영향력. ★우리 스나가 일한 라운드와 침묵한 라운드의 승률을 따로 쌓는다 ──
     *
     *   값은 나중에 ★두 승률의 차★ 로 낸다 (`clanHexV2Axes`). 여기서는 나누지 않는다 —
     *   경기를 합칠 때 «비율을 평균 내지 않는다» 는 규칙 때문이다 (분자·분모를 쌓는다).
     *
     *   ★우리 스나가 없으면 안 센다★ — 스나를 안 쓴 경기는 «침묵» 이 아니라 «해당 없음» 이다.
     */
    if (ourSnipers.size > 0) {
      const wonThisRound = input.wonRound(round)
      if (wonThisRound !== null) {
        let ourSniperKills = 0
        for (const kill of kills) {
          if (!isOurs(kill.killer)) continue
          if (input.weaponByPlayer.get(kill.killer) !== 1) continue
          ourSniperKills += 1
        }
        /* ⚠ 옛 셈(A) — 계속 쌓는다. 되돌리려면 이 네 칸만 보면 된다 */
        if (ourSniperKills > 0) {
          sniperInfluence.rounds += 1
          if (wonThisRound) sniperInfluence.won += 1
        } else {
          sniperInfluence.quietRounds += 1
          if (wonThisRound) sniperInfluence.quietWon += 1
        }
        /*
         * ★지금 셈(B) — 우리 스나가 «먼저» 죽었나★ (2026-09-16 밤 사장님 «b로 가자»).
         *
         * ── 왜 A 에서 갈아탔나
         *   A 의 «침묵한 라운드» 에는 ①진짜 조용 과 ②먼저 죽어서 못 쏨 이 섞여 있었다.
         *   ②가 섞이면 «스나 덕에 이겼다» 가 아니라 «지는 라운드라 스나가 못 쐈다» 를
         *   같이 재게 된다 — 인과가 거꾸로 섞인다.
         *
         * ── 실측 (최근 2,500경기 · 클랜 54곳)
         *   A 지금 축 +8.3%p 퍼짐 5.0 · ★B +9.2%p 퍼짐 5.6★ · C 선취 +6.8%p · D 살아남음 +17.6%p
         *   B 는 스나싸움과 상관 ★0.115★ — 거의 딴 말을 한다 (사장님: «스나싸움을 많이
         *   이겼다고 게임 영향력이 무조건 큰건 아니라서»).
         *
         * ★죽은 차례는 양 팀을 통틀어 센다★ — «라운드 초반에 지워졌나» 가 뜻이다.
         *   우리 팀 안에서 첫 번째인지를 보면 우리가 늦게까지 안 죽은 라운드도
         *   «먼저 죽음» 이 되어 버린다.
         */
        const deadOrder: string[] = []
        for (const kill of kills) if (!deadOrder.includes(kill.victim)) deadOrder.push(kill.victim)
        const sniperDiedEarly = deadOrder
          .slice(0, SNIPER_EARLY_DEATH_ORDER)
          .some((usn) => ourSnipers.has(usn))
        if (sniperDiedEarly) {
          sniperInfluence.deadEarlyRounds += 1
          if (wonThisRound) sniperInfluence.deadEarlyWon += 1
        } else {
          sniperInfluence.aliveRounds += 1
          if (wonThisRound) sniperInfluence.aliveWon += 1
        }
      }
    }

    /*
     * ── ★기회차단★ — 먼저 맞고 시작한 라운드를 끊어냈나 (2026-09-16 밤 사장님) ──
     *
     *   상대가 그 라운드 첫 킬을 냈을 때, ★다음 킬을 우리가 냈나★.
     *   5대4 로 밀린 걸 4대4 로 되돌려놓은 것이다. 이겼는지는 안 본다 —
     *   실측에서 «이겼나» 를 넣으면 경기 승률과 0.79 로 겹쳤고, «되받았나» 는 0.015 였다.
     *
     *   뒷면(우리가 열고 또 잡음)도 같이 쌓는다. 축에는 안 쓰지만 «굳힘» 을 되살릴 때
     *   재수집이 없어야 한다 (`CLAUDE.md` 1-4).
     */
    /* ★시간순이 필요하다★ — `killsByRound` 는 정렬을 약속하지 않는다 */
    const ordered = [...kills].sort((a, b) => a.at - b.at)
    if (ordered.length >= 2) {
      const opener = ordered[0] as PlaystyleKill
      const second = ordered[1] as PlaystyleKill
      const openerOurs = isOurs(opener.killer)
      const secondOurs = isOurs(second.killer)
      if (openerOurs) {
        blockChance.openRounds += 1
        if (secondOurs) blockChance.heldRounds += 1
      } else {
        blockChance.foeOpenRounds += 1
        if (secondOurs) blockChance.cutRounds += 1
      }
    }

    /*
     * ── ★스나차이 · 라플차이★ — 무기별 점수를 상대와 견준다 (2026-09-16 밤 사장님) ──
     *
     *   점수표는 `GapScoreTally` 주석에 그대로 적어 두었다.
     *   ★양 팀을 다 센다★ — 그래야 «차» 가 나온다.
     */
    {
      const won = input.wonRound(round)
      if (won !== null) {
        gapScore.rounds += 1
        /* 팀별 사망 차례 — 세이브·소수싸움 가산을 가리는 데 쓴다 */
        const deadOurs: string[] = []
        const deadFoe: string[] = []
        for (const kill of ordered) {
          const list = isOurs(kill.victim) ? deadOurs : deadFoe
          if (!list.includes(kill.victim)) list.push(kill.victim)
        }
        /* 우리가 수적으로 밀린 순간이 있었나 */
        let ourFew = false
        let foeFew = false
        {
          let dOurs = 0
          let dFoe = 0
          for (const kill of ordered) {
            if (isOurs(kill.victim)) dOurs += 1
            else dFoe += 1
            if (ourSize - dOurs < foeSize - dFoe) ourFew = true
            if (foeSize - dFoe < ourSize - dOurs) foeFew = true
          }
        }
        const opener = ordered[0] as PlaystyleKill | undefined
        for (const [usn, weapon] of input.weaponByPlayer) {
          const ours = isOurs(usn)
          const roster = ours ? ourSize : foeSize
          const dead = ours ? deadOurs : deadFoe
          const isSniper = weapon === 1
          let mine = 0
          for (const kill of kills) if (kill.killer === usn) mine += 1
          const alone = !dead.includes(usn) && dead.length === roster - 1
          if (mine === 0 && !alone) continue
          let pt = 0
          if (mine > 0 && opener !== undefined) {
            /* ★판을 열었나★ — 스나는 «상대 스나를» 잡아야 하고, 라플은 누구든 좋다 */
            const opened = opener.killer === usn
            const rightOpen = isSniper
              ? opened && input.weaponByPlayer.get(opener.victim) === 1 && isOurs(opener.victim) !== ours
              : opened
            const table = rightOpen ? GAP_OPEN_POINTS : GAP_PLAIN_POINTS
            pt += table[Math.min(mine, table.length) - 1] as number
          }
          if (alone && won === ours) pt += GAP_SAVE_POINT
          if (!dead.includes(usn) && mine > 0 && (ours ? ourFew : foeFew)) {
            pt += GAP_FEW_POINT
            if (won === ours) pt += GAP_FEW_WIN_POINT
          }
          if (pt === 0) continue
          if (ours) {
            if (isSniper) gapScore.ourSniper += pt
            else gapScore.ourRifle += pt
          } else if (isSniper) gapScore.foeSniper += pt
          else gapScore.foeRifle += pt
        }
      }
    }

    /* ── ④ 라이플화력. ★어느 쪽이든★ 스나가 1킬 없이 1~3번째로 지워진 라운드를 나눠 갖는다 ── */
    if (ourSnipers.size > 0 || foeSniperSet.size > 0) {
      /*
       * ⚠ 승패를 모르는 라운드는 통째로 뺀다. 킬만 세면 «절반쯤 아는 라운드» 가
       *   섞여 표본이 흐려진다 (D-106 — 모르는 것을 지어내지 않는다).
       */
      const won = input.wonRound(round)
      if (won !== null) {
        /* 팀별로 죽은 차례 — 같은 사람이 두 번 나오지 않게 처음 것만 남긴다 */
        const deathOrder = new Map<boolean, string[]>([[true, []], [false, []]])
        for (const kill of kills) {
          const side = isOurs(kill.victim)
          const list = deathOrder.get(side) as string[]
          if (!list.includes(kill.victim)) list.push(kill.victim)
        }
        /* 그 라운드에 킬을 낸 사람들 — 「1킬도 하지못하고」 를 가른다 */
        const killedSomeone = new Set<string>()
        for (const kill of kills) killedSomeone.add(kill.killer)

        /*
         * ★스나 전원★ 이 「1킬 0 + 1~3번째 사망」 이어야 «라플들끼리 남았다» 가 참이다.
         * 실측상 한 팀의 스나는 93%가 한 명뿐이라 이 조건은 거의 «그 한 명» 과 같다.
         */
        const sniperIdle = (snipers: ReadonlySet<string>, ours: boolean): boolean => {
          if (snipers.size === 0) return false
          const order = deathOrder.get(ours) as string[]
          return [...snipers].every((usn) => {
            if (killedSomeone.has(usn)) return false
            const at = order.indexOf(usn)
            /*
             * ★살아남은 스나도 센다★ (2026-09-15 밤 사장님:
             *   «스나가 1킬도 못하고 살아있는데 라플끼리 딴 라운드도 포함시켜»).
             *   `at === -1` 이면 그 라운드에 안 죽은 것이다 — 킬도 없으니 한 일이 없다.
             *   4·5번째로 죽은 경우만 빠진다 (사장님이 처음에 괄호로 못 박음).
             */
            return at === -1 || at < RIFLE_POWER_DEATH_ORDER
          })
        }
        /* ★한쪽만 걸려도 분모★ — 그래야 양 팀 분모가 같아지고 합이 100% 가 된다 */
        if (sniperIdle(ourSnipers, true) || sniperIdle(foeSniperSet, false)) {
          riflePower.situationRounds = (riflePower.situationRounds ?? 0) + 1
          if (RIFLE_POWER_UNIT === 'rifleKills') {
            /*
             * ★지금 — 양 팀 라플이 낸 킬 중 우리 몫★ (2026-09-16 사장님).
             *
             *   스나가 아무것도 못 한 라운드를 고른 것이므로 ★스나 킬은 안 센다★ —
             *   섞으면 상대 스나의 활약이 «우리 라플이 못했다» 로 둔갑한다.
             *   ⚠ `rounds` 칸이 담는 것은 ★라플 킬 수★ 다 (칸 이름은 옛것이다).
             */
            for (const kill of kills) {
              if (input.weaponByPlayer.get(kill.killer) !== 0) continue
              riflePower.rounds += 1
              if (isOurs(kill.killer)) riflePower.won += 1
            }
          } else if (RIFLE_POWER_UNIT === 'allKills') {
            /*
             * ⚠ ★2026-09-15 판★ — 그 라운드들의 «모든 킬» 을 나눠 갖는다.
             *   0% 를 막으려던 것인데, 모든 클랜이 48~52% 로 몰렸고
             *   상대 스나의 킬까지 섞여 라플 실력이 흐려졌다.
             */
            for (const kill of kills) {
              riflePower.rounds += 1
              if (isOurs(kill.killer)) riflePower.won += 1
            }
          } else {
            /*
             * ⚠ ★2026-09-16 낮 판★ — 라운드를 나눠 갖는다 («몇 대 몇»).
             *   ★스나가 못한 라운드는 대체로 지므로 라플이 잘해도 낮게 나왔다★ —
             *   사장님이 바로 물리셨다.
             */
            riflePower.rounds += 1
            if (won === true) riflePower.won += 1
          }
        }
      }
    }

    /* 다음 라운드의 시작을 재려고 이 라운드의 ★마지막 킬★ 시각을 남긴다 */
    {
      let end = -Infinity
      for (const kill of kills) if (kill.at > end) end = kill.at
      if (Number.isFinite(end)) prevRoundEnd = end
    }

    /* ── ⑥ 교환. 우리 팀원이 상대에게 죽은 뒤 **그 킬러**를 되잡았나 ── */
    for (const death of kills) {
      if (!isOurs(death.victim) || isOurs(death.killer)) continue
      trade.deaths += 1

      /* 그 킬러가 **같은 라운드 안에서 우리 손에** 죽은 가장 이른 시각.
         라운드를 안 보면 `event_time` 이 경기 누적이라 다음 라운드 킬이 딸려 온다 */
      let revengeAt: number | null = null
      for (const back of kills) {
        if (back.victim !== death.killer) continue
        if (!isOurs(back.killer)) continue
        if (back.at < death.at) continue
        if (revengeAt === null || back.at < revengeAt) revengeAt = back.at
      }
      if (revengeAt === null) continue

      const gap = revengeAt - death.at
      trade.sameRound += 1
      if (gap <= 3) trade.within3 += 1
      if (gap <= 5) trade.within5 += 1
      if (gap <= 10) trade.within10 += 1
    }
  }

  tally.rounds = input.roundNumbers.length
  tally.roundsWon = input.roundNumbers.filter((round) => input.wonRound(round) === true).length

  /* ① 은 **양쪽에 스나가 있어야** 성립한다. 한쪽만 있으면 0 이 「한 번도 못 잡았다」가 되고,
     그건 못 잰 것을 최악의 성적으로 만드는 짓이다 (D-106) */
  tally.sniperDuel = sniperKnown && ourSnipers.size > 0 && duelZonesKnown ? sniperDuel : null
  /* ⑤⑥ 은 스나도 진영도 안 본다. 킬 이벤트만 있으면 센다 */
  tally.firstBlood = firstBlood.rounds > 0 || firstBlood.tiedRounds > 0 ? firstBlood : null
  tally.firstBloodless = firstBloodless.rounds > 0 ? firstBloodless : null
  /* ★두 분모가 다 있어야 차를 낼 수 있다★ — 한쪽이 0 이면 «잴 수 없음» 이다 */
  tally.sniperInfluence =
    sniperInfluence.rounds > 0 && sniperInfluence.quietRounds > 0 ? sniperInfluence : null
  tally.trade = trade.deaths > 0 ? trade : null
  /*
   * ④ 는 **어느 쪽 스나든** 짚을 수 있으면 성립한다 (2026-09-15 · ③안).
   * 양 팀을 다 보므로 한쪽에 스나가 없어도 다른 쪽으로 잰다.
   *
   * 스나를 아예 못 짚었으면 조건을 따질 수가 없으니 `null` 이다.
   * 0 이 「한 번도 못 살렸다」가 되면 안 된다 (D-106 — 못 잰 것을 최악으로 적지 않는다).
   *
   * ⚠ 스나는 ★킬로그의 무기★ 로 짚는다 (`weaponByPlayerOf`). 한 판 내내 0킬인
   *   스나는 안 보인다는 뜻인데, 실측상 스나 11,525명 중 ★3명★(0.03%)뿐이라 무시한다.
   */
  tally.riflePower =
    (ourSnipers.size > 0 || foeSniperSet.size > 0) && riflePower.rounds > 0 ? riflePower : null

  /*
   * ★기회차단★ — 상대가 연 라운드가 하나라도 있어야 잴 수 있다.
   *   0 이면 «한 번도 못 끊었다» 가 아니라 «그런 라운드가 없었다» 다 (D-106).
   */
  tally.blockChance = blockChance.foeOpenRounds > 0 ? blockChance : null
  /*
   * ★스나차이·라플차이★ — 사람 수는 마지막에 채운다 (한 사람당으로 나누려고).
   *   양 팀 평균을 쓴다 — 한쪽이 스나 둘, 다른 쪽이 하나면 그 중간이 공평하다.
   */
  if (gapScore.rounds > 0) {
    let ourSn = 0
    let ourRf = 0
    let foeSn = 0
    let foeRf = 0
    for (const [usn, weapon] of input.weaponByPlayer) {
      const ours = input.roster.teamOf.get(usn) === input.teamNo
      if (weapon === 1) {
        if (ours) ourSn += 1
        else foeSn += 1
      } else if (weapon === 0) {
        if (ours) ourRf += 1
        else foeRf += 1
      }
    }
    gapScore.sniperHeads = Math.max(1, (ourSn + foeSn) / 2)
    gapScore.rifleHeads = Math.max(1, (ourRf + foeRf) / 2)
    tally.gapScore = gapScore
  } else tally.gapScore = null

  tally.outnumbered = input.restorable ? outnumbered : null
  tally.save = input.restorable ? save : null
  /*
   * ★소수싸움 점수★ 를 점수 그릇에 옮긴다 (2026-09-18).
   * 점수 블록은 구역 파일이 있어야 돌지만 ★소수싸움은 구역과 무관★ 하다 —
   * 그래서 `tally.score` 가 아직 `null` 이면 여기서 만든다.
   */
  if (scoreSave > 0) {
    if (tally.score === null) tally.score = emptyMatchScore()
    tally.score.save = scoreSave
  }
  tally.tempo = input.restorable ? tempo : null

  /* 아래 셋은 **옛 축**이다. 화면이 안 보지만 계속 센다 (`CLAUDE.md` 10-4) */
  tally.sniperFight = sniperKnown ? sniperFight : null
  tally.lastSniper = input.restorable && sniperKnown ? lastSniper : null
  tally.attackZone = sniperKnown && input.zones.attack ? attackZone : null
  return tally
}

/* -------------------------------------------------------------------------- */
/* ⑤ 의 알맹이                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * 그 라운드에서 **마지막에 죽은 상대**가 스나였나.
 *
 * ```
 * 'sniper'     마지막에 죽은 상대가 스나다              → 성공
 * 'other'      마지막에 죽은 상대가 스나가 아니다        → 실패 (분모에는 남는다)
 * 'noDeath'    상대가 아무도 안 죽었다                  → 분모에서 뺀다 (⑤-2 미확인)
 * 'unknown'    마지막에 죽은 상대의 무기를 모른다        → 분모에서 뺀다 (D-106)
 * 'ambiguous'  같은 초에 둘 이상 죽어 순서를 못 가린다   → 분모에서 뺀다 (D-106)
 * ```
 *
 * `event_time` 은 `MM:SS` 라 초 단위다. 마지막 시각에 둘이 죽었는데 하나만 스나면
 * 누가 나중인지 알 수 없다 — **어느 쪽으로도 밀지 않는다.** 둘 다 스나거나 둘 다
 * 스나가 아니면 순서와 무관하므로 판정할 수 있다.
 */
export function lastFoeDeathVerdict(
  foeDeaths: readonly RoundDeath[],
  weaponByPlayer: ReadonlyMap<string, Weapon>,
): 'sniper' | 'other' | 'noDeath' | 'unknown' | 'ambiguous' {
  if (foeDeaths.length === 0) return 'noDeath'
  let last = Number.NEGATIVE_INFINITY
  for (const death of foeDeaths) if (death.at > last) last = death.at
  const tied = foeDeaths.filter((death) => death.at === last)

  let snipers = 0
  for (const death of tied) {
    const weapon = weaponByPlayer.get(death.usn)
    if (weapon === undefined) return 'unknown'
    if (weapon === 1) snipers += 1
  }
  if (snipers === tied.length) return 'sniper'
  if (snipers === 0) return 'other'
  return 'ambiguous'
}
