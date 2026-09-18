/**
 * ★선수 실력 점수 · 여섯 축★ — 순수 계산 (DB 를 모른다) (2026-09-10 · 사장님 확정)
 *
 * > "이야 이거야 ㅋㅋ 걍 지금이 베스트오브 베스트야 (…) 개인랭킹 이걸로 확정이다 진심
 * >  클랜은 그냥 원래하던대로 가고" — 사용자, 2026-09-10
 *
 * 사장님이 숫자를 보고 고른 값이다. 지어낸 것이 아니다. 근거는 `docs/ORDERS.md` 와
 * 2026-09-10 세션의 반분신뢰도 실측 (라플 n=389 · 여섯 축 0.441 · 승률 0.232).
 *
 * ── 공식
 *   점수 = BASE + SPREAD × (여섯축 × W_HEX + 승률 × W_WR) × 티어계수 × 신뢰 + 클랜보정
 *   여섯축·승률은 «(백분위 − 50) / 50» 로 −1 ~ +1 에 놓는다
 *   여섯축 = 축 백분위의 가중 평균 (`AXIS_WEIGHT`) — 못 잰 축은 분모에서도 뺀다
 *   티어계수 = Σ TIER_WEIGHT[상대 티어] × 판수 / Σ 판수  (상대 티어를 모르면 CH1 값)
 *   신뢰 = 라운드 / (라운드 + SHRINK_K)
 *   클랜보정 = 소속 클랜의 현재 티어로 ASTRA +40 / CH1 0 / CH2 −40
 *
 * ── 모집단 (2026-09-12 사장님이 바꾸심)
 *   싸움(스나싸움/샷싸움) · 승률 · 킬뎃 → ★리그 × 무기★. 스나수는 스나수끼리.
 *   나머지 다섯 축(세이브·캐리력·선짤·연속킬·소수싸움) → ★리그 통합★. 스나·라플을 섞는다.
 *   주무기 = 그 무기 판수가 다른 무기보다 많고 `MIN_WEAPON_GAMES` 이상. 아니면 못 잰다(null).
 *
 *   ⚠ 옛 서술 — «리그 × 무기다. 스나수는 스나수끼리, 라플수는 라플수끼리 백분위와 등수를
 *     낸다.» 2026-09-12 까지는 여섯 축 전부가 그랬다. 옛 함수는 `foldPlayerHexV1` 이다.
 *
 * ── 축 무게 (반분신뢰도 실측 2026-09-10)
 *   선짤 0.543 · 캐리력 0.528 · 싸움 0.499 · 연속킬 0.340 · 세이브 0.224 · 소수싸움 0.041
 *   소수싸움은 거의 잡음이라 0.3 만 센다. 빼지는 않는다 — 사장님이 지금 구성으로 확정했다.
 *
 * 부리그가 셋이 아닌 리그(SPL)는 티어계수 1 · 클랜보정 0 이다 — 상대 티어라는 것이 없다.
 * [가정] 사장님이 따로 정하지 않았다. 등수는 리그 안에서만 매기므로 순위에는 영향이 없다.
 */
import {
  CARRY_BY_TOTAL_KILLS,
  PLAYER_HEX_WEAPON_POOL_AXIS_KEYS,
  INFLUENCE_BY_EVEN_KILLS,
  TRADE_AXIS,
  influenceOf,
  influencePercentOf,
} from '@sacloud/contract'
import { TIER_WEIGHT, type TierNo } from './iplTiers.js'

/** 공식이 바뀌면 올린다. 화면은 이 판으로 접힌 줄만 믿는다 */
/**
 * ⚠ ★v1.1 — 캐리력 재료가 늘었다★ (2026-09-15 사장님: «캐리력은 라운드당 한 최대 킬 수»).
 *   `maxRoundKills` · `maxRoundTimes` 두 칸이 새로 생겨서, 옛 줄에는 0 이 들어 있다.
 *   버전을 올려야 `--rebuild` 없이도 다시 세어 채운다.
 */
/**
 * ⚠ ★v1.2 — 세이브·소수싸움에서 «승패를 모르는 라운드» 를 뺐다★ (2026-09-15 사장님).
 *   옛 줄은 그 라운드를 분모에만 넣어 «혼자 남았는데 못 이김» 으로 쌓았다.
 *   버전을 올려야 다시 세어 고친다.
 */
/**
 * ⚠ ★v1.3 — «0번 팀» 버그를 고쳤다★ (2026-09-15 사장님이 화면에서 잡아 주심).
 *   `!g.tn` 이 문자열 «0» 을 거짓으로 봐서 0번 팀의 승패가 통째로 빠졌고,
 *   세이브·소수싸움이 «해봤지만 한 번도 못 이김» 으로 쌓였다.
 */
/**
 * ⚠ ★v1.4 — 1대1 이 세이브에서 빠지고 있었다★ (2026-09-15 사장님이 물어서 찾음:
 *   «1대1세이브같은경우에 무조건 두팀중 한명은 세이브인데 1대1 상황이 별로 없나?»).
 *   세이브와 소수싸움을 한 줄에서 세다 «수가 같으면 건너뛴다» 가 세이브에도 걸렸다.
 */
/**
 * ⚠ ★v1.5 — 축 두 개의 뜻이 바뀌었다★ (2026-09-15 사장님).
 *   3번 게임영향력  «한 라운드 최대 킬» → ★우위를 만든 킬 ÷ 라운드★
 *   5번 교환율      «연속킬»           → ★동료가 죽은 직후 되갚은 비율★
 *   새 재료 `evenKills` · `tradeKills` · `mateDeaths` 를 채우려면 다시 세야 한다.
 */
/**
 * ⚠ ★v1.6 — 교환율의 분모를 «내가 살아 있을 때» 로 좁혔다★ (2026-09-15).
 *   옛 판은 내가 먼저 죽은 뒤의 동료 죽음까지 분모에 넣어, 되갚을 수 없었던 것을
 *   «안 갚았다» 로 적었다. 그 탓에 교환율이 평균 4.4% 로 바닥에 깔렸다.
 */
/**
 * ⚠ ★v1.7 — 선짤에 «라운드 시작 후 25초» 창이 생겼다★ (2026-09-15 사장님).
 *   그 전에는 «그 라운드의 첫 킬» 을 무조건 셌다. 40초쯤 지나 슬쩍 잡은 것도
 *   «선짤» 이 됐다. 실측 25초 안이 58.9% 라 절반 조금 넘는 좋은 자리다.
 */
/**
 * ★구역 축의 분모 문턱★ — 이보다 적으면 `null` 이다 (화면에 「측정중」).
 *
 * 실측(시즌0) — 라플 합산(B+2층+숏) 분모 중앙 79 · 10 미만인 선수 13.1%.
 * 스나 A 는 중앙 11 이라 10 미만이 46.3% 다. ★그래서 스나 ④⑥ 은 자주 빈다★ —
 * 사장님이 구역을 콕 집어 주신 값이라 그대로 두고, 0% 로 우기지 않는다.
 */
export const MIN_SIDE_ROUNDS = 10

/** 분모가 문턱을 넘을 때만 비율을 낸다 — 못 재면 `null` 이다 (D-106) */
const sideRate = (ok: number | undefined, n: number | undefined): number | null => {
  const N = n ?? 0
  if (N < MIN_SIDE_ROUNDS) return null
  return round1(((ok ?? 0) / N) * 100)
}

/** 라플 ④⑤ 는 ★B + 2층 + 숏★ 을 합친다. A 는 안 넣는다 (아래 주석) */
const sumSide = (
  input: PlayerHexInput,
  keys: readonly (keyof PlayerHexInput)[],
): number => keys.reduce((acc, k) => acc + Number(input[k] ?? 0), 0)

/*
 * ⚠ ★v1.8 — 구역별 어택/방어를 쌓기 시작했다★ (2026-09-17 사장님).
 *   A·B·2층·숏 넷을 라운드마다 판정해 선수마다 쌓는다. 옇 줄(v1.7)은 그 칸이 0 이라
 *   화면이 «측정중» 이라 적는다 — 0% 로 우기지 않는다. 다시 돌려야 값이 찬다.
 */
