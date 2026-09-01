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
 *   2. **`녹뒤` · `머리` 구역의 좌표가 없다** (⑥-1). 사용자가 말한 넷 중 `컨뒤` · `에이설대`
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
  roundResultsOf,
  roundSidesOf,
  type RoundResultEvent,
  type RoundSide,
} from './roundSide'

/** 클랜전은 5대5 다 */
export const CLAN_HEX_TEAM_SIZE = 5

/** ④ 가 재는 것 — 상대를 **이만큼** 지우기까지 걸린 시간 (사양 원문 "3명 이상 제거") */
export const TEMPO_CLEAR_KILLS = 3

/**
 * ⑥ 이 쓸 수 있는 구역 이름 — 사용자가 말한 **넷 중 둘**뿐이다 (⑥-1 · D-183).
 *
 * `data/barracks/style-zones.json` 의 라벨 키다.
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
export interface ClanHexZones {
  /** ① `A쪽` — **확정된 구역 이름이 아니다** (①-2). 안 주면 `aSideKills` 가 `null` */
  aSide?: ZoneCells | null
  /** ① `B롱`(비롱) */
  bLong?: ZoneCells | null
  /** ⑥ 어택 성공으로 인정하는 구역. 지금은 `컨뒤` + `A설대` 둘뿐이다 */
  attack?: ZoneCells | null
  /** ⑥ 에 실제로 쓴 구역 이름 — 값의 출처를 함께 남기려는 것뿐이다 */
  attackLabels?: readonly string[]
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
  /** 그중 **어느 이름도 없는 자리** — `녹뒤`·`머리` 가 여기 섞여 있다 (⑥-1) */
  sniperKillsOutsideNamedZone: ZoneCount
  /** 판정에 쓴 구역 이름. 넷 중 **둘**뿐이라는 사실을 값과 함께 남긴다 */
  zoneLabels: readonly string[]
}

/** 한 경기에서 **한 클랜**의 여섯 축 재료 */
export interface ClanHexTally {
  /** 이 집계의 주인 (`team_no` — 진영이 아니다 · D-184) */
  teamNo: string
  /** 상대 `team_no`. 못 찾으면 `null` 이고 그때는 여섯 축이 전부 `null` 이다 */
  foeTeamNo: string | null
  /** 이벤트로 확인된 라운드 수 (진영을 몰라도 센다) */
  rounds: number
  /** 그중 진영을 **아는** 라운드 수 */
  sidedRounds: number
  /** 그중 진영=레드(공격)인 라운드 수 */
  redRounds: number
  /** 상대 팀에서 **스나로 확정된** 선수 수. 0 이면 ①⑤⑥ 이 `null` 이다 */
  foeSnipers: number

  /** ① */ sniperFight: SniperFightTally | null
  /** ② */ outnumbered: OutnumberedTally | null
  /** ③ */ save: SaveTally | null
  /** ④ */ tempo: TempoTally | null
  /** ⑤ */ lastSniper: LastSniperTally | null
  /** ⑥ */ attackZone: AttackZoneTally | null
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
  sidedRounds: 0,
  redRounds: 0,
  foeSnipers: 0,
  sniperFight: null,
  outnumbered: null,
  save: null,
  tempo: null,
  lastSniper: null,
  attackZone: null,
})

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
}): ClanHexTally {
  const tally = emptyTally(input.teamNo, input.foeTeamNo)

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
  const save: SaveTally = { rounds: 0, won: 0 }
  const tempo: TempoTally = {
    redRounds: 0,
    redClearThreeRounds: 0,
    redClearThreeSecondsLowerBound: [],
    redClearThreeSecondsLowerBoundSum: 0,
    redRoundsWithoutThreeClears: 0,
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

  tally.rounds = input.roundNumbers.length
  tally.sniperFight = sniperKnown ? sniperFight : null
  tally.outnumbered = input.restorable ? outnumbered : null
  tally.save = input.restorable ? save : null
  tally.tempo = input.restorable ? tempo : null
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