/*
 * ⚠ ★v1.9 — 점수제가 들어왔다★ (2026-09-18 사장님: «엠브이피도 이 점수 젤 높은애로»).
 *   `MatchPlayerHex.score` 가 새로 쌓인다. 옛 줄(v1.8)은 그 칸이 0 이라
 *   MVP 가 ★옛 규칙★(세이브→킬→데스)으로 떨어진다 — 다시 돌려야 점수로 정해진다.
 */
/*
 * ⚠ ★v2.0 — 개인 육각도 점수제★ (2026-09-18 사장님:
 *   「개인육각도 점수제로 줄세워서 다시 측정해」).
 *
 *   어택성공률  공격진영일 때 딴 점수 · 평균
 *   방어율      수비진영일 때 딴 점수 · 평균
 *   크랙        칠한 구역 안 25초 안에 딴 점수 · 평균
 *   소수싸움    뒤집어 딴 점수 · 평균
 *   세이브      같은 재료 · ★총합★
 *   샷싸움      ★안 바꿨다★
 *
 *   재료(`atkScore`·`defScore`·`crackScore`·`fewScore`)가 새로 쌓인다 —
 *   옛 줄(v1.9)은 그 칸이 0 이라 네 축이 0 으로 보인다. ★다시 돌려야 찬다.★
 *   옛 셈은 `axisValuesV4Of` 에 남겼다.
 */
export const PLAYER_HEX_FORMULA_VERSION = 'player-hex-v2.0'
/** ⚠ 옛 판 — 구역 뚫은 비율로 재던 때 */
export const PLAYER_HEX_FORMULA_VERSION_V19 = 'player-hex-v1.9'
/** ⚠ 옛 판 — MVP 가 세이브·킬·데스로 정해지던 때 */
export const PLAYER_HEX_FORMULA_VERSION_V18 = 'player-hex-v1.8'
/** ⚠ 옇 판 — 구역 축이 없던 때 */
export const PLAYER_HEX_FORMULA_VERSION_V17 = 'player-hex-v1.7'

export const HEX_BASE = 3000
export const HEX_SPREAD = 700
/**
 * ★판수 무게★ — 라운드가 이만큼이면 점수의 절반을 받는다.
 * 2026-09-12 사장님이 조절판에서 120 → 300 으로 올리셨다.
 * > «지금 판수적은데 상위권인 애들이 너무 많아»
 * 실측 — 상위 30명 중 20판 미만이 여럿이던 것이 1명으로 줄었다.
 */
export const HEX_SHRINK_K = 300
/** ★옛 값★ (2026-09-10 ~ 2026-09-12) */
export const HEX_SHRINK_K_V1 = 120
/**
 * ★여섯 축 : 승률 = 5 대 5★ (2026-09-12 사장님: «5대5로 해줘»).
 *
 * 옛 판은 8 대 2 였다. 그때는 25승 8패(승률 백분위 98.1)인 orczz 가 ★104위★ 였다 —
 * 승률이 점수의 20% 밖에 안 됐기 때문이다. 5 대 5 로 바꾸면 33위가 된다.
 * 상위권(starry · AixIeft · 반짝굴비 · 갑요징어젤)은 네 경우 다 top5 그대로였다.
 *
 * ⚠ 옛 값은 아래에 남긴다 (`CLAUDE.md` 1-4).
 */
export const HEX_W_HEX = 0.19
export const HEX_W_WR = 0.35
/**
 * ★킬뎃 몫★ (2026-09-12 사장님이 조절판에서 고르신 값).
 * 킬뎃은 ★내 구간 + 내 무기★ 것이다 — 화면에 뜨는 킬뎃과 같은 잣대다.
 * 그 구간·무기 판이 10판이 안 되면 구간 전체로, 그것도 모자라면 시즌 전체로 떨어진다.
 * 실측 (872명) — 구간·무기 645명 · 구간 40명 · 전체 187명.
 */
export const HEX_W_KD = 0.46
/** ★옛 판★ — 여섯 축 8 : 승률 2 (2026-09-10 ~ 2026-09-11) · 5 대 5 (2026-09-12 반나절) */
export const HEX_W_HEX_V1 = 0.8
export const HEX_W_WR_V1 = 0.2
export const HEX_W_HEX_V2 = 0.5
export const HEX_W_WR_V2 = 0.5
/** 소속 클랜 티어 보정 — ASTRA / CHALLENGER1 / CHALLENGER2 */
export const HEX_CLAN_BONUS: Readonly<Record<TierNo, number>> = { 1: 40, 2: 0, 3: -40 }
/** 주무기로 인정하는 최소 판수 */
export const MIN_WEAPON_GAMES = 10
/** 싸움 축 최소 표본 — 잡음 + 당함 */
export const MIN_DUELS = 20
/** 라운드 축(세이브 · 소수싸움) 최소 표본 — 그 상황을 겪은 라운드 수 (D-194) */
export const MIN_SITUATION_ROUNDS = 10
/** 연속킬 — 앞 킬과 이 초 이내면 연속이다 */
export const BURST_GAP_SECONDS = 2

/* ⚠ ★2026-09-16 — ④ 가 `opening`(선짤) 에서 `survival`(평균 사망 시간) 로★ (사장님).
   키를 그대로 두면 옛 값과 새 값이 한 이름으로 섞인다 */
/*
 * ★개인 여섯 — 2026-09-16 밤 사장님이 통째로 바꿨다★.
 *   스나  스나싸움 · 기회창출 · 소수싸움 · 세이브 · 스나차이 · 안전함
 *   라플  화력 · 기회차단 · 크랙 · 세이브 · 소수싸움 · 라플차이
 * 키는 여섯이고 ★무기별로 다른 값★ 이 들어간다.
 */
export const HEX_AXIS_KEYS = ['save', 'duel', 'chance', 'safe', 'gap', 'outnumbered'] as const
/** ⚠ ★2026-09-16 저녁까지 쓰던 여섯★ — 게임영향력·게임템포·크랙성공. 지우지 않는다 */
export const HEX_AXIS_KEYS_V4 = ['save', 'duel', 'carry', 'survival', 'crack', 'outnumbered'] as const
/** 2026-09-16 저녁까지 쓰던 여섯 — ⑤ 가 `burst`(백어택) 였다 (`CLAUDE.md` 1-4) */
export const HEX_AXIS_KEYS_V2 = ['save', 'duel', 'carry', 'survival', 'burst', 'outnumbered'] as const
/** 2026-09-16 까지 쓰던 여섯 — 지우지 않는다 (`CLAUDE.md` 1-4) */
export const HEX_AXIS_KEYS_V1 = ['save', 'duel', 'carry', 'opening', 'burst', 'outnumbered'] as const
export type HexAxisKey = (typeof HEX_AXIS_KEYS)[number]

/**
 * ★축 무게★ — 2026-09-12 사장님이 조절판에서 세이브 0.5 → 2.0 · 소수싸움 0.3 → 2.0 으로 올리셨다.
 *
 * ⚠ 그 둘은 ★반분신뢰도가 가장 낮은 축★ 이다 (선짤 0.543 … 소수싸움 0.041).
 *   «같은 선수가 다시 해도 값이 잘 안 맞는» 축이라 원래 무게를 낮춰 뒀었다.
 *   올리면 운이 순위에 더 섞인다 — 사장님께 말씀드리고 그대로 넣었다.
 *
 * 옛 값은 AXIS_WEIGHT_V1 에 남긴다 (CLAUDE.md 1-4).
 */
export const AXIS_WEIGHT: Readonly<Record<HexAxisKey, number>> = {
  safe: 1.0,
  chance: 1.0,
  duel: 1.0,
  gap: 0.7,
  save: 2.0,
  outnumbered: 2.0,
}

/** ★옛 값★ — 반분신뢰도로 정한 무게 (2026-09-10 ~ 2026-09-12) */
export const AXIS_WEIGHT_V1: Readonly<Record<HexAxisKey, number>> = {
  safe: 1.0,
  chance: 1.0,
  duel: 1.0,
  gap: 0.7,
  save: 0.5,
  outnumbered: 0.3,
}

/** 한 선수의 재료 — 잡이 리그 안에서 합쳐서 넘긴다 */
export interface PlayerHexInput {
  leaguePlayerId: string
  games: number
  /* ── ★점수제 재료★ (2026-09-18 사장님: 「개인육각도 점수제로 줄세워서 다시 측정해」) ── */
  /** 공격(레드진영) 라운드에서 딴 점수 · 그 라운드 수 */
  atkScore?: number
  atkRounds?: number
  /** 수비(블루진영) 라운드에서 딴 점수 · 그 라운드 수 */
  defScore?: number
  defRounds?: number
  /** ★크랙★ — 칠한 구역 안에서 25초 안에 딴 점수 */
  crackScore?: number
  /** ★소수싸움·세이브★ — 수적 열세를 뒤집어 딴 점수 */
  fewScore?: number
  wins: number
  sniperGames: number
  rifleGames: number
  kills: number
  /** 상대 티어별 판수 — 부리그가 셋이 아닌 리그면 전부 0 */
  tierGames: Readonly<Record<TierNo, number>>
  /** 상대 티어별 이긴 판 — 승률을 «내 구간» 것으로 낼 때 쓴다 (2026-09-12 사장님) */
  tierWins?: Readonly<Record<TierNo, number>>
  /**
   * ★내 구간 + 내 무기 킬뎃★ (%) — 잡이 미리 골라서 넘긴다 (2026-09-12 사장님).
   * 표본이 모자라 못 고르면 null 이고, 그때는 여섯 축 값으로 대신한다 (지어내지 않는다).
   */
  kdRate?: number | null
  /** 소속 클랜의 현재 티어 — 모르거나 부리그가 셋이 아니면 null */
  clanTier: TierNo | null
  /** 배틀로그 합계 (`MatchPlayerHex` 를 더한 것) */
  rounds: number
  firstKills: number
  /**
   * ★크랙 성공의 분자★ (2026-09-16 사장님) — 위 첫 킬 중 ★칠하신 116칸 안★ 에서
   * 잡은 것만. 좌표를 모르는 킬은 안 세므로 언제나 `crackKills <= firstKills` 다.
   * 이 칸이 없던 옛 줄은 0 이고, 그때는 축이 `null` 이다 (0회라고 우기지 않는다).
   */
  crackKills?: number
  /**
   * ★구역별 어택/방어 · 자리 재료★ (2026-09-17 사장님) — 시즌 합.
   * 점수 공식은 이걸 ★안 본다★. 화면이 읽어 개인 육각 ④⑤ 를 그린다.
   */
  aAtkN?: number
  aAtkOk?: number
  aDefN?: number
  aDefOk?: number
  bAtkN?: number
  bAtkOk?: number
  bDefN?: number
  bDefOk?: number
  f2AtkN?: number
  f2AtkOk?: number
  f2DefN?: number
  f2DefOk?: number
  shortAtkN?: number
  shortAtkOk?: number
  shortDefN?: number
  shortDefOk?: number
  seatSpots?: number
  seatBSpots?: number
  seatF2Spots?: number
  seatShortSpots?: number
  sniperKills?: number
  /** 그 선수의 자리 — 30경기 미만이거나 1·2위가 1.1배 안쪽이면 붙지 않는다 */
  seat?: string | null
  seatRatio?: number | null
  /**
   * ★게임템포의 재료★ (2026-09-16 사장님) — 라운드마다 «먼저 겪은 일» 까지의 초, 합.
   * 값은 이걸 `tempoCount` 로 나눈 ★평균★ 이다. 이 칸이 없던 옛 줄은 `undefined` 고,
   * 그때는 축이 `null` 이다 (0초라고 우기지 않는다).
   */
  tempoSeconds?: number
  tempoCount?: number
  /**
   * ★개인 새 6축의 재료★ (2026-09-16 밤 사장님).
   *   `openRounds`    그 라운드 첫 킬 — 스나 «기회창출»
   *   `cutRounds`/`foeOpenRounds`  라플 «기회차단»
   *   `aliveRounds`   스나 «안전함»
   * 이 칸이 없던 옛 줄은 `undefined` 고, 그때는 축이 `null` 이다.
   */
  openRounds?: number
  foeOpenRounds?: number
  cutRounds?: number
  aliveRounds?: number
  /**
   * ★스나차이 · 라플차이★ 의 분자 — 우리 무기 쪽이 앞선 경기 수.
   * 이 칸이 없던 옛 줄은 `undefined` 고, 그때는 축이 `null` 이다.
   */
  gapWinGames?: number
  burstRounds: number
  /**
   * ★게임영향력의 재료★ (2026-09-15 사장님) — 경기마다의 «한 라운드 최대 킬» 을 더한 값.
   * 값은 이걸 판수로 나눈 ★평균★ 을 적 다섯 기준 퍼센트로 바꾼 것이다.
   * 이 칸이 없던 옛 줄은 0 이고, 그때는 축이 `null` 이다 (0% 라고 우기지 않는다).
   */
  maxRoundKills?: number
  /** ★우위를 만든 킬★ 의 합 — 값은 이걸 라운드로 나눈다 (2026-09-15 사장님) */
  evenKills?: number
  /** ★교환★ — 동료가 죽은 직후 그 킬러를 되잡은 횟수의 합 (2026-09-15 사장님) */
  tradeKills?: number
  /** 동료가 죽은 횟수의 합 — 교환의 분모 */
  mateDeaths?: number
  /** ★평균 사망 시간★ — 라운드 시작부터 죽기까지의 초, 합 (2026-09-16 사장님) */
  deathSeconds?: number
  /** 위 합에 들어간 죽음의 수 */
  deathCount?: number
  aloneRounds: number
  aloneWon: number
  outRounds: number
  outWon: number
  /** 주무기 기준 싸움 — 스나면 롱 안 스나 대 스나, 라플이면 라플 대 라플 */
  sniperDuelWon: number
  sniperDuelLost: number
  rifleDuelWon: number
  rifleDuelLost: number
}

export interface AxisResult {
  value: number | null
  pct: number | null
  rank: number | null
  total: number | null
}

export interface PlayerHexResult {
  leaguePlayerId: string
  weapon: 0 | 1 | null
  weaponGames: number
  axes: Record<HexAxisKey, AxisResult>
  winRate: AxisResult
  hex: number | null
  tierFactor: number
  shrink: number
  clanBonus: number
  score: number | null
  scoreRank: number | null
  scoreTotal: number | null
  duelWon: number
  duelLost: number
}

const round1 = (v: number): number => Math.round(v * 10) / 10

/** 주무기 — 판수가 더 많은 쪽이 `MIN_WEAPON_GAMES` 이상일 때만 */
export function mainWeaponOf(input: { sniperGames: number; rifleGames: number }): 0 | 1 | null {
  if (input.sniperGames > input.rifleGames && input.sniperGames >= MIN_WEAPON_GAMES) return 1
  if (input.rifleGames > input.sniperGames && input.rifleGames >= MIN_WEAPON_GAMES) return 0
  return null
}

/** 축 원값 — 표본이 모자라면 null. 0 으로 채우지 않는다 (D-106) */
/**
 * ★점수 평균★ — 점수 합 ÷ 라운드 수. 화면 눈금이 0~100 이라 ×10 해서 올린다.
 * ⚠ 라운드가 없으면 `null` 이다 — 0 으로 우기지 않는다 (D-106).
 */
function scoreRate(total: number | undefined, rounds: number | undefined): number | null {
  if (total === undefined || rounds === undefined || rounds <= 0) return null
  return round1((total / rounds) * 10)
}

export function axisValuesOf(
  input: PlayerHexInput,
  weapon: 0 | 1,
): Record<HexAxisKey, number | null> {
  const duelWon = weapon === 1 ? input.sniperDuelWon : input.rifleDuelWon
  const duelLost = weapon === 1 ? input.sniperDuelLost : input.rifleDuelLost
  const duels = duelWon + duelLost
  return {
    /*
     * ★세이브 — 몇 대 몇 세이브냐에 따라 받은 점수들의 ★총합★★ (2026-09-18 사장님).
     * > 「세이브는 몇대몇 세이브냐에 따라 다르게 받은 점수들의 총합 줄세우기」
     * ⚠ 여섯 중 ★이 축만 총합★ 이다 — 많이 뛴 사람이 위로 가는 것이 사장님 뜻이다.
     */
    save: input.games > 0 ? (input.fewScore ?? 0) : null,
    duel: duels >= MIN_DUELS ? round1((duelWon / duels) * 100) : null,
    /*
     * ★게임영향력 — 매 판 한 라운드에 적 다섯 중 몇 명을 지웠나★ (2026-09-15 사장님:
     * «5킬까지 눈금을 만들어야해 / 앞으로 캐력의 이름은 게임영향력 으로 바꾼다»).
     *
     * ⚠ 옛 값은 ★판당 킬★ 이었다 (`CARRY_BY_TOTAL_KILLS` 로 되돌릴 수 있다).
     *   이름이 «캐리력» 이던 판은 `TRAIT_AXIS_LABEL_V1` 에 남겼다.
     *
     * ⚠ ★시즌은 «최대» 가 아니라 «평균» 이다.★ 한 판 육각은 그 판의 최대 라운드 킬을
     *   그대로 쓰지만, 시즌은 판이 수백이라 최대를 쓰면 거의 전원이 4~5킬(80~100%)로
     *   몰려 줄이 안 선다. 경기마다의 최대를 ★판수로 나눈다★ — 2킬씩 꾸준하면 40% 다.
     *
     * 재료가 없는 옛 줄(합이 0)은 `null` 이다 — 0% 라고 우기지 않는다 (D-106).
     */
    /*
     * ★기회창출(스나) / 기회차단(라플)★ (2026-09-16 밤 사장님).
     *
     *   스나  그 라운드 ★첫 킬★ 을 낸 비율 — «판을 여는 힘»
     *   라플  먼저 맞고 시작한 라운드에서 ★다음 킬★ 을 낸 비율 — «끊는 힘»
     *
     *   실측 — 끊으면 그 라운드 승률 49.7%, 못 끊으면 ★40.8%★.
     *   옛 «게임영향력» 은 `influenceOf` 로 그대로 살아 있다 (`CLAUDE.md` 1-4).
     */
    /*
     * ★④ A어택(스나) / 어택성공률(라플)★ (2026-09-17 사장님).
     *
     *   스나  우리가 공격한 라운드 중 ★A 를 뚫은★ 비율 — 사장님이 A 를 콕 집으셨다
     *   라플  ★B + 2층 + 숏★ 을 합쳐 뚫은 비율. ★A 는 안 넣는다★ —
     *         A 단독은 앞선팀승률 70.3% 로 넷 중 꼴찌이고 선수 46.3% 가 분모 10 미만이다.
     *         빼면 「진 팀이 축을 이겨버린」 판의 설명력이 88.2% → 90.4% 로 오른다.
     *
     *   ⚠ 옛 축 «기회창출 / 기회차단» 은 ★지우지 않았다★ — 재료(`openRounds`·`cutRounds`·
     *     `foeOpenRounds`)가 그대로 쌓이고 있고, 아래 `chanceV3` 가 그 셈이다.
     */
    /*
     * ★어택성공률 — 공격(레드진영)일 때 딴 점수의 평균★ (2026-09-18 사장님).
     *
     * > 「어택성공률:이건 그냥 공격(레드진영)진영일때의 점수만 시즌전체 평균점수 줄 세우기」
     *
     * ⚠ ★진영을 아는 라운드만★ 분모에 들어간다 (D-106).
     * ⚠ 스나·라플이 ★같은 셈★ 이다 — 이름만 A어택 / 어택성공률로 다르다 (사장님이 그대로 두라 하심).
     * ⚠ 옛 셈(구역 뚫은 비율)은 `axisValuesV4Of` 에 남는다 (`CLAUDE.md` 1-4).
     */
    chance: scoreRate(input.atkScore, input.atkRounds),
    /*
     * ★안전함(스나) / 크랙(라플)★ (2026-09-16 밤 사장님).
     *
     *   스나  그 라운드를 ★끝까지 산★ 비율.
     *         ⚠ ★몇 초에 죽었나로 나누면 안 된다★ — 늦게 죽은 건 잘한 게 아니라
     *           혼자 남아 버후 것이었다 (100초 넘어 죽은 라운드는 그때 0.5 대 2.0).
     *           살았나 죽었나만 승률을 62.0% 대 43.5% 로 가른다.
     *   라플  사장님이 칠하신 116칸에서 25초 안에 난 첫 킬 (판당)
     */
    /*
     * ★⑥ A방어(스나) / 크랙(라플)★ (2026-09-17 사장님).
     *   라플 쪽 «크랙» 은 ★그대로다★ — 사장님 사양에 그 이름이 그대로 있다.
     *   스나 쪽만 «안전함» 에서 A방어로 바뀌었다. 옛 셈은 `safeV3` 에 남는다.
     */
    /*
     * ★크랙 — 칠한 구역 안에서 25초 안에 딴 점수의 평균★ (2026-09-18 사장님).
     *
     * > 「내가 칠한 구역 안에서 잡아야 크랙이야 거기서 이제 누굴 잡았냐
     * >  몇명 잡았냐에 따른 점수 차등지급」
     *
     * ⚠ 옛 판은 ★첫 킬 하나만★ 0/1 로 셌다 (`crackKills`). 이제 25초 안의 킬을
     *   전부 세고 스나를 잡았으면 그 값(5·3점)이 그대로 들어간다.
     */
    safe: input.games > 0 ? round1(((input.crackScore ?? 0) / input.games) * 10) : null,
    /*
     * ★스나차이 / 라플차이★ (2026-09-16 밤 사장님) —
     *   그 선수가 뛴 경기 중 «우리 무기 쪽이 상대보다 앞선» 판의 비율.
     *   재료는 클랜 육각의 점수표와 같다 (선짤 1 → 올킬 10).
     *   ⚠ 아직 안 쌓는다 — 그때는 `null` 이다 (0% 라고 우기지 않는다).
     */
    /*
     * ★⑤ B어택(스나) / 방어율(라플)★ (2026-09-17 사장님).
     *   스나  우리가 공격한 라운드 중 ★B 를 뚫은★ 비율
     *   라플  우리가 수비한 라운드 중 ★B+2층+숏 을 안 뚫린★ 비율
     *
     *   ⚠ 어택과 방어는 ★경기 하나 안에서는 같은 수★ 다 (우리 공격 = 상대 수비).
     *     그런데 ★시즌으로 모으면 갈린다★ — 선수 단위 순서 겹침 64.0%,
     *     「막기는 잘 하는데 못 뚫는 선수」가 821명 중 112명(13.6%)이다. 두 칸 다 쓴다.
     */
    /*
     * ★방어율 — 수비(블루진영)일 때 딴 점수의 평균★ (2026-09-18 사장님).
     * > 「방어율은 수지진영일때의 딴 점수만 시즌 전체 평균점수 줄세우기」
     */
    /* ⚠ 옛 셈(구역 뚫은 비율)은 `axisValuesV4Of` 에 그대로 있다 (`CLAUDE.md` 1-4) */
    gap: scoreRate(input.defScore, input.defRounds),
    /*
     * ★소수싸움 — 뒤집어 딴 점수의 ★평균★★ (2026-09-18 사장님).
     * > 「소수싸움은 경기6각에서 받은 소수싸움 점수들의 평균 줄세우기」
     */
    outnumbered: input.games > 0 ? round1(((input.fewScore ?? 0) / input.games) * 10) : null,
  }
}

/**
 * ★줄 세우는 잣대★ — 화면에 적는 값(`axisValuesOf`)과 ★선짤 하나만★ 다르다.
 *
 * ── 왜 (2026-09-15 사장님: «선짤 부문이 스나수한테 너무 유리한데 어떡하지»)
 *   실측 54,863 «경기×선수»:
 *   ```
 *   라플 판당 선짤 0.87 · 스나 2.29  →  ★2.62배★
 *   (견줌: 킬은 1.34배 · 연속킬 1.17배 — ★선짤만 유독 심하다★)
 *   ```
 *   진영으로 갈라도 안 사라진다 — 레드(공격) 1.30배 · 블루(수비) 1.44배 (킬 20,958건).
 *
 * ── 왜 여기에도 필요한가
 *   시즌 육각은 2026-09-12 사장님 지시로 ★싸움만 무기별, 나머지 다섯은 통합★ 이다.
 *   그래서 선짤도 스나·라플을 섞어 견주고 있었고 편향이 그대로 남았다.
 *   ★모집단을 무기별로 쪼개지 않는다★ — 그건 그 지시를 뒤집는 것이다.
 *   대신 그 무기의 «보통» 을 1.0 으로 놓고 그 대비로 견준다.
 *
 * ★적는 값은 안 바뀐다★ (`axisValuesOf`). 백분위와 점수만 공평해진다.
 */
/**
 * ★옛 ⑤ «백어택(교환율)» 의 셈★ — 2026-09-16 에 «크랙 성공» 으로 바뀌며 화면에서
 * 내려갔다. 지우지 않는다 (`CLAUDE.md` 1-4). 재료(`tradeKills`·`mateDeaths`)는 계속 쌓인다.
 */
/**
 * ⚠ ★옛 ⑤ 크랙 — 구역을 안 보던 셈★ (2026-09-16 저녁까지 쓰던 것). 지우지 않는다.
 *
 * 맵 어디서 잡았든 라운드 시작 25초 안의 첫 킬이면 셌다. 사장님이 116칸을 칠해
 * 주시면서 «거기서 잡은 것만» 으로 좁혔다 — 재료 `firstKills` 는 계속 쌓이므로
 * 이 함수로 언제든 옛 값을 되낼 수 있다 (`CLAUDE.md` 1-4).
 */
/**
 * ⚠ ★옛 ④ — 평균 사망 시간★ (2026-09-16 아침~저녁). 지우지 않는다.
 *
 * 죽은 라운드만 보고 «죽을 때는 언제 죽었나» 를 잰다. 재료(`deathSeconds`·
 * `deathCount`)는 계속 쌓이므로 언제든 옛 값을 되낼 수 있다 (`CLAUDE.md` 1-4).
 */
export function deathTimeValueV1(input: PlayerHexInput): number | null {
  return (input.deathCount ?? 0) > 0
    ? Math.round(((input.deathSeconds ?? 0) / (input.deathCount as number)) * 10) / 10
    : null
}

/**
 * ⚠ ★옛 ③ 게임영향력★ (2026-09-15~16) — 축에서 빠졌지만 셈은 살려 둔다.
 *   재료(`evenKills`·`maxRoundKills`)도 계속 쌓이므로 언제든 되낼 수 있다 (`CLAUDE.md` 1-4).
 */
/**
 * ⚠ ★옛 ④ 게임템포★ (2026-09-16 저녁) — 라운드마다 «먼저 겪은 일» 까지의 초.
 *   축에서 빠졌지만 재료(`tempoSeconds`·`tempoCount`)는 계속 쌓인다.
 *   ★작을수록 빠르다★ — 되살리면 부호 뒤집기도 같이 되살려야 한다.
 */
export function tempoValueV5(input: PlayerHexInput): number | null {
  return (input.tempoCount ?? 0) > 0
    ? Math.round(((input.tempoSeconds ?? 0) / (input.tempoCount as number)) * 10) / 10
    : null
}

export function carryValueV4(input: PlayerHexInput): number | null {
  if (INFLUENCE_BY_EVEN_KILLS) return influenceOf(input.evenKills ?? 0, input.rounds)
  if (CARRY_BY_TOTAL_KILLS) {
    return input.games > 0 ? Math.round((input.kills / input.games) * 100) / 100 : null
  }
  return input.games > 0 && (input.maxRoundKills ?? 0) > 0
    ? influencePercentOf((input.maxRoundKills as number) / input.games, input.kills / input.games)
    : null
}

export function crackValueV1(input: PlayerHexInput): number | null {
  return input.games > 0 ? Math.round((input.firstKills / input.games) * 100) / 100 : null
}

export function burstValueV2(input: PlayerHexInput): number | null {
  if (TRADE_AXIS) {
    return (input.mateDeaths ?? 0) > 0
      ? round1(((input.tradeKills ?? 0) / (input.mateDeaths as number)) * 100)
      : null
  }
  return input.games > 0 ? Math.round((input.burstRounds / input.games) * 100) / 100 : null
}

export function axisScoresOf(
  input: PlayerHexInput,
  weapon: 0 | 1,
): Record<HexAxisKey, number | null> {
  /*
   * ⚠ ★2026-09-16 — 선짤 기준선 나누기를 안 한다★ (사장님이 ④ 를 평균 사망 시간으로
   *   바꾸심). 옛 판은 무기별 기준선(`OPENING_BASELINE`)으로 나눠 스나·라플을
   *   한 줄에 세웠는데, 새 축은 ★아예 무기별로 견준다★ (`HEX_WEAPON_SCOPED_AXIS_KEYS`)
   *   — 나눌 필요가 없다. `OPENING_BASELINE` 은 지우지 않는다.
   *
   * ★④ 게임템포만 부호를 뒤집는다★ (2026-09-16 저녁 사장님: «빨리 잡거나 죽을수록
   *   게임템포가 빠른거야»). 여섯 축 중 ★유일하게 작을수록 좋은 축★ 이다.
   *   백분위(`percentileOf`)는 «클수록 위» 로만 세므로, 여기서 한 번 뒤집어
   *   ★빠른 사람이 위★ 로 오게 한다. 화면 값은 안 건드린다 — 초 그대로 적는다.
   */
  /*
   * ⚠ ★2026-09-16 밤 — 부호를 뒤집지 않는다★.
   *   전날 «게임템포» 는 작을수록 좋았지만, «안전함» 은 클수록 좋다.
   *   여섯 축이 전부 «클수록 좋다» 가 됐으므로 적는 값과 잣대가 같다.
   */
  return axisValuesOf(input, weapon)
}

/**
 * ★작을수록 좋은 축★ — 지금은 ★하나도 없다★ (2026-09-16 밤).
 *   전날 «게임템포» 가 유일했는데 «안전함» 으로 갈리면서 없어졌다.
 *   표는 남긴다 — 그런 축이 다시 생기면 여기 넣으면 된다.
 */
export const HEX_LOWER_IS_BETTER: readonly HexAxisKey[] = []

/** 백분위 — 나보다 낮은 사람의 비율 × 100. 오름차순 정렬된 배열을 받는다 */
export function percentileOf(sorted: readonly number[], v: number | null): number | null {
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

/**
 * ★내 구간★ — 가장 많이 뛴 티어 (2026-09-11 사장님).
 *
 * > «클랜 소속에 따라 티어 점수를 받는 게 아니라 자기가 가장 많이 플레이한 구간에 따라
 * >  티어가중치를 받는 거야. 레폭 선수가 클랜 티어는 챌린저지만 본인이 게임을 아스트라에서
 * >  많이 했을 수도 있잖아 (…) 아스트라 티어점수 가중치를 받는 거야, 소속은 챌린저이지만»
 *
 * 판수가 같으면 높은 티어(숫자가 작은 쪽)를 준다. 한 판도 모르면 `null`.
 */
/**
 * ★점수에 쓰는 승률★ — 「내 구간」 승률이다 (2026-09-12 사장님: «어차피 저 구간의 승률로 계산하는 거잖아»).
 *
 * 선수 머리 카드가 이미 구간 승률(ASTRA 25승 8패)을 크게 띄우고 있었는데
 * ★점수는 전체 승률로 세고 있었다.★ 보여 주는 숫자와 줄 세우는 숫자가 달랐다.
 * 클랜 랭킹에서 같은 어긋남을 고친 것과 같은 이유로 여기도 맞춘다.
 *
 * ⚠ 내 구간 판이 ★10판 미만이면 전체 승률로 떨어진다.★ 3판 2승을 66.7% 로 세면
 *   그 한 판이 순위를 흔든다. 구간을 모르면(단일 리그) 그대로 전체다.
 *
 * ⚠ 옛 판(늘 전체 승률)은 `WIN_RATE_BY_HOME_TIER` 를 `false` 로 두면 돌아온다 (`CLAUDE.md` 1-4).
 */
export const WIN_RATE_BY_HOME_TIER = true
/** 구간 승률을 믿으려면 그 구간에서 최소 몇 판 */
export const MIN_HOME_TIER_GAMES = 10

export function winRateOf(p: {
  games: number
  wins: number
  tierGames: Readonly<Record<TierNo, number>>
  tierWins?: Readonly<Record<TierNo, number>>
}): number | null {
  if (WIN_RATE_BY_HOME_TIER && p.tierWins) {
    const home = homeTierOf(p.tierGames)
    if (home !== null) {
      const g = p.tierGames[home]
      if (g >= MIN_HOME_TIER_GAMES) return (p.tierWins[home] / g) * 100
    }
  }
  return p.games > 0 ? (p.wins / p.games) * 100 : null
}

export function homeTierOf(tierGames: Readonly<Record<TierNo, number>>): TierNo | null {
  const tiers: TierNo[] = [1, 2, 3]
  let best: TierNo | null = null
  for (const t of tiers) {
    if (tierGames[t] <= 0) continue
    if (best === null || tierGames[t] > tierGames[best]) best = t
  }
  return best
}

/**
 * ★티어계수★ — 2026-09-11 부터 ★내 구간(가장 많이 뛴 티어) 하나★ 의 무게를 쓴다 (사장님).
 * 용병으로 다른 티어에서 뛴 판도 ★점수에는 그대로 들어간다★ — 구간은 무게와 순위 자리만 정한다.
 *
 * ⚠ 옛 판은 «상대 티어별 판수의 가중 평균» 이었다. `TIER_FACTOR_WEIGHTED = true` 로 되돌린다 (`CLAUDE.md` 1-4).
 */
export const TIER_FACTOR_WEIGHTED = false

export function tierFactorOf(tierGames: Readonly<Record<TierNo, number>>): number {
  const n = tierGames[1] + tierGames[2] + tierGames[3]
  if (n === 0) return 1
  if (!TIER_FACTOR_WEIGHTED) {
    const home = homeTierOf(tierGames)
    return home === null ? 1 : TIER_WEIGHT[home]
  }
  return (
    Math.round(
      ((TIER_WEIGHT[1] * tierGames[1] + TIER_WEIGHT[2] * tierGames[2] + TIER_WEIGHT[3] * tierGames[3]) / n) *
        1000,
    ) / 1000
  )
}

/**
 * ★통합으로 견주는 다섯 축★ — 싸움(duel)만 빼고 전부 (2026-09-12 사장님).
 *
 * > «그 6각형 스나싸움이랑 샷싸움만 라플끼리 스나끼리 비교해서 랭크매기고
 * >  나머지는 전부 다 통합으로 비교분석해»
 *
 * 싸움은 스나면 «롱 안 스나 대 스나», 라플이면 «라플 대 라플» 이라 잣대가 아예 다르다.
 * 나머지 다섯은 무기와 상관없이 같은 뜻의 값이라 스나·라플을 섞어 견준다.
 */
/*
 * ★무기끼리 견주는 축★ — 여기 안 든 축은 리그 전체로 견준다.
 *   ⚠ 2026-09-16 — `survival` 이 늘었다 (사장님: «스나수는 스나수끼리 비교하고
 *     라플수는 라플수끼리 비교해»). 스나는 뒤에서 오래 버티고 라플은 앞에서 죽는다 —
 *     한 줄에 세우면 무기가 곧 순위가 된다.
 */
export const HEX_WEAPON_SCOPED_AXIS_KEYS: readonly HexAxisKey[] =
  PLAYER_HEX_WEAPON_POOL_AXIS_KEYS as readonly HexAxisKey[]
export const HEX_UNIFIED_AXIS_KEYS: readonly HexAxisKey[] = HEX_AXIS_KEYS.filter(
  (k) => !HEX_WEAPON_SCOPED_AXIS_KEYS.includes(k),
)

/**
 * 한 리그의 선수들을 받아 백분위·등수·점수를 낸다 (2026-09-12 판).
 *
 * ── 모집단이 축마다 다르다
 *   싸움(duel) · 승률 · 킬뎃 → ★리그 × 무기★ (스나수는 스나수끼리)
 *   나머지 다섯 축          → ★리그 통합★ (스나·라플을 섞는다)
 *   점수 등수(`scoreRank`)   → 리그 × 무기 (통합 등수는 화면이 따로 매긴다)
 *
 * 주무기가 없는 사람도 돌려준다 — `weapon: null` · 등수 null. 화면이 「측정 중」을 그린다.
 *
 * ⚠ 여섯 축 백분위가 바뀌므로 ★점수도 조금 움직인다.★ 옛 판은 `foldPlayerHexV1` 이다.
 */
export function foldPlayerHex(players: readonly PlayerHexInput[]): PlayerHexResult[] {
  const out: PlayerHexResult[] = []

  /* ── ① 통합 분포 — 다섯 축은 무기를 안 가린다 ── */
  const uni: Record<HexAxisKey, number[]> = {
    save: [], duel: [], chance: [], safe: [], gap: [], outnumbered: [],
  }
  for (const p of players) {
    const w = mainWeaponOf(p)
    if (w === null) continue
    /* ★모집단은 «잣대» 로 만든다★ — 적는 값으로 만들면 선짤 편향이 그대로 남는다 */
    const v = axisScoresOf(p, w)
    for (const key of HEX_UNIFIED_AXIS_KEYS) if (v[key] !== null) uni[key].push(v[key] as number)
  }
  for (const key of HEX_AXIS_KEYS) uni[key].sort((a, b) => a - b)

  /* ── ② 무기별로 접는다. 싸움·승률·킬뎃만 무기 안에서 견준다 ── */
  const measured: PlayerHexResult[] = []
  for (const weapon of [0, 1] as const) {
    const pool = players.filter((p) => mainWeaponOf(p) === weapon)
    const values = pool.map((p) => ({
      p,
      v: axisValuesOf(p, weapon),
      /* 적는 값과 잣대가 다른 축이 있다 — 선짤 (2026-09-15) */
      sc: axisScoresOf(p, weapon),
      wr: p.games > 0 ? (p.wins / p.games) * 100 : null,
    }))
    /* ⚠ 2026-09-16 — 무기별로 견주는 축이 둘이 됐다 (싸움 · 평균 사망 시간) */
    /* ⚠ 2026-09-16 — 무기별로 견주는 축이 셋이 됐다 (싸움 · 평균 사망 시간 · 크랙 성공) */
    /*
     * ⚠ ★2026-09-18 — `chance` 통이 없어서 축이 통째로 «측정중» 이었다★ (사장님 화면).
     *
     *   2026-09-17 에 `chance` 를 ★무기별로 견주는 축★ 목록에 넣었는데
     *   ★여기 분포 통을 안 만들었다.★ 그러면 아래 `scoped` 가 `null` 이 되어
     *   ★통합 분포(`uni`)★ 로 넘어가는데, `uni` 는 ★무기별 축을 아예 안 담는다★
     *   (`HEX_UNIFIED_AXIS_KEYS` 가 걸러 낸다). 그래서 빈 배열로 백분위를 재고
     *   ★전원 `null`★ 이 됐다 — 실측 `carryRank` 0 / 3,662행.
     *
     *   ⚠ ★무기별 목록에 축을 넣을 때는 여기 통도 같이 만든다.★ 두 곳이다.
     */
    const dist = { duel: [] as number[], chance: [] as number[], safe: [] as number[], gap: [] as number[], winRate: [] as number[], kd: [] as number[] }
    /*
     * ⚠ ★분포도 «잣대»(`sc`)로 만든다★ — 통합 분포(`uni`)가 이미 그렇게 한다.
     *
     *   여기만 ★적는 값(`v`)★ 으로 만들고 있었다. 두 축이 같은 값이던 동안에는
     *   티가 안 났는데, 2026-09-16 저녁에 ④ 가 «게임템포» 가 되면서 잣대만 부호를
     *   뒤집게 됐다 — 분포는 +50 인데 찾는 값은 -50 이라 ★전원이 0%★ 가 된다.
     */
    for (const { p, sc, wr } of values) {
      if (sc.duel !== null) dist.duel.push(sc.duel)
      if (sc.chance !== null) dist.chance.push(sc.chance)
      if (sc.safe !== null) dist.safe.push(sc.safe)
      if (sc.gap !== null) dist.gap.push(sc.gap)
      if (wr !== null) dist.winRate.push(wr)
      if (p.kdRate !== null && p.kdRate !== undefined) dist.kd.push(p.kdRate)
    }
    dist.duel.sort((a, b) => a - b)
    dist.chance.sort((a, b) => a - b)
    dist.safe.sort((a, b) => a - b)
    dist.gap.sort((a, b) => a - b)
    dist.winRate.sort((a, b) => a - b)
    dist.kd.sort((a, b) => a - b)

    const rows: PlayerHexResult[] = values.map(({ p, v, sc, wr }) => {
      const axes = {} as Record<HexAxisKey, AxisResult>
      let num = 0
      let den = 0
      for (const key of HEX_AXIS_KEYS) {
        /* ★싸움만 무기 안에서, 나머지는 통합★ (2026-09-12 사장님).
           자리는 ★잣대★ 가 정하고, 적는 값은 원값 그대로다 (2026-09-15) */
        /* 무기별 축은 그 무기 분포로, 나머지는 통합 분포로 (2026-09-16) */
        /* 무기별 축은 그 무기 분포로, 나머지는 통합 분포로 (2026-09-16) */
        const scoped =
          key === 'duel'
            ? dist.duel
            : key === 'chance'
              ? dist.chance
              : key === 'safe'
                ? dist.safe
                : key === 'gap'
                  ? dist.gap
                  : null
        const pct = percentileOf(scoped ?? uni[key], sc[key])
        axes[key] = { value: v[key], pct, rank: null, total: null }
        if (pct !== null) {
          num += pct * AXIS_WEIGHT[key]
          den += AXIS_WEIGHT[key]
        }
      }
      const wrPct = percentileOf(dist.winRate, wr)
      /* ★킬뎃 백분위★ — 같은 무기끼리 견준다 (2026-09-12 사장님) */
      const kdPct = percentileOf(dist.kd, p.kdRate ?? null)
      const hex = den > 0 ? round1(num / den) : null
      const tierFactor = tierFactorOf(p.tierGames)
      const shrink = Math.round((p.rounds / (p.rounds + HEX_SHRINK_K)) * 1000) / 1000
      /* ★소속 클랜의 티어가 아니라 「내 구간」★ (2026-09-11 사장님) */
      const homeTier = homeTierOf(p.tierGames) ?? p.clanTier
      const clanBonus = homeTier === null ? 0 : HEX_CLAN_BONUS[homeTier]
      let score: number | null = null
      if (hex !== null) {
        const perf = (hex - 50) / 50
        const wperf = wrPct === null ? perf : (wrPct - 50) / 50
        const kperf = kdPct === null ? perf : (kdPct - 50) / 50
        const mixed = HEX_W_HEX * perf + HEX_W_WR * wperf + HEX_W_KD * kperf
        score = Math.round(HEX_BASE + HEX_SPREAD * mixed * tierFactor * shrink + clanBonus)
      }
      return {
        leaguePlayerId: p.leaguePlayerId,
        weapon,
        weaponGames: weapon === 1 ? p.sniperGames : p.rifleGames,
        axes,
        winRate: { value: wr === null ? null : round1(wr), pct: wrPct, rank: null, total: null },
        hex,
        tierFactor,
        shrink,
        clanBonus,
        score,
        scoreRank: null,
        scoreTotal: null,
        duelWon: weapon === 1 ? p.sniperDuelWon : p.rifleDuelWon,
        duelLost: weapon === 1 ? p.sniperDuelLost : p.rifleDuelLost,
      }
    })

    /* 무기 안에서 매기는 등수 — 점수 · 승률 · ★무기별 축 전부★ */
    rankBy(rows, (r) => r.score, (r, rank, total) => { r.scoreRank = rank; r.scoreTotal = total })
    rankBy(rows, (r) => r.winRate.pct, (r, rank, total) => { r.winRate.rank = rank; r.winRate.total = total })
    /*
     * ⚠ ★여기가 «싸움» 하나만 매기고 있었다★ (2026-09-16 저녁에 찾음).
     *
     *   그 사이 무기별 축이 셋으로 늘었다 — 싸움 · 게임템포 · 크랙 성공
     *   (사장님: «이건 스나수는 스나수끼리비교하고 라플수는 라플수끼리 비교해»).
     *   백분위는 무기별로 냈는데 ★등수만 아무도 안 매겼다★ — 두 축이 통째로 `null`
     *   이라 화면이 «측정중» 으로 보였다. 목록을 돌면 축이 늘어도 안 빠진다.
     */
    for (const key of HEX_WEAPON_SCOPED_AXIS_KEYS) {
      rankBy(rows, (r) => r.axes[key].pct, (r, rank, total) => { r.axes[key].rank = rank; r.axes[key].total = total })
    }
    measured.push(...rows)
  }

  /* ── ③ 다섯 축 등수는 ★스나·라플을 섞어서★ 매긴다 ── */
  for (const key of HEX_UNIFIED_AXIS_KEYS) {
    rankBy(measured, (r) => r.axes[key].pct, (r, rank, total) => { r.axes[key].rank = rank; r.axes[key].total = total })
  }
  out.push(...measured)

  /* ── ④ 주무기가 없는 사람 — 못 잰 채로 돌려준다 ── */
  for (const p of players) {
    if (mainWeaponOf(p) !== null) continue
    const empty = (): AxisResult => ({ value: null, pct: null, rank: null, total: null })
    out.push({
      leaguePlayerId: p.leaguePlayerId,
      weapon: null,
      weaponGames: Math.max(p.sniperGames, p.rifleGames),
      axes: { save: empty(), duel: empty(), chance: empty(), safe: empty(), gap: empty(), outnumbered: empty() },
      winRate: { value: (() => { const v = winRateOf(p); return v === null ? null : round1(v) })(), pct: null, rank: null, total: null },
      hex: null,
      tierFactor: tierFactorOf(p.tierGames),
      shrink: Math.round((p.rounds / (p.rounds + HEX_SHRINK_K)) * 1000) / 1000,
      clanBonus: (() => { const h = homeTierOf(p.tierGames) ?? p.clanTier; return h === null ? 0 : HEX_CLAN_BONUS[h] })(),
      score: null,
      scoreRank: null,
      scoreTotal: null,
      duelWon: 0,
      duelLost: 0,
    })
  }
  return out
}

/**
 * ★옛 판★ (2026-09-10 ~ 2026-09-12) — 여섯 축을 ★전부★ 무기별 모집단으로 견줬다.
 * 지우지 않는다 (`CLAUDE.md` 1-4). 되돌리려면 `foldPlayerHex` 자리에 이것을 부르면 된다.
 *
 * 한 리그의 선수들을 받아 무기별 모집단으로 나눠 백분위·등수·점수를 낸다.
 * 주무기가 없는 사람도 돌려준다 — `weapon: null` · 등수 null. 화면이 「측정 중」을 그린다.
 */
export function foldPlayerHexV1(players: readonly PlayerHexInput[]): PlayerHexResult[] {
  const out: PlayerHexResult[] = []
  for (const weapon of [0, 1] as const) {
    const pool = players.filter((p) => mainWeaponOf(p) === weapon)
    const values = pool.map((p) => ({ p, v: axisValuesOf(p, weapon), wr: p.games > 0 ? (p.wins / p.games) * 100 : null }))
    const dist: Record<HexAxisKey | 'winRate' | 'kd', number[]> = {
      save: [], duel: [], chance: [], safe: [], gap: [], outnumbered: [], winRate: [], kd: [],
    }
    for (const { p, v, wr } of values) {
      for (const key of HEX_AXIS_KEYS) if (v[key] !== null) dist[key].push(v[key] as number)
      if (wr !== null) dist.winRate.push(wr)
      if (p.kdRate !== null && p.kdRate !== undefined) dist.kd.push(p.kdRate)
    }
    for (const key of Object.keys(dist) as (keyof typeof dist)[]) dist[key].sort((a, b) => a - b)

    const rows: PlayerHexResult[] = values.map(({ p, v, wr }) => {
      const axes = {} as Record<HexAxisKey, AxisResult>
      let num = 0
      let den = 0
      for (const key of HEX_AXIS_KEYS) {
        const pct = percentileOf(dist[key], v[key])
        axes[key] = { value: v[key], pct, rank: null, total: null }
        if (pct !== null) {
          num += pct * AXIS_WEIGHT[key]
          den += AXIS_WEIGHT[key]
        }
      }
      const wrPct = percentileOf(dist.winRate, wr)
      /* ★킬뎃 백분위★ — 같은 무기끼리 견준다 (2026-09-12 사장님) */
      const kdPct = percentileOf(dist.kd, p.kdRate ?? null)
      const hex = den > 0 ? round1(num / den) : null
      const tierFactor = tierFactorOf(p.tierGames)
      const shrink = Math.round((p.rounds / (p.rounds + HEX_SHRINK_K)) * 1000) / 1000
      /* ★소속 클랜의 티어가 아니라 「내 구간」★ (2026-09-11 사장님). 소속만 높은 사람이 덤을 받지 않는다 */
      const homeTier = homeTierOf(p.tierGames) ?? p.clanTier
      const clanBonus = homeTier === null ? 0 : HEX_CLAN_BONUS[homeTier]
      let score: number | null = null
      if (hex !== null) {
        const perf = (hex - 50) / 50
        const wperf = wrPct === null ? perf : (wrPct - 50) / 50
        const kperf = kdPct === null ? perf : (kdPct - 50) / 50
        const mixed = HEX_W_HEX * perf + HEX_W_WR * wperf + HEX_W_KD * kperf
        score = Math.round(HEX_BASE + HEX_SPREAD * mixed * tierFactor * shrink + clanBonus)
      }
      return {
        leaguePlayerId: p.leaguePlayerId,
        weapon,
        weaponGames: weapon === 1 ? p.sniperGames : p.rifleGames,
        axes,
        winRate: { value: wr === null ? null : round1(wr), pct: wrPct, rank: null, total: null },
        hex,
        tierFactor,
        shrink,
        clanBonus,
        score,
        scoreRank: null,
        scoreTotal: null,
        duelWon: weapon === 1 ? p.sniperDuelWon : p.rifleDuelWon,
        duelLost: weapon === 1 ? p.sniperDuelLost : p.rifleDuelLost,
      }
    })

    /* 등수 — 점수 · 축마다 · 승률. 같은 값이면 같은 등수(공동)다 */
    rankBy(rows, (r) => r.score, (r, rank, total) => { r.scoreRank = rank; r.scoreTotal = total })
    for (const key of HEX_AXIS_KEYS) {
      rankBy(rows, (r) => r.axes[key].pct, (r, rank, total) => { r.axes[key].rank = rank; r.axes[key].total = total })
    }
    rankBy(rows, (r) => r.winRate.pct, (r, rank, total) => { r.winRate.rank = rank; r.winRate.total = total })
    out.push(...rows)
  }

  for (const p of players) {
    if (mainWeaponOf(p) !== null) continue
    const empty = (): AxisResult => ({ value: null, pct: null, rank: null, total: null })
    out.push({
      leaguePlayerId: p.leaguePlayerId,
      weapon: null,
      weaponGames: Math.max(p.sniperGames, p.rifleGames),
      axes: { save: empty(), duel: empty(), chance: empty(), safe: empty(), gap: empty(), outnumbered: empty() },
      winRate: { value: (() => { const v = winRateOf(p); return v === null ? null : round1(v) })(), pct: null, rank: null, total: null },
      hex: null,
      tierFactor: tierFactorOf(p.tierGames),
      shrink: Math.round((p.rounds / (p.rounds + HEX_SHRINK_K)) * 1000) / 1000,
      clanBonus: (() => { const h = homeTierOf(p.tierGames) ?? p.clanTier; return h === null ? 0 : HEX_CLAN_BONUS[h] })(),
      score: null,
      scoreRank: null,
      scoreTotal: null,
      duelWon: 0,
      duelLost: 0,
    })
  }
  return out
}

/** 내림차순 공동 등수. 값이 null 이면 등수도 null 이고 모집단에도 안 든다 */
function rankBy<T>(
  rows: T[],
  valueOf: (row: T) => number | null,
  assign: (row: T, rank: number, total: number) => void,
): void {
  const has = rows.filter((r) => valueOf(r) !== null)
  has.sort((a, b) => (valueOf(b) as number) - (valueOf(a) as number))
  let rank = 0
  let prev: number | null = null
  has.forEach((r, i) => {
    const v = valueOf(r) as number
    if (prev === null || v !== prev) rank = i + 1
    prev = v
    assign(r, rank, has.length)
  })
}

/**
 * ⚠ ★2026-09-17 까지 쓰던 ④⑤⑥ 의 셈★ — 지우지 않는다 (`CLAUDE.md` 1-4).
 *
 *   ④ 기회창출(스나) / 기회차단(라플)
 *   ⑤ 스나차이 / 라플차이
 *   ⑥ 안전함(스나) / 크랙(라플)
 *
 * 재료(`openRounds` · `cutRounds` · `foeOpenRounds` · `aliveRounds` · `gapWinGames`)는
 * ★그대로 쌓고 있다★. 되살리려면 `axisValuesOf` 의 세 칸을 이 값으로 바꾸면 된다.
 * 이름표는 `TRAIT_AXIS_LABEL_V3` 에 있다.
 */
/**
 * ⚠ ★2026-09-18 새벽까지 쓰던 셈★ — 구역을 «뚫은 비율» 로 재던 판 (`CLAUDE.md` 1-4).
 *
 *   그날 사장님이 「개인육각도 점수제로 줄세워서 다시 측정해」 라고 하셔서
 *   네 축(어택성공률·방어율·크랙·소수싸움)이 ★점수★ 로 바뀌었다.
 *   재료(`aAtkOk` · `bDefN` · `crackKills` …)는 ★그대로 쌓고 있으므로★
 *   되돌릴 때 재수집이 필요 없다.
 */
export function axisValuesV4Of(
  input: PlayerHexInput,
  weapon: 0 | 1,
): Record<HexAxisKey, number | null> {
  const duelWon = weapon === 1 ? input.sniperDuelWon : input.rifleDuelWon
  const duelLost = weapon === 1 ? input.sniperDuelLost : input.rifleDuelLost
  const duels = duelWon + duelLost
  return {
    save: input.aloneRounds >= MIN_SITUATION_ROUNDS ? round1((input.aloneWon / input.aloneRounds) * 100) : null,
    duel: duels >= MIN_DUELS ? round1((duelWon / duels) * 100) : null,
    chance:
      weapon === 1
        ? sideRate(input.aAtkOk, input.aAtkN)
        : sideRate(
            sumSide(input, ['bAtkOk', 'f2AtkOk', 'shortAtkOk']),
            sumSide(input, ['bAtkN', 'f2AtkN', 'shortAtkN']),
          ),
    safe:
      weapon === 1
        ? sideRate(input.aDefOk, input.aDefN)
        : (input.games > 0 && input.crackKills !== undefined
            ? round1((input.crackKills / input.games) * 100)
            : null),
    gap:
      weapon === 1
        ? sideRate(input.bAtkOk, input.bAtkN)
        : sideRate(
            sumSide(input, ['bDefOk', 'f2DefOk', 'shortDefOk']),
            sumSide(input, ['bDefN', 'f2DefN', 'shortDefN']),
          ),
    outnumbered: input.outRounds >= MIN_SITUATION_ROUNDS ? round1((input.outWon / input.outRounds) * 100) : null,
  }
}

export function axisValuesV3Of(
  input: PlayerHexInput,
  weapon: 0 | 1 | null,
): { chance: number | null; safe: number | null; gap: number | null } {
  return {
    /** ⚠ 옛 ④ — 되살리려면 위 `chance` 를 이걸로 바꾸면 된다 */
    chance:
      weapon === 1
        ? (input.rounds > 0 && input.openRounds !== undefined
            ? round1((input.openRounds / input.rounds) * 100)
            : null)
        : ((input.foeOpenRounds ?? 0) > 0
            ? round1(((input.cutRounds ?? 0) / (input.foeOpenRounds as number)) * 100)
            : null),
    /** ⚠ 옛 ⑥ 스나 «안전함» — 그 라운드를 끝까지 산 비율 */
    safe:
      weapon === 1
        ? (input.rounds > 0 && input.aliveRounds !== undefined
            ? round1((input.aliveRounds / input.rounds) * 100)
            : null)
        : (input.games > 0 && input.crackKills !== undefined
            ? round1((input.crackKills / input.games) * 100)
            : null),
    /** ⚠ 옛 ⑤ «스나차이 / 라플차이» — 우리 무기 쪽이 앞선 판의 비율 */
    gap:
      input.games > 0 && input.gapWinGames !== undefined
        /* ⚠ ★100% 를 모통 넘지 않게 막는다★ — 분모가 어긋나면 137% 같은 값이 나왔다 */
        ? round1(Math.min(100, (input.gapWinGames / input.games) * 100))
        : null,
  }
}
