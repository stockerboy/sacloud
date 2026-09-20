/**
 * ★선수 육각형 · 실력 점수 집계★ — `player-hex-build` (2026-09-10 · 사장님 확정)
 *
 * 두 단계다.
 *
 *   1. 재료 — 시즌 0 경기마다 배틀로그를 읽어 선수별 원시 횟수를 `MatchPlayerHex` 에 쌓는다.
 *      선짤 · 연속킬 · 세이브(혼자 남음) · 소수싸움(수 밀림) · 싸움(스나는 롱 안 스나 대 스나,
 *      라플은 라플 대 라플). 한 경기 배틀로그는 클랜마다 하나씩 두 벌이라 **둘 다 읽고
 *      (경기·라운드·시각·잡은이·죽은이) 로 겹침을 뺀다.** 라운드 승자는 `win_flag` 다 —
 *      `win_team_no` 는 빈 문자열이다 (2026-09-10 실측).
 *   2. 접기 — 리그마다 선수 한 명에 한 줄로 `LeaguePlayerHex` 를 쓴다. 백분위·등수·점수는
 *      `lib/playerHexScore.ts` 가 낸다. 화면은 이 줄만 읽는다.
 *
 * 대상 리그는 `HEX_LEAGUE_SLUGS` 가 정한다 — 지금은 ★세 리그 전부★ 다 (2026-09-13 사장님).
 * ⚠ 옛 서술: «IPL 과 SPL 이다. 열산은 육각형을 주지 않는다 — 2026-09-10 사장님».
 *   그 판단이 2026-09-13 에 뒤집혔다 («세 리그 전부 공평하게 대한다»).
 *
 * `--rebuild` 가 없으면 이미 같은 `formulaVersion` 으로 만든 경기는 건너뛴다 (재개 가능).
 * 접기(2단계)는 매번 통째로 다시 한다 — 등수는 모집단 전체를 봐야 한다.
 *
 * 스크래치 실측 스크립트(`axes.mjs` · `rounds2.mjs` · `rifleduel.mjs` · `snipe5.mjs` ·
 * `score3.mjs`, 2026-09-10)를 그대로 옮긴 것이다. 규칙을 바꾸지 않았다.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { prisma, Prisma } from '@sacloud/db'
import { killScore, saveScore, bombScore } from '@sacloud/nexon'
import {
  A_LONG_ZONE_LABELS,
  B_LONG_ZONE_LABEL,
  inZone,
  zoneCellsOfLabels,
  type LabeledZoneFile,
  type ZoneCells,
  /* ★라운드 시작 시각★ — 선짤의 25초 창을 재려면 필요하다 (2026-09-15).
     게임템포와 ★같은 상수★ 를 쓴다. 두 곳이 어긋나면 안 된다 */
  MATCH_TO_FIRST_ROUND_SECONDS,
  ROUND_GAP_SECONDS,
  /* ★구역별 어택/방어★ — 규칙은 저쪽 하나뿐이다 (2026-09-17 사장님) */
  A_ZONE_LABELS,
  B_ZONE_LABELS,
  F2_ZONE_LABELS,
  SHORT_KILL_ZONE_LABELS,
  SHORT_ZONE_LABELS,
  judgeExchange,
  judgeShort,
  zoneCellsOfAnyLabels,
  type AnyZoneFile,
  type SideKill,
  /* 진영 — 폭탄이 정한다. 없으면 그 라운드는 판정하지 않는다 */
  roundSidesOf,
  type RoundSideEvent,
  /* C4 가 없는 반은 사장님 규칙으로 채운다 */
  defenceByHomeRule,
  HOME_FLOOR_LABELS,
  HOME_SNIPE_LABELS,
  type HomeRuleKill,
  /* 자리 — 시즌 합으로 한 번만 정한다 */
  positionOf,
  /*
   * ★선짤 점수★ (2026-09-20 사장님) — ★값은 저쪽 하나가 정한다.★
   * 여기서 점수표를 다시 적지 않는다 (`matchScore.ts` 를 쓰는 킬 점수와 같은 규칙).
   */
  OPENING_PENALTY_WINDOW_SECONDS,
  OPENING_REVENGE_SECONDS,
  OPENING_SURVIVE_SECONDS,
  FULL_TEAM_SIZE as OPENING_TEAM_SIZE,
  RED_OPENING_KILL_POINT,
  RED_OPENING_DEATH_POINT,
  BLUE_SNIPER_KILL_POINT,
  BLUE_SNIPER_DEATH_POINT,
  BLUE_RIFLE_DEATH_POINT,
} from '@sacloud/nexon'
import { CLAN_HEX_V2_FORMULA_VERSION } from '../lib/clanHexV2Version.js'
import { REPO_ROOT } from '../lib/env.js'
import { log, warn } from '../lib/log.js'
import { SEASON0_FROM } from '../lib/season0Window.js'
import { scoresOpening } from '../lib/openingScoreWindow.js'
import type { TierNo } from '../lib/iplTiers.js'
import { MIN_MEMBERS, SHORT_MEMBER_WEIGHT } from '../lib/iplTiers.js'
import {
  BURST_GAP_SECONDS,
  foldPlayerHex,
  PLAYER_HEX_FORMULA_VERSION,
  type PlayerHexInput,
  homeTierOf,
  mainWeaponOf,
  MIN_HOME_TIER_GAMES,
} from '../lib/playerHexScore.js'

export { PLAYER_HEX_FORMULA_VERSION }

/**
 * 육각형·개인 점수를 만드는 리그.
 *
 * ⚠ ★2026-09-13 — 열산을 넣었다★ (사장님: «열산도 그냥 랭킹 제대로 만들어주고
 *   플레이어 분석이랑 경기분석 그런 시스템 다 넣어줘 (…) 세 리그 전부 공평하게 대한다»).
 *   옛 값은 `['nolink', 'supply']` 였고, 그때 근거는 2026-09-10 «열산은 클랜도 개인도
 *   육각형 제공x» 였다. 사장님이 뒤집으셨다.
 */
export const HEX_LEAGUE_SLUGS = ['nolink', 'supply', 'sanply'] as const

const ZONE_FILE = join(REPO_ROOT, 'data/barracks/style-zones.json')
/**
 * ★크랙 구역★ — 2026-09-16 19:03 에 사장님이 아티팩트로 직접 칠하신 116칸.
 *
 * > «내가 어디서 1분55초 내에 잡으면 크랙인지 표시해주면 그것만 샐 수 있어?»
 *
 * 겹치는 이름난 구역: 비롱 32 · 홀정면 31 · 벙커 27(전부) · 달방 15(전부) · ㄱ자 11.
 * ★한 칸도 구역 밖으로 안 나갔다★ — 격자가 맵과 맞다는 확인이기도 하다.
 */
const CRACK_ZONE_FILE = join(REPO_ROOT, 'data/barracks/crack-zone.json')
/**
 * ★사장님이 손으로 칠하신 바닥 구역★ — 2026-09-17. 한 칸이 여러 구역일 수 있어 값이 배열이다
 * (숏·쓰리깡·설대앞은 넓은 구역 위에 겹쳐 그은 좁은 자리다).
 * `style-zones.json` 과 합쳐야 A·B·2층·숏 넷이 다 나온다.
 */
const FLOOR_ZONE_FILE = join(REPO_ROOT, 'data/barracks/floor-zones.json')
/** 배틀로그를 한 번에 읽는 경기 수 — 운영 풀러의 문장 시간제한 안에 든다 (실측 150) */
const LOG_BATCH = 150

export interface PlayerHexBuildOptions {
  confirm: boolean
  rebuild: boolean
  /** 특정 리그만 (slug). 없으면 `HEX_LEAGUE_SLUGS` 전부 */
  leagueSlug: string | null
}

export interface PlayerHexBuildResult {
  leagues: string[]
  matches: number
  matchesSkipped: number
  events: number
  matchRows: number
  playerRows: number
  /** 규칙으로 MVP 를 정한 경기 수 (원본에 MVP 가 없던 경기) */
  mvpAssigned: number
  /** 리그별 · 무기별 모집단 크기 */
  pools: Record<string, { sniper: number; rifle: number; unmeasured: number }>
  zones: { file: string | null; aLong: number; bLong: number }
}

interface RawEvent {
  k: string
  et: string
  rd: string | null
  tm: string | null
  su: string | null
  tu: string | null
  tn: string | null
  ttn: string | null
  wf: string | null
  gun: string | null
  kx: number | null
  ky: number | null
  dx: number | null
  dy: number | null
}

interface Kill {
  k: string
  rd: string
  t: number
  killer: string
  victim: string
  kt: string | null
  vt: string | null
  wf: string | null
  own: string | null
  /** 잡은 쪽 무기 — kill 줄의 `weapon`, death 줄의 `target_weapon` */
  gun: string | null
  kx: number | null
  ky: number | null
  dx: number | null
  dy: number | null
}

interface Who {
  pid: string
  weapon: number | null
}

interface MatchTally {
  rounds: number
  kills: number
  /**
   * ★그 경기에서 번 점수★ (2026-09-18 사장님) — ★MVP 를 이걸로 정한다.★
   *
   * > «이제 엠브이피도 이 점수 젤 높은애로 주고»
   *
   * 값은 `packages/nexon/src/matchScore.ts` 하나가 정한다.
   * ⚠ 옛 MVP 규칙(세이브→킬→데스)은 `pickMvpV1` 에 남긴다 (`CLAUDE.md` 1-4).
   */
  score: number
  /* ── ★개인 육각도 점수제★ (2026-09-18 사장님) ── */
  /** 공격(레드진영) 라운드에서 딴 점수 */
  atkScore: number
  atkRounds: number
  /** 수비(블루진영) 라운드에서 딴 점수 */
  defScore: number
  defRounds: number
  /** ★크랙★ — 칠한 구역 안에서 25초 안에 딴 점수 */
  crackScore: number
  /** ★소수싸움·세이브★ — 수적 열세를 뒤집어 딴 점수 (2n−1 의 합) */
  fewScore: number
  /**
   * ★MVP 가 MVP 인 이유★ — 라운드마다 무엇으로 몇 점 (2026-09-18 사장님).
   * ⚠ ★1점짜리 라플킬은 안 담는다★ — 줄만 길어지고 뜻이 없다.
   */
  scoreLog: { r: number; k: string; p: number }[]
  /**
   * ★선짤로 번(잃은) 점수★ (2026-09-20 사장님). `score` 에 이미 들어 있고,
   * 이 칸은 ★얼마가 선짤 몫인지★ 를 따로 들고 있다 — 화면의 「점수판」 이 쓴다.
   */
  openingScore: number
  /** 선짤당했지만 ★팀이 3초 안에 되잡아 면제★ 된 횟수 (설명용 · 점수는 0) */
  openingRevenged: number
  firstKills: number
  /** ★크랙 성공★ — 위 첫 킬 중 ★칠한 구역 안★ 에서 잡은 것만 (2026-09-16 사장님) */
  crackKills: number
  burstRounds: number
  /** ★한 라운드에 몰아친 최대 킬★ 과 그 최고를 낸 라운드 수 (2026-09-15 사장님) */
  maxRoundKills: number
  maxRoundTimes: number
  /** ★우위를 만든 킬★ — 딴 그 순간 우리가 상대보다 많지 않았던 킬 (2026-09-15 사장님) */
  evenKills: number
  /** ★교환★ — 동료가 죽은 직후 그 킬러를 되잡은 횟수 · 그 분모(동료 죽음) */
  tradeKills: number
  mateDeaths: number
  /** ★평균 사망 시간★ — 라운드 시작부터 죽기까지의 초, 합 (2026-09-16 사장님) */
  deathSeconds: number
  /** 위 합에 들어간 죽음의 수 */
  deathCount: number
  /**
   * ★게임템포★ — 라운드마다 «내가 먼저 겪은 일» 까지 걸린 초, 합 (2026-09-16 사장님).
   *
   * > «죽거나 잡은(라운드마다의 첫 킬) 시간을 평균내서 그걸 게임템포 축으로 만든다
   * >  빨리 잡거나 죽을수록 게임템포가 빠른거야»
   */
  tempoSeconds: number
  /** 위 합에 들어간 라운드 수 */
  tempoCount: number
  /**
   * ★기회창출★ — 그 라운드 «첫 킬» 을 낸 라운드 수 (2026-09-16 밤 사장님).
   * 스나 육각 ②가 쓴다 — «판을 여는 힘».
   */
  openRounds: number
  /** ★기회차단★ 의 분모 — 상대가 그 라운드 첫 킬을 낸 라운드 수 */
  foeOpenRounds: number
  /**
   * ★기회차단★ 의 분자 — 그중 «다음 킬» 을 내가 낸 수. 라플 육각 ②가 쓴다.
   * 실측 — 끊으면 그 라운드 승률 49.7%, 못 끊으면 ★40.8%★.
   */
  cutRounds: number
  /**
   * ★안전함★ — 그 라운드를 «끝까지 산» 수. 스나 육각 ⑥이 쓴다.
   * ⚠ ★몇 초에 죽었나로 나누면 안 된다★ — 늦게 죽은 건 잘한 게 아니라 혼자 남아 버틴 것이었다
   *   (실측: 100초 넘겨 죽은 라운드는 그 순간 0.5 대 2.0 이었다).
   *   살았나 죽었나만 승률을 62.0% 대 43.5% 로 가른다.
   */
  aliveRounds: number
  aloneRounds: number
  aloneWon: number
  outRounds: number
  outWon: number
  duelWon: number
  duelLost: number

  /**
   * ★구역별 어택/방어★ (2026-09-17 사장님) — 한 칸 = (낀 라운드 × 한 구역).
   * `N` 은 그 구역에서 ★킬이나 데스를 낸★ 라운드 수, `Ok` 는 어택이면 뚫은 · 방어면 막은 수.
   * 판정은 `sideAxes.ts` 가 한다 — 여기서 셈을 다시 적지 않는다.
   */
  aAtkN: number; aAtkOk: number; aDefN: number; aDefOk: number
  bAtkN: number; bAtkOk: number; bDefN: number; bDefOk: number
  f2AtkN: number; f2AtkOk: number; f2DefN: number; f2DefOk: number
  shortAtkN: number; shortAtkOk: number; shortDefN: number; shortDefOk: number

  /** ★자리 재료★ — 그 선수 ★자기★ 자리 (킬이면 잡은 자리 · 데스면 죽은 자리) */
  seatSpots: number
  seatBSpots: number
  seatF2Spots: number
  seatShortSpots: number
  /** 스나로 잡은 킬 — 자리 판정의 스나 문턱에 쓴다 */
  sniperKills: number
}

const emptyTally = (): MatchTally => ({
  rounds: 0, kills: 0, score: 0, firstKills: 0,
  atkScore: 0, atkRounds: 0, defScore: 0, defRounds: 0, crackScore: 0, fewScore: 0, scoreLog: [], openingScore: 0, openingRevenged: 0, crackKills: 0, burstRounds: 0, maxRoundKills: 0, maxRoundTimes: 0, evenKills: 0, tradeKills: 0, mateDeaths: 0,
  deathSeconds: 0, deathCount: 0, tempoSeconds: 0, tempoCount: 0,
  openRounds: 0, foeOpenRounds: 0, cutRounds: 0, aliveRounds: 0,
  aloneRounds: 0, aloneWon: 0, outRounds: 0, outWon: 0, duelWon: 0, duelLost: 0,
  aAtkN: 0, aAtkOk: 0, aDefN: 0, aDefOk: 0,
  bAtkN: 0, bAtkOk: 0, bDefN: 0, bDefOk: 0,
  f2AtkN: 0, f2AtkOk: 0, f2DefN: 0, f2DefOk: 0,
  shortAtkN: 0, shortAtkOk: 0, shortDefN: 0, shortDefOk: 0,
  seatSpots: 0, seatBSpots: 0, seatF2Spots: 0, seatShortSpots: 0, sniperKills: 0,
})

/** 좌표 → 점. ★(0,0) 은 «없음» 이다★ — 맵 구석이 아니라 결측이다 */
const ptOf = (x: number | null, y: number | null): { x: number; y: number } | null =>
  x == null || y == null || (x === 0 && y === 0) ? null : { x, y }

/**
 * ★자리 재료★ — 그 선수 ★자기★ 자리 한 건을 쌓는다.
 * 한 칸이 여러 구역일 수 있어 ★겹치면 둘 다 센다★ (숏은 홀정면 위에 겹쳐 그은 자리다).
 * 어느 구역도 아니면 분모(`seatSpots`)만 올라간다 — 그 사람이 거기 있었던 건 사실이니까.
 */
const addSeat = (
  t: MatchTally,
  p: { x: number; y: number } | null,
  z: { b: ZoneCells | null; f2: ZoneCells | null; shortSeat: ZoneCells | null },
): void => {
  if (p === null) return
  t.seatSpots += 1
  if (z.b && inZone(z.b, p)) t.seatBSpots += 1
  if (z.f2 && inZone(z.f2, p)) t.seatF2Spots += 1
  if (z.shortSeat && inZone(z.shortSeat, p)) t.seatShortSpots += 1
}

/**
 * ★그 선수의 자리★ — 시즌 합으로 한 번만 정한다 (`sideAxes.ts` 의 `positionOf`).
 * 셈을 여기서 다시 적지 않는다. 못 정하면 두 칸 다 `null` 이다 — 지어내지 않는다.
 */
const seatOf = (
  p: { games: number; kills: number },
  h: { seatspots?: unknown; seatbspots?: unknown; seatf2spots?: unknown; seatshortspots?: unknown; sniperkills?: unknown } | undefined,
): { seat: string | null; seatRatio: number | null } => {
  const n = (v: unknown): number => Number(v ?? 0)
  const v = positionOf({
    games: p.games,
    /*
     * ⚠ ★여기에 0 을 넣으면 스나가 한 명도 안 나온다★ (2026-09-17 에 실제로 그랬다).
     *   스나 문턱은 «자기 킬의 절반 이상이 스나» 인데 분모가 0 이면 비중이 언제나 0 이다.
     *   첫 재계산에서 자리 722명 중 ★스나 0명★ 이 나와서 찾았다.
     */
    kills: p.kills,
    sniperKills: n(h?.sniperkills),
    bSpots: n(h?.seatbspots),
    f2Spots: n(h?.seatf2spots),
    shortSpots: n(h?.seatshortspots),
    spots: n(h?.seatspots),
  })
  return { seat: v.key, seatRatio: v.ratio }
}

const secondsOf = (t: string | null): number => {
  const [m, s] = String(t ?? '0:0').split(':')
  return Number(m) * 60 + Number(s)
}

/**
 * 크랙 구역을 읽는다. ★파일이 없으면 null★ — 구역을 모르면서 크랙이라 적지 않는다.
 * 그때는 `crackKills` 가 0으로 남고, 옛 셈 `firstKills` 는 그대로 쌓인다.
 */
function loadCrackZone(): ZoneCells | null {
  if (!existsSync(CRACK_ZONE_FILE)) return null
  const parsed = JSON.parse(readFileSync(CRACK_ZONE_FILE, 'utf8')) as ZoneCells
  return parsed.cells.length > 0 ? { cell: parsed.cell, cells: parsed.cells } : null
}

/**
 * ★구역 넷★ — 사장님 규칙(`sideAxes.ts`)이 쓰는 칸 집합.
 * 파일이 없으면 전부 `null` 이고, 그러면 그 축은 ★안 쌓인다★ (0 으로 남는다).
 * 구역을 모르면서 «뚫렸다» 고 적지 않는다.
 */
function loadSideZones(): {
  a: ZoneCells | null; b: ZoneCells | null; f2: ZoneCells | null
  shortKill: ZoneCells | null; shortSeat: ZoneCells | null
  homeFloor: ZoneCells | null; homeSnipe: ZoneCells | null
} {
  const files: AnyZoneFile[] = []
  for (const path of [ZONE_FILE, FLOOR_ZONE_FILE]) {
    if (!existsSync(path)) continue
    files.push(JSON.parse(readFileSync(path, 'utf8')) as AnyZoneFile)
  }
  if (files.length === 0) {
    return { a: null, b: null, f2: null, shortKill: null, shortSeat: null, homeFloor: null, homeSnipe: null }
  }
  return {
    a: zoneCellsOfAnyLabels(files, A_ZONE_LABELS),
    b: zoneCellsOfAnyLabels(files, B_ZONE_LABELS),
    f2: zoneCellsOfAnyLabels(files, F2_ZONE_LABELS),
    /* 숏은 ★어택 판정★ 과 ★자리 판정★ 이 다른 구역을 쓴다 (`sideAxes.ts` 주석) */
    shortKill: zoneCellsOfAnyLabels(files, SHORT_KILL_ZONE_LABELS),
    shortSeat: zoneCellsOfAnyLabels(files, SHORT_ZONE_LABELS),
    /* ★C4 가 없는 반★ 을 채우는 근거 — 바닥·벙커(라플의 집) · 머리·녹뒤·컨뒤(스나의 집) */
    homeFloor: zoneCellsOfAnyLabels(files, HOME_FLOOR_LABELS),
    homeSnipe: zoneCellsOfAnyLabels(files, HOME_SNIPE_LABELS),
  }
}

function loadLongZones(): { file: string | null; aLong: ZoneCells | null; bLong: ZoneCells | null } {
  if (!existsSync(ZONE_FILE)) return { file: null, aLong: null, bLong: null }
  const parsed = JSON.parse(readFileSync(ZONE_FILE, 'utf8')) as LabeledZoneFile
  const aLong = zoneCellsOfLabels(parsed, A_LONG_ZONE_LABELS)
  const bLong = zoneCellsOfLabels(parsed, [B_LONG_ZONE_LABEL])
  return {
    file: ZONE_FILE,
    aLong: aLong.cells.length > 0 ? aLong : null,
    bLong: bLong.cells.length > 0 ? bLong : null,
  }
}

/**
 * ★한 라운드 몇 킬부터 «굵직한 장면» 인가★ (2026-09-20).
 *
 * 둘은 흔하다 — 라운드 6,975개에서 늘 나온다. ★셋★ 부터가 판을 뒤집은 장면이다.
 * ⚠ 이 값을 낮추면 MVP 설명이 ★평범한 킬로 도배된다.★ 사장님이 싫어하시는 그 모양이다.
 */
const MVP_WHY_MULTI_KILLS = 3

export async function buildPlayerHex(options: PlayerHexBuildOptions): Promise<PlayerHexBuildResult> {
  /*
   * ★★이 잡이 2분 벽에 걸려 죽고 있었다★★ (2026-09-20 실측)
   *
   *   마지막 「접기」 단계의 차이 질의(`gapRows`)가 한가할 때도 ★nolink 43초★ 다.
   *   거기에 다른 배치가 겹치면 ★120초★ 를 넘겨 `57014` 로 잘렸고,
   *   어제 하루 144회 중 ★15회★ 가 그렇게 실패했다.
   *   ⚠ 실패해도 ★경기별 육각과 MVP 는 앞 루프에서 이미 저장된다★ —
   *     못 갱신되는 것은 ★선수별 종합 육각★ 이다. 그래서 눈에 안 띄고 오래 갔다.
   *
   * ★이 연결에만 5분을 준다.★ 사이트가 쓰는 연결과는 무관하다.
   * ⚠ 진짜 해결은 `gapRows` 를 가볍게 하는 것이다 — `docs/ORDERS.md` 에 남긴다.
   */
  await prisma.$executeRawUnsafe('SET statement_timeout = 300000')

  const slugs = options.leagueSlug ? [options.leagueSlug] : [...HEX_LEAGUE_SLUGS]
  const leagues = await prisma.league.findMany({
    where: { slug: { in: slugs } },
    select: { id: true, slug: true, divisionCount: true },
  })
  if (leagues.length === 0) throw new Error(`리그를 못 찾았다: ${slugs.join(', ')}`)

  const zones = loadLongZones()
  const longZones = [zones.aLong, zones.bLong].filter((z): z is ZoneCells => !!z)
  if (longZones.length === 0) warn('구역 파일이 없다 — 스나싸움을 못 잰다 (null 로 남는다)')
  const inLong = (x: number | null, y: number | null): boolean =>
    x !== null && y !== null && longZones.some((zone) => inZone(zone, { x, y }))

  /**
   * ★구역 넷★ — A · B · 2층 · 숏 (2026-09-17 사장님).
   * 없으면 그 축이 0 으로 남는다 — 구역을 모르면서 «뚫렸다» 고 적지 않는다.
   */
  const sideZones = loadSideZones()
  if (sideZones.b === null) warn('구역 파일이 없다 — 어택/방어를 못 잰다 (0 으로 남는다)')
  else log(`구역 — A ${sideZones.a?.cells.length ?? 0}칸 · B ${sideZones.b.cells.length}칸 · `
    + `2층 ${sideZones.f2?.cells.length ?? 0}칸 · 숏(어택) ${sideZones.shortKill?.cells.length ?? 0}칸 · `
    + `숏(자리) ${sideZones.shortSeat?.cells.length ?? 0}칸`)

  /* ★크랙 구역★ — 사장님이 칠하신 칸. 없으면 `crackKills` 가 0으로 남는다 (2026-09-16) */
  const crackZone = loadCrackZone()
  if (crackZone === null) warn('크랙 구역 파일이 없다 — 크랙 성공을 못 잰다 (0 으로 남는다)')
  else log(`크랙 구역 ${crackZone.cells.length}칸 · 칸 크기 ${crackZone.cell}`)

  const result: PlayerHexBuildResult = {
    leagues: leagues.map((l) => l.slug),
    matches: 0,
    matchesSkipped: 0,
    events: 0,
    matchRows: 0,
    playerRows: 0,
    mvpAssigned: 0,
    pools: {},
    zones: { file: zones.file, aLong: zones.aLong?.cells.length ?? 0, bLong: zones.bLong?.cells.length ?? 0 },
  }

  /* ── 1. 재료 ──────────────────────────────────────────────────────────── */
  const matches = await prisma.match.findMany({
    where: {
      leagueId: { in: leagues.map((l) => l.id) },
      supersededAt: null,
      startAt: { gte: SEASON0_FROM },
      sourceMatchId: { not: null },
    },
    select: { id: true, sourceMatchId: true, startAt: true },
  })
  const matchIdOfKey = new Map<string, string>()
  /** ★선짤 점수를 매기는 경기★ — 사장님: 「이 점수 방식은 오늘 경기부터 계산해」 */
  const opensScore = new Set<string>()
  for (const m of matches) {
    if (!m.sourceMatchId) continue
    matchIdOfKey.set(m.sourceMatchId, m.id)
    if (scoresOpening(m.startAt)) opensScore.add(m.sourceMatchId)
  }

  let todo = [...matchIdOfKey.entries()]
  if (!options.rebuild) {
    const built = new Set(
      (
        await prisma.matchPlayerHex.findMany({
          where: { matchId: { in: matches.map((m) => m.id) }, formulaVersion: PLAYER_HEX_FORMULA_VERSION },
          select: { matchId: true },
          distinct: ['matchId'],
        })
      ).map((r) => r.matchId),
    )
    result.matchesSkipped = todo.filter(([, id]) => built.has(id)).length
    todo = todo.filter(([, id]) => !built.has(id))
  }
  log(`경기 ${matchIdOfKey.size}건 · 셀 것 ${todo.length}건 · 건너뜀 ${result.matchesSkipped}건`)

  for (let i = 0; i < todo.length; i += LOG_BATCH) {
    const part = todo.slice(i, i + LOG_BATCH)
    const keys = part.map(([k]) => k)
    const ids = part.map(([, id]) => id)

    /* 누가 누구인가 — 병영 usn → 우리 선수 · 그 경기 무기 */
    const who = new Map<string, Who>()
    for (const r of await prisma.$queryRaw<{ k: string; usn: string; w: number | null; pid: string }[]>`
      SELECT m."sourceMatchId" AS k, substring(p."sourcePlayerId" from 5) AS usn,
             s."weapon" AS w, p."id" AS pid
        FROM "MatchPlayerStat" s
        JOIN "Match" m ON m."id" = s."matchId"
        JOIN "Player" p ON p."id" = s."playerId"
       WHERE s."matchId" IN (${Prisma.join(ids)})
         AND p."sourcePlayerId" LIKE 'BRK-%'`) {
      who.set(`${r.k}|${r.usn}`, { pid: r.pid, weapon: r.w })
    }

    /* 배틀로그 — 두 벌을 읽고 겹침을 뺀다 */
    const raw = await prisma.$queryRaw<RawEvent[]>`
      SELECT r."matchKey" AS k, e->>'event_type' AS et, e->>'round' AS rd, e->>'event_time' AS tm,
             e->>'str_usn' AS su, e->>'target_str_usn' AS tu,
             e->>'team_no' AS tn, e->>'target_team_no' AS ttn, e->>'win_flag' AS wf,
             CASE WHEN e->>'event_type' = 'kill' THEN e->>'weapon' ELSE e->>'target_weapon' END AS gun,
             (e->>'kill_x')::int AS kx, (e->>'kill_y')::int AS ky,
             (e->>'death_x')::int AS dx, (e->>'death_y')::int AS dy
        FROM "BarracksBattleLogRaw" r, jsonb_array_elements(r."payload"->'battleLog') e
       WHERE r."matchKey" IN (${Prisma.join(keys)}) AND r."status" = 'ok'
         AND jsonb_typeof(r."payload"->'battleLog') = 'array'
         AND e->>'event_type' IN ('kill', 'death')`
    /**
     * ★폭탄 줄★ — 진영을 정하는 유일한 근거다 (D-208).
     *
     * 위 질의는 `event_type IN ('kill','death')` 라 C4 줄을 안 담아 온다. 따로 읽는다.
     * 행위자가 `team_no` 에 실릴 때도 `target_team_no` 에 실릴 때도 있어 ★네 칸을 다 가져온다★ —
     * 무기 칸과 팀 칸을 짝지어 읽는 것은 `bombEvidenceOf` 가 한다.
     */
    const bombRaw = await prisma.$queryRaw<{
      k: string; rd: string | null; w: string | null; tw: string | null
      tn: string | null; ttn: string | null
      su: string | null; tsu: string | null; kx: string | null; ky: string | null
    }[]>`
      SELECT r."matchKey" AS k, e->>'round' AS rd,
             e->>'weapon' AS w, e->>'target_weapon' AS tw,
             e->>'team_no' AS tn, e->>'target_team_no' AS ttn,
             -- ★누가 심었나·어디에 심었나★ (2026-09-18) — 폭탄 점수와 MVP 설명이 쓴다
             -- ⚠ 설치 자리는 kill_x/kill_y 다. death_* 는 0,0 이다 (실측)
             e->>'str_usn' AS su, e->>'target_str_usn' AS tsu,
             e->>'kill_x' AS kx, e->>'kill_y' AS ky
        FROM "BarracksBattleLogRaw" r, jsonb_array_elements(r."payload"->'battleLog') e
       WHERE r."matchKey" IN (${Prisma.join(keys)}) AND r."status" = 'ok'
         AND jsonb_typeof(r."payload"->'battleLog') = 'array'
         AND (e->>'weapon' LIKE 'c4-%' OR e->>'target_weapon' LIKE 'c4-%')`
    const bombByMatch = new Map<string, RoundSideEvent[]>()
    for (const b of bombRaw) {
      const arr = bombByMatch.get(b.k)
      const row: RoundSideEvent = {
        round: b.rd, weapon: b.w, target_weapon: b.tw, team_no: b.tn, target_team_no: b.ttn,
        kill_x: b.kx, kill_y: b.ky,
      }
      if (arr) arr.push(row)
      else bombByMatch.set(b.k, [row])
    }

    /*
     * ★폭탄을 심은 사람★ (2026-09-18) — 점수와 MVP 설명이 쓴다.
     * ⚠ C4 줄은 심은 사람이 ★앞칸에도 뒷칸에도★ 온다. 무기 칸과 짝지어 읽는다.
     */
    const plantsByMatch = new Map<string, { round: number; usn: string; x: number | null; y: number | null }[]>()
    for (const b of bombRaw) {
      const round = Number(b.rd)
      if (!Number.isFinite(round)) continue
      const usn = b.w === 'c4-install' ? b.su : (b.tw === 'c4-install' ? b.tsu : null)
      if (usn === null || usn === '') continue
      const list = plantsByMatch.get(b.k) ?? []
      list.push({ round, usn, x: b.kx === null ? null : Number(b.kx), y: b.ky === null ? null : Number(b.ky) })
      plantsByMatch.set(b.k, list)
    }

    /**
     * ★교환★ 의 창 — 동료가 죽고 이 안에 그 킬러를 잡으면 «되갚았다» 로 센다 (2026-09-15).
     * 5초는 클랜 육각 6번 축에서 사장님이 확정한 값이다 (D-256). 둘을 같은 값으로 둔다.
     */
    const TRADE_WINDOW_SECONDS = 5

    /**
     * ★선짤의 창★ — 라운드 시작 후 이 안에 난 첫 킬만 «선짤» 이다 (2026-09-15 사장님).
     * 실측 라운드 시작 → 첫 킬 중앙 22초 · 25초 안이 58.9%.
     */
    const OPENING_WINDOW_SECONDS = 25
    const kills = new Map<string, Kill>()
    /* ★라운드 승자★ — `win_flag` 는 그 배틀로그를 낸 클랜 쪽 시각이다. «lose» 만 있는 라운드는 상대가 이긴 것.
       겹침을 빼기 전에 두 벌 모두에서 읽는다 (2026-09-11 · 이걸 안 읽어 상대 쪽 세이브가 전부 0 이었다) */
    const roundWinner = new Map<string, string | null>()
    for (const g of raw) {
      /*
       * ⚠ ★`!g.tn` 은 «0번 팀» 을 통째로 버렸다★ (2026-09-15 사장님이 화면에서 잡아 주심:
       *   «양팀 다 아무도 세이브 한적이 없는데 40:10으로 뜨는 이유가 궁금해»).
       *
       *   `team_no` 는 «0» 과 «1» 두 값이다 (teamList: team 0→clan A · team 1→clan B).
       *   그런데 문자열 «0» 은 자바스크립트에서 ★거짓★ 이라 `!g.tn` 이 참이 된다.
       *   그래서 0번 팀 쪽 줄이 승자 표에 하나도 안 들어갔고, 0번 응답만 있는 경기는
       *   라운드 승자를 아예 못 읽어 세이브·소수싸움이 ★전부 «못 이김»★ 으로 쌓였다.
       *   실측: 개인 세이브 6.7% · 클랜 세이브 14.5% — 같은 것을 재는데 두 배 차이였다.
       *
       *   라운드도 같은 함정이 있다 — 지금은 1부터라 안 걸리지만 뜻으로 막아 둔다.
       */
      const noRound = g.rd === null || g.rd === undefined || g.rd === ''
      const noTeam = g.tn === null || g.tn === undefined || g.tn === ''
      if (noRound || noTeam || (g.wf !== 'win' && g.wf !== 'lose')) continue
      const key = `${g.k}|${g.rd}`
      if (g.wf === 'win') roundWinner.set(key, g.tn)
      else if (!roundWinner.has(key)) roundWinner.set(key, `!${g.tn}`)
    }
    for (const g of raw) {
      const killer = g.et === 'kill' ? g.su : g.tu
      const victim = g.et === 'kill' ? g.tu : g.su
      const kt = g.et === 'kill' ? g.tn : g.ttn
      const vt = g.et === 'kill' ? g.ttn : g.tn
      if (!killer || !victim || g.rd === null) continue
      const id = `${g.k}|${g.rd}|${g.tm}|${killer}|${victim}`
      if (kills.has(id)) continue
      kills.set(id, {
        k: g.k, rd: g.rd, t: secondsOf(g.tm), killer, victim, kt, vt,
        wf: g.wf, own: g.tn, gun: g.gun, kx: g.kx, ky: g.ky, dx: g.dx, dy: g.dy,
      })
    }
    result.events += kills.size

    /* 경기별 팀 명부 · 라운드별 킬 */
    const roster = new Map<string, Map<string, Set<string>>>()
    const byRound = new Map<string, Kill[]>()
    for (const e of kills.values()) {
      let teams = roster.get(e.k)
      if (!teams) { teams = new Map(); roster.set(e.k, teams) }
      for (const [u, t] of [[e.killer, e.kt], [e.victim, e.vt]] as const) {
        if (t === null) continue
        let s = teams.get(t)
        if (!s) { s = new Set(); teams.set(t, s) }
        s.add(u)
      }
      const rk = `${e.k}|${e.rd}`
      const arr = byRound.get(rk)
      if (arr) arr.push(e)
      else byRound.set(rk, [e])
    }

    const tallies = new Map<string, MatchTally>()
    const tallyOf = (k: string, pid: string): MatchTally => {
      const id = `${k}|${pid}`
      let t = tallies.get(id)
      if (!t) { t = emptyTally(); tallies.set(id, t) }
      return t
    }
    const whoOf = (k: string, usn: string): Who | undefined => who.get(`${k}|${usn}`)

    /*
     * ★라운드가 몇 초에 시작했나★ — 선짤의 25초 창을 재려면 필요하다 (2026-09-15 사장님:
     * «라운드 시작 후 25초 안에 가장 먼저 죽이면 선짤점수가 올라야해»).
     *
     * `event_time` 은 ★경기 시작부터의 누적 시간★ 이라 라운드 시작을 따로 짚어야 한다.
     * 값은 게임템포에서 사장님이 실측해 주신 것을 그대로 쓴다 —
     *   1라운드  경기 시작 + 10초
     *   그 뒤    직전 라운드 ★마지막 킬★ + 8.45초
     * 두 곳이 어긋나면 안 되므로 `@sacloud/nexon` 의 같은 상수를 가져다 쓴다.
     */
    /** 경기 → ★후반이 시작하는 라운드★ (2026-09-20). 화면의 「전반/후반」 이 쓴다 */
    const secondHalfFromOf = new Map<string, number>()
    const roundStartAt = new Map<string, number>()
    {
      const byMatch = new Map<string, { rd: number; key: string; last: number }[]>()
      for (const [key, arr] of byRound) {
        const head = arr[0] as Kill
        let last = head.t
        for (const e of arr) if (e.t > last) last = e.t
        const list = byMatch.get(head.k) ?? []
        list.push({ rd: Number(head.rd), key, last })
        byMatch.set(head.k, list)
      }
      for (const [, list] of byMatch) {
        list.sort((a, b) => a.rd - b.rd)
        let prevEnd: number | null = null
        for (const r of list) {
          roundStartAt.set(r.key, prevEnd === null ? MATCH_TO_FIRST_ROUND_SECONDS : prevEnd + ROUND_GAP_SECONDS)
          prevEnd = r.last
        }
      }
    }

    /**
     * ★라운드마다 누가 수비인가★ — 폭탄이 아는 라운드만 담는다.
     *
     * 모르는 라운드는 ★담지 않는다★. 그러면 그 라운드의 구역 판정도 통째로 건너뛴다 —
     * 진영을 틀리면 어택과 방어가 뒤집혀 조용히 거짓이 된다 (D-208 주석과 같은 이유).
     */
    const defenceOf = new Map<string, Map<number, string>>()
    {
      const roundsOfMatch = new Map<string, Set<number>>()
      for (const key of byRound.keys()) {
        const [mk, rd] = key.split('|')
        const n = Number(rd)
        if (!mk || !Number.isInteger(n)) continue
        const got = roundsOfMatch.get(mk)
        if (got) got.add(n)
        else roundsOfMatch.set(mk, new Set([n]))
      }
      for (const [mk, rounds] of roundsOfMatch) {
        const bombs = bombByMatch.get(mk)
        const teams = roster.get(mk)
        if (!bombs || !teams || teams.size !== 2) continue
        const [tA, tB] = [...teams.keys()]
        if (!tA || !tB) continue
        /*
         * ★5승 규칙을 같이 넘긴다★ (2026-09-17 사장님: «전반 후반 구분할 줄 아는거지?»).
         *
         * 진영을 가르는 근거는 둘이다 — ① C4(설치한 팀이 공격) ② 한 팀이 5승에 닿은
         * 라운드까지가 전반 (D-208 · 29,176판 반례 0건).
         * ①만 주면 ★폭탄이 한쪽 반에만 있는 경기★ 에서 그 근거가 전반인지 후반인지
         * 못 가르고 (`roundSidesOf` 가 후보 둘을 놓고 «모름» 을 낸다) 그 라운드가 통째로 빠진다.
         * 둘을 겹쳐야 한쪽이 떨어지고 나머지 라운드까지 채워진다.
         *
         * `roundWinner` 값은 «이긴 팀» 이거나 «!진 팀» 이다 (`win_flag` 두 벌을 겹쳐 읽은 결과).
         * 팀이 둘뿐이라 «!상대» 는 «우리 승» 이다.
         */
        const wonRound = (round: number): boolean | null => {
          const v = roundWinner.get(`${mk}|${round}`)
          if (v === undefined || v === null) return null
          if (v.startsWith('!')) {
            const loser = v.slice(1)
            if (loser === tA) return false
            if (loser === tB) return true
            return null
          }
          if (v === tA) return true
          if (v === tB) return false
          return null
        }
        const sides = roundSidesOf(bombs, tA, Math.max(...rounds), wonRound)
        if (sides.side.size === 0) continue
        const map = new Map<number, string>()
        for (const [round, side] of sides.side) map.set(round, side === 'defense' ? tA : tB)
        defenceOf.set(mk, map)
      }

      /*
       * ★C4 가 없는 반을 사장님 규칙으로 채운다★ (2026-09-17 사장님:
       *   «너 여태 폭탄설치 없었던 판의 전반 후반 구분을 할 줄 모르면
       *    어택성공률 어택방어율은 어케잰거야? 누가 어택차례고 누가 방어차례인줄 알고?»).
       *
       * 실측 — C4 가 정한 경기 86.8% · 이 규칙이 채운 경기 ★13.2%★. 안 넣으면 그만큼이 통째로 빈다.
       * 규칙과 셈은 `sideAxes.ts` 의 `defenceByHomeRule` 하나뿐이다.
       *
       * ★전·후반은 서로 반대다★ — 한 반을 알면 다른 반이 정해진다. 그래서
       *   ① 아는 반이 있으면 뒤집어 채우고
       *   ② 둘 다 모르면 그 반의 교전으로 규칙을 돌린다
       * 그래도 못 정하면 ★안 채운다★ — 진영을 틀리면 어택과 방어가 통째로 뒤집힌다.
       */
      for (const [mk, rounds] of roundsOfMatch) {
        const teams = roster.get(mk)
        if (!teams || teams.size !== 2) continue
        const [tA, tB] = [...teams.keys()]
        if (!tA || !tB) continue
        const known = defenceOf.get(mk) ?? new Map<number, string>()
        const sorted = [...rounds].sort((a, b) => a - b)
        /* 전반의 끝 — 아는 라운드에서 수비가 바뀌는 자리. 모르면 5승 규칙이 정한 자리 */
        let switchAt: number | null = null
        for (let i = 1; i < sorted.length; i += 1) {
          const prev = known.get(sorted[i - 1] as number)
          const here = known.get(sorted[i] as number)
          if (prev !== undefined && here !== undefined && prev !== here) { switchAt = sorted[i] as number; break }
        }
        if (switchAt === null) {
          /* 승수로 전반의 끝을 찾는다 — 한 팀이 5승에 닿은 라운드 다음이 후반이다 */
          const acc: Record<string, number> = {}
          for (const r of sorted) {
            const v = roundWinner.get(`${mk}|${r}`)
            if (v === undefined || v === null) continue
            const winner = v.startsWith('!') ? (v.slice(1) === tA ? tB : v.slice(1) === tB ? tA : null) : v
            if (winner === null) continue
            acc[winner] = (acc[winner] ?? 0) + 1
            if (acc[winner] >= 5) { switchAt = r + 1; break }
          }
        }
        if (switchAt === null) continue
        /*
         * ★후반이 어디서 시작하나★ (2026-09-20 사장님: 「전반1라운드 후반12라운드
         *   이런식으로」). ★이미 여기서 구했으니 기억만 해 둔다★ — 다시 세지 않는다.
         */
        secondHalfFromOf.set(mk, switchAt)
        const halves: number[][] = [sorted.filter((r) => r < switchAt), sorted.filter((r) => r >= switchAt)]
        if (halves[0]?.length === 0 || halves[1]?.length === 0) continue
        const filled = new Map(known)
        for (let i = 0; i < 2; i += 1) {
          const half = halves[i] as number[]
          if (half.some((r) => filled.has(r))) continue
          const other = halves[1 - i] as number[]
          const otherDef = other.map((r) => filled.get(r)).find((v) => v !== undefined)
          let def: string | null = otherDef !== undefined ? (otherDef === tA ? tB : tA) : null
          if (def === null) {
            const hk: HomeRuleKill[] = []
            for (const r of half) {
              for (const e of byRound.get(`${mk}|${r}`) ?? []) {
                hk.push({
                  killAt: { x: e.kx, y: e.ky },
                  deathAt: { x: e.dx, y: e.dy },
                  killerTeam: e.kt,
                  victimTeam: e.vt,
                  /* 무기는 ★그 경기 기록★ 으로 본다 (`MatchPlayerStat.weapon` · 1 이 스나) */
                  killerIsSniper: whoOf(mk, e.killer)?.weapon === 1,
                  victimIsSniper: whoOf(mk, e.victim)?.weapon === 1,
                })
              }
            }
            def = defenceByHomeRule(hk, sideZones.homeFloor, sideZones.homeSnipe).defence
          }
          if (def === null) continue
          for (const r of half) filled.set(r, def)
        }
        if (filled.size > known.size) defenceOf.set(mk, filled)
      }
    }

    for (const [roundKey, arr] of byRound) {
      arr.sort((a, b) => a.t - b.t)
      const mk = (arr[0] as Kill).k
      const teams = roster.get(mk)

      /* 선짤 · 연속킬 · 등장 라운드 */
      const seen = new Set<string>()
      const lastKillAt = new Map<string, number>()
      const burstHere = new Set<string>()
      /** ★그 팀이 이 라운드에서 몇 번째로 잡았나★ — 스나 킬 값이 순번으로 갈린다 */
      const killSeq = new Map<string, number>()
      for (const e of arr) {
        const K = whoOf(mk, e.killer)
        const V = whoOf(mk, e.victim)
        if (K) {
          seen.add(K.pid)
          const prev = lastKillAt.get(K.pid)
          if (prev !== undefined && e.t - prev <= BURST_GAP_SECONDS) burstHere.add(K.pid)
          lastKillAt.set(K.pid, e.t)
          tallyOf(mk, K.pid).kills += 1
          /*
           * ★점수제★ (2026-09-18 사장님). 값은 `matchScore.ts` 가 정한다 —
           * 여기서 점수표를 다시 적지 않는다.
           * ⚠ 무기는 ★그 경기 기록★(`MatchPlayerStat.weapon` · 1 이 스나)으로 본다.
           */
          /* 팀을 모르는 줄은 ★순번을 못 센다★ — 빈 열쇠로 묶어 한 덩어리로 본다 */
          const team = e.kt ?? ''
          const rank = (killSeq.get(team) ?? 0) + 1
          killSeq.set(team, rank)
          const pts = killScore(
            { killerIsSniper: K.weapon === 1, victimIsSniper: V?.weapon === 1 },
            rank,
            /*
             * ★롱에서 난 스나 대 스나에는 +1점★ (2026-09-18 사장님).
             * ⚠ ★한쪽이라도 롱 안★ 이면 센다 — 비롱→벙커 · 벙커→비롱 · 비롱→비롱 전부다.
             *   스나싸움 축과 ★같은 자★ 여야 화면의 횟수와 점수가 안 어긋난다.
             */
            inLong(e.kx, e.ky) || inLong(e.dx, e.dy),
          )
          const t = tallyOf(mk, K.pid)
          t.score += pts
          /*
           * ★MVP 설명 재료★ — ★스나를 잡은 것만★ 담는다 (사장님:
           *   「평범한 1점짜리 라플킬은 세지마, 스나수면 스나싸움 이긴건
           *    라운드마다 콕콕 찝어서 다넣어」).
           */
          if (V?.weapon === 1) {
            const early = rank <= 2
            t.scoreLog.push({
              r: Number(roundKey.split('|')[1]) || 0,
              k: K.weapon === 1
                ? (early ? 'sniperVsSniperEarly' : 'sniperVsSniperLate')
                : (early ? 'rifleVsSniperEarly' : 'rifleVsSniperLate'),
              p: pts,
            })
          }

          /*
           * ★크랙★ (2026-09-18 사장님) — ★칠한 구역 안★ 에서 ★25초 안★ 에 딴 점수.
           *
           * > 「내가 칠한 구역 안에서 잡아야 크랙이야 거기서 이제 누굴 잡았냐
           * >  몇명 잡았냐에 따른 점수 차등지급」
           *
           * ⚠ 옛 판은 ★그 라운드 첫 킬 하나만★ 0/1 로 셌다. 이제 25초 안의 킬을
           *   ★전부★ 세고, 스나를 잡았으면 그 값(5·3점)이 그대로 들어간다.
           * ⚠ 자리는 ★죽은 사람★ 기준이다 — 「어디서 잡혔나」 가 크랙이지
           *   「어디서 쐈나」 가 아니다 (스나싸움에서 정한 약속과 같다).
           * ⚠ 좌표나 라운드 시작을 모르면 ★안 센다★ (D-106).
           */
          const roundStart = roundStartAt.get(roundKey)
          if (
            roundStart !== undefined &&
            e.t - roundStart <= OPENING_WINDOW_SECONDS &&
            crackZone &&
            inZone(crackZone, e.dx !== null && e.dy !== null ? { x: e.dx, y: e.dy } : null)
          ) {
            t.crackScore += pts
          }

          /*
           * ★어택성공률 / 방어율★ (2026-09-18 사장님) —
           *   공격(레드)진영일 때 딴 점수 · 수비(블루)진영일 때 딴 점수를 따로 쌓는다.
           * ⚠ ★진영을 모르는 라운드는 어느 쪽에도 안 넣는다★ (D-106) —
           *   그래서 `atkScore + defScore` 가 `score` 보다 작을 수 있다.
           */
          const rdNo = Number(roundKey.split('|')[1])
          const defendingTeam = Number.isInteger(rdNo) ? defenceOf.get(mk)?.get(rdNo) : undefined
          if (defendingTeam !== undefined && e.kt !== null) {
            if (e.kt === defendingTeam) t.defScore += pts
            else t.atkScore += pts
          }
        }
        if (V) seen.add(V.pid)

        /* 싸움 — 둘 다 스나(롱 안) 또는 둘 다 라플(맵 전체). 무기는 그 경기 기록으로 판정한다 */
        if (K && V) {
          if (K.weapon === 1 && V.weapon === 1 && e.gun === 'sniper') {
            /*
             * ⚠ ★한쪽이라도 롱 안이면 센다★ (2026-09-18 사장님:
             *   「벙커>비롱 / 비롱>벙커 비롱>비롱 다 스나싸움으로 해」).
             *
             *   ★여기만 `&&` 로 남아 있었다★ — 2026-09-19 검수에서 찾았다.
             *   경기 육각(`clanHexV2`)과 점수 보너스(`+1점`)는 그날 `||` 로 바꿨는데
             *   ★개인 스나싸움 축★ 만 옛 규칙이라, 같은 화면 안에서
             *   점수는 「한쪽이라도」 로 주고 횟수는 「둘 다」 로 세고 있었다.
             *   분모가 줄어 문턱(`MIN_DUELS`)을 못 넘는 사람도 늘었다.
             */
            if (inLong(e.kx, e.ky) || inLong(e.dx, e.dy)) {
              tallyOf(mk, K.pid).duelWon += 1
              tallyOf(mk, V.pid).duelLost += 1
            }
          } else if (K.weapon === 0 && V.weapon === 0 && e.gun === 'riple') {
            tallyOf(mk, K.pid).duelWon += 1
            tallyOf(mk, V.pid).duelLost += 1
          }
        }
      }
      /*
       * ★구역 넷 판정★ (2026-09-17 사장님). 판정은 `sideAxes.ts` 가 한다 — 여기서 셈을 다시 적지 않는다.
       *
       * 분모는 ★그 선수가 그 구역에서 킬이나 데스를 낸 라운드★ 다 («낀 라운드» 의 좁은 정의).
       * 넓은 정의(«그 라운드에 총을 쐈다») 는 B 근처에 안 갔던 라운드까지 들어와 뜻이 흐려진다.
       * 좁게 잡아도 구역 셋을 합치면 선수 분모 중앙이 87 이다 (실측) — 넉넉하다.
       */
      {
        const rdNum = Number(roundKey.split('|')[1])
        const defTeam = Number.isInteger(rdNum) ? defenceOf.get(mk)?.get(rdNum) : undefined
        if (defTeam !== undefined) {
          const sideKills: SideKill[] = arr.map((e) => ({
            killAt: { x: e.kx, y: e.ky },
            deathAt: { x: e.dx, y: e.dy },
            victimIsDefence: e.vt === defTeam,
            killerIsDefence: e.kt === defTeam,
          }))
          const verdicts = [
            { zone: sideZones.a, seatZone: sideZones.a, v: judgeExchange(sideKills, sideZones.a), atkN: 'aAtkN', atkOk: 'aAtkOk', defN: 'aDefN', defOk: 'aDefOk' },
            { zone: sideZones.b, seatZone: sideZones.b, v: judgeExchange(sideKills, sideZones.b), atkN: 'bAtkN', atkOk: 'bAtkOk', defN: 'bDefN', defOk: 'bDefOk' },
            { zone: sideZones.f2, seatZone: sideZones.f2, v: judgeExchange(sideKills, sideZones.f2), atkN: 'f2AtkN', atkOk: 'f2AtkOk', defN: 'f2DefN', defOk: 'f2DefOk' },
            { zone: sideZones.shortKill, seatZone: sideZones.shortKill, v: judgeShort(sideKills, sideZones.shortKill), atkN: 'shortAtkN', atkOk: 'shortAtkOk', defN: 'shortDefN', defOk: 'shortDefOk' },
          ] as const
          for (const row of verdicts) {
            if (row.zone === null || !row.v.judged) continue
            /*
             * ★그 구역에 낀 사람★ — 잡았든 죽었든 그 구역이면 낀 것이다.
             * ⚠ `teams` 는 ★pid 가 아니라 usn★ 을 담는다. 팀은 그 줄의 `kt`/`vt` 로 직접 읽는다 —
             *   `teams` 로 되짚으면 조용히 빗나간다.
             */
            const here = new Map<string, boolean>()
            for (const e of arr) {
              const K = whoOf(mk, e.killer)
              const V = whoOf(mk, e.victim)
              if (K && e.kt !== null && inZone(row.zone, ptOf(e.kx, e.ky))) here.set(K.pid, e.kt === defTeam)
              if (V && e.vt !== null && inZone(row.zone, ptOf(e.dx, e.dy))) here.set(V.pid, e.vt === defTeam)
            }
            for (const [pid, mineIsDefence] of here) {
              const t = tallyOf(mk, pid)
              if (mineIsDefence) {
                t[row.defN] += 1
                if (!row.v.breached) t[row.defOk] += 1
              } else {
                t[row.atkN] += 1
                if (row.v.breached) t[row.atkOk] += 1
              }
            }
          }
        }

        /* ★자리 재료★ — 그 선수 자기 자리. 킬이면 잡은 자리 · 데스면 죽은 자리 */
        for (const e of arr) {
          const K = whoOf(mk, e.killer)
          const V = whoOf(mk, e.victim)
          if (K) {
            addSeat(tallyOf(mk, K.pid), ptOf(e.kx, e.ky), sideZones)
            if (e.gun === 'sniper') tallyOf(mk, K.pid).sniperKills += 1
          }
          if (V) addSeat(tallyOf(mk, V.pid), ptOf(e.dx, e.dy), sideZones)
        }
      }

      for (const pid of seen) tallyOf(mk, pid).rounds += 1
      for (const pid of burstHere) tallyOf(mk, pid).burstRounds += 1

      /*
       * ★캐리력 — 이 라운드에 몇 킬을 했나★ (2026-09-15 사장님).
       * 최고를 새로 세우면 «몇 번 냈나» 를 1로 되돌리고, 같으면 하나 더한다.
       */
      const killsHere = new Map<string, number>()
      for (const e of arr) {
        const K = whoOf(mk, e.killer)
        if (K) killsHere.set(K.pid, (killsHere.get(K.pid) ?? 0) + 1)
      }
      for (const [pid, n] of killsHere) {
        const t = tallyOf(mk, pid)
        if (n > t.maxRoundKills) {
          t.maxRoundKills = n
          t.maxRoundTimes = 1
        } else if (n === t.maxRoundKills) {
          t.maxRoundTimes += 1
        }
        /*
         * ★MVP 설명에 «한 라운드 몇 킬» 을 담는다★ (2026-09-20 사장님: 「mvp설명 없는 판도 있네」)
         *
         * ── 왜 이걸 담나
         *   실측 — MVP 가 있는 경기 ★757건 중 31건(4.1%)★ 에 설명이 한 줄도 없었다.
         *   그중 ★89%★ 가 ★라플킬만 쌓은 MVP★ 였다. 표본 하나는 ★13킬★ 을 했는데
         *   전부 1점짜리 라플킬이라 담길 줄이 ★하나도 없었다.★
         *
         * ⚠ ★평범한 라플킬을 담는 것이 아니다★ — 사장님이 그건 세지 말라 하셨다
         *   (「평범한 1점짜리 라플킬은 세지마」). ★한 라운드에 셋 이상★ 은
         *   평범한 킬이 아니라 ★판을 뒤집은 장면★ 이라 담는다.
         * ⚠ 점수(`p`)는 ★0★ 이다 — 이건 «무슨 일이 있었나» 를 적는 줄이지
         *   점수를 더하는 줄이 아니다. 점수를 두 번 세면 안 된다.
         */
        if (n >= MVP_WHY_MULTI_KILLS) {
          t.scoreLog.push({ r: Number(roundKey.split('|')[1]) || 0, k: `multi${n}`, p: 0 })
        }
      }
      /*
       * ★선짤 — 라운드 시작 후 25초 안의 첫 킬만★ (2026-09-15 사장님).
       *
       * ⚠ 옛 판은 «그 라운드의 첫 킬» 을 무조건 셌다. 그러면 40초쯤 지나 한 명이
       *   슬쩍 잡은 것도 «선짤» 이 됐다. 사장님이 재 주신 25초는 실측 중앙(22초)
       *   바로 뒤라, 라운드 6,975개 중 ★58.9%★ 가 걸린다 — 절반 조금 넘는 좋은 자리다.
       *
       * 라운드 시작을 못 짚은 경기(첫 라운드 정보가 없는 등)는 ★안 센다★ —
       * 25초인지 모르면서 선짤이라 적지 않는다 (D-106).
       */
      const opener = arr[0] as Kill
      const startedAt = roundStartAt.get(roundKey)
      if (startedAt !== undefined && opener.t - startedAt <= OPENING_WINDOW_SECONDS) {
        const firstK = whoOf(mk, opener.killer)
        if (firstK) {
          tallyOf(mk, firstK.pid).firstKills += 1
          /*
           * ★크랙 성공 — 그 첫 킬이 «칠한 구역» 안이었나★ (2026-09-16 사장님).
           *
           * 자리는 ★죽은 사람★ 기준이다 (`dx`/`dy` = `death_x`/`death_y`).
           * 구역 판정을 `byVictim` 으로 하는 것은 스나싸움에서 이미 정한 약속이다 —
           * `byKiller` 로 세면 «어디서 잡혔나» 가 아니라 «어디서 쐈나» 가 된다.
           *
           * ⚠ ★좌표를 모르면 안 센다★ (D-106) — 그래서 `crackKills <= firstKills` 다.
           */
          if (crackZone && inZone(crackZone, opener.dx !== null && opener.dy !== null ? { x: opener.dx, y: opener.dy } : null)) {
            tallyOf(mk, firstK.pid).crackKills += 1
          }
        }
      }

      /*
       * ★★선짤 점수★★ (2026-09-20 사장님)
       *
       * > 「레드는 ★22초 이내에 5:5에서 선짤당해서 죽은 사람만★ -1점」
       * > 「블루때 스나가 가장 먼저 죽는다? 이건 ★무조건 마이너스요소★ -2점
       * >  스나는 더 깎아야해 ★중요한 포지션★ 이라」
       * > 「★첫사망자의 기준은 5:5일때만이다★」
       *
       *   ```
       *            상                              벌
       *   ─────────────────────────────────────────────────────────
       *   레드   22초 안 · 선짤 + 3초 생존      22초 안 · 첫 사망자 → -1
       *          → +1                           (팀이 3초 안에 되잡으면 면제)
       *
       *   블루   22초 안 · ★스나를★ 선짤        스나가 첫 사망자 → -2
       *          + 3초 생존 → +1                라플이 첫 사망자 → -1
       *          (라플 잡은 건 상 없음)         (면제 없음 · 22초 없음)
       *   ```
       *
       * ⚠ ★값은 `openingScore.ts` 하나가 정한다★ — 여기서 점수표를 다시 적지 않는다
       *   (`matchScore.ts` 를 쓰는 킬 점수와 같은 규칙이다).
       *
       * ⚠ ★모르면 안 센다★ (D-106) — 5:5 가 아니거나 · 진영을 모르거나 ·
       *   라운드 시작을 모르거나 · 같은 초에 둘이 죽었으면 그 라운드를 건너뛴다.
       *
       * ⚠ ★`scoreLog` 에는 0점짜리를 안 담는다★ — 사장님이 「평범한 1킬은 넣지 마라」
       *   하신 것과 같은 규칙이다. 22초를 넘겼거나 라플을 잡아 상이 없는 줄은
       *   ★적어 봐야 줄만 길어진다.★
       */
      /*
       * ⚠ ★오늘(2026-09-20) 이후 경기만★ (사장님) — 옛 경기를 다시 돌리지 않는다.
       *   날짜는 `openingScoreWindow.ts` 하나가 안다.
       * ⚠ ★5:5 일 때만★ (사장님: 「첫사망자의 기준은 5:5일때만이다」) —
       *   명부에 양 팀 다섯씩 확인된 경기만 센다.
       */
      const teamsHere = roster.get(mk)
      const isFull =
        teamsHere !== undefined &&
        teamsHere.size === 2 &&
        [...teamsHere.values()].every((set) => set.size === OPENING_TEAM_SIZE)
      if (startedAt !== undefined && isFull && opensScore.has(mk)) {
        const defTeamHere = defenceOf.get(mk)?.get(Number(roundKey.split('|')[1]) || 0)
        /* 같은 초에 둘이 죽었으면 누가 먼저인지 모른다 — 그 라운드는 버린다 */
        const tied = arr.length >= 2 && (arr[1] as Kill).t === (arr[0] as Kill).t
        if (defTeamHere !== undefined && !tied) {
          const first = arr[0] as Kill
          const K = whoOf(mk, first.killer)
          const V = whoOf(mk, first.victim)
          const rdNo = Number(roundKey.split('|')[1]) || 0
          const early = first.t - startedAt <= OPENING_PENALTY_WINDOW_SECONDS
          /* 죽인 사람이 3초 이상 살았나 (맞트레이드는 상을 안 준다) */
          const killerDeath = arr.find((x) => x.victim === first.killer)
          const survived = killerDeath === undefined || killerDeath.t - first.t >= OPENING_SURVIVE_SECONDS
          /* 팀이 그 킬러를 3초 안에 되잡았나 */
          const revenged = killerDeath !== undefined && killerDeath.t - first.t <= OPENING_REVENGE_SECONDS
          /* 죽은 쪽이 수비(블루)인가 */
          const victimIsDefence = first.vt !== null && first.vt === defTeamHere

          const add = (pid: string, kind: string, points: number): void => {
            const t = tallyOf(mk, pid)
            t.score += points
            t.openingScore += points
            /* 0점짜리는 «무슨 일이 있었나» 도 아니다 — 안 담는다 */
            if (points !== 0) t.scoreLog.push({ r: rdNo, k: kind, p: points })
          }

          if (!victimIsDefence) {
            /* ★죽은 쪽이 레드(공격)★ — 22초 규칙이 걸린다 */
            if (early && V) {
              if (revenged) {
                /* 면제 — 점수는 0 이지만 횟수는 남긴다 (설명에 쓸 수 있다) */
                tallyOf(mk, V.pid).openingRevenged += 1
              } else {
                add(V.pid, 'openRedDeath', RED_OPENING_DEATH_POINT)
              }
            }
            /* 블루 상점 — ★상대 스나를 잡았을 때만★ */
            if (early && survived && K && V?.weapon === 1) {
              add(K.pid, 'openBlueSniperKill', BLUE_SNIPER_KILL_POINT)
            }
          } else {
            /* ★죽은 쪽이 블루(수비)★ — 벌점에 22초도 면제도 없다 */
            if (V) {
              if (V.weapon === 1) add(V.pid, 'openBlueSniperDeath', BLUE_SNIPER_DEATH_POINT)
              else if (V.weapon === 0) add(V.pid, 'openBlueRifleDeath', BLUE_RIFLE_DEATH_POINT)
              /* ⚠ 무기를 모르면 안 깎는다 — 스나는 -2, 라플은 -1 이라 틀리면 두 배로 틀린다 */
            }
            /* 레드 상점 — 22초 안 + 3초 생존 */
            if (early && survived && K) add(K.pid, 'openRedKill', RED_OPENING_KILL_POINT)
          }
        }
      }

      /*
       * ★평균 사망 시간★ (2026-09-16 사장님: «평균사망시간 1분27초 이런식으로 /
       *   더 늦게 죽었을수록 축이 더 높게끔»).
       *
       *   ★라운드 시작 기준★ 이다 — 경기 시작 기준으로 재면 뒤 라운드일수록 커져서
       *   «오래 살았다» 와 «늦은 라운드였다» 가 섞인다.
       *   ★라운드 시작을 모르면 안 센다★ — 몇 초인지 모르면서 적지 않는다 (D-106).
       *   ⚠ 끝까지 산 라운드는 여기 안 들어온다 (죽은 줄이 없다). 그래서 이 값은
       *     «죽을 때는 언제 죽었나» 이지 «얼마나 오래 사나» 가 아니다.
       */
      if (startedAt !== undefined) {
        for (const k of arr) {
          const victim = whoOf(mk, k.victim)
          if (!victim) continue
          const lived = k.t - startedAt
          /* 음수는 시각이 어긋난 줄이다 — 버린다 */
          if (lived < 0) continue
          const t = tallyOf(mk, victim.pid)
          t.deathSeconds += lived
          t.deathCount += 1
        }
      }
      /*
       * ★게임템포★ (2026-09-16 저녁 사장님).
       *
       * > «죽거나 잡은(라운드마다의 첫 킬) 시간을 평균내서 그걸 게임템포 축으로 만든다
       * >  ★빨리 잡거나 죽을수록★ 게임템포가 빠른거야»
       *
       * ── 무엇을 재나
       *   한 라운드에서 그 선수가 ★먼저 겪은 일★ 까지 걸린 초다 —
       *   ★내가 낸 첫 킬★ 과 ★내가 죽은 시각★ 중 ★빠른 쪽★.
       *   잡든 죽든 «판에 들어간 순간» 이라 둘을 한 자로 잰다.
       *
       * ── 평균 사망 시간과 무엇이 다른가 (④ 가 이것으로 갈렸다)
       *   사망 시간은 ★죽은 라운드만★ 본다. 끝까지 살아 3킬을 낸 라운드는 빠진다 —
       *   «잘한 라운드가 안 세어지는» 자리였다. 게임템포는 ★잡아도 센다★.
       *
       * ── 안 세는 라운드
       *   킬도 없고 죽지도 않은 라운드는 ★안 센다★ — 그 선수에게 아무 일도 안 일어났다.
       *   라운드 시작을 모르면 안 센다 (D-106).
       */
      if (startedAt !== undefined) {
        const firstAt = new Map<string, number>()
        const mark = (pid: string, at: number): void => {
          /* 음수는 시각이 어긋난 줄이다 — 버린다 (사망 시간과 같은 규칙) */
          if (at < 0) return
          const had = firstAt.get(pid)
          if (had === undefined || at < had) firstAt.set(pid, at)
        }
        for (const k of arr) {
          const at = k.t - startedAt
          const K = whoOf(mk, k.killer)
          if (K) mark(K.pid, at)
          const V = whoOf(mk, k.victim)
          if (V) mark(V.pid, at)
        }
        for (const [pid, at] of firstAt) {
          const t = tallyOf(mk, pid)
          t.tempoSeconds += at
          t.tempoCount += 1
        }
      }
      /*
       * ── ★기회창출 · 기회차단 · 안전함★ (2026-09-16 밤 사장님) ──
       *
       *   기회창출  그 라운드 ★첫 킬★ 을 냈나 (스나 ②)
       *   기회차단  상대가 열었을 때 ★다음 킬★ 을 냈나 (라플 ②)
       *   안전함    그 라운드를 ★끝까지 살았나★ (스나 ⑥)
       *
       *   셋 다 «몇 초» 를 안 본다 — 오늘 실측에서 시간은 판이 기운 그림자였다.
       */
      if (teams) {
        const opener = arr[0] as Kill
        const second = arr.length > 1 ? (arr[1] as Kill) : null
        /* usn → team — 아래 `teamOf` 는 이 지점보다 뒤에 만들어진다 */
        const teamOfUsn = new Map<string, string>()
        for (const [t, set] of teams) for (const u of set) teamOfUsn.set(u, t)

        const openerWho = whoOf(mk, opener.killer)
        if (openerWho) tallyOf(mk, openerWho.pid).openRounds += 1
        const openerTeam = teamOfUsn.get(opener.killer)
        const secondPid = second ? (whoOf(mk, second.killer)?.pid ?? null) : null

        /* 이 라운드에 죽은 사람들 — «끝까지 살았나» 를 가린다 */
        const diedHere = new Set<string>()
        for (const e of arr) {
          const V = whoOf(mk, e.victim)
          if (V) diedHere.add(V.pid)
        }
        /* 등장한 usn 을 모으면 팀까지 안다 (`seen` 은 pid 라 팀을 모른다) */
        const usnHere = new Set<string>()
        for (const e of arr) {
          usnHere.add(e.killer)
          usnHere.add(e.victim)
        }
        for (const usn of usnHere) {
          const W = whoOf(mk, usn)
          if (!W) continue
          const t = tallyOf(mk, W.pid)
          if (!diedHere.has(W.pid)) t.aliveRounds += 1
          /* ★상대가 열었을 때만 «기회차단» 의 판이다★ */
          const myTeam = teamOfUsn.get(usn)
          if (openerTeam === undefined || myTeam === undefined || openerTeam === myTeam) continue
          t.foeOpenRounds += 1
          if (secondPid !== null && secondPid === W.pid) t.cutRounds += 1
        }
      }

      /*
       * ★교환율★ (2026-09-15 사장님 «교환율로 해줘») — 동료가 죽은 직후 그 킬러를 되잡았나.
       *
       * 분자 `tradeKills`  동료가 죽고 ★5초 안★ 에 그 킬러를 잡은 횟수
       * 분모 `mateDeaths`  그 라운드에 죽은 ★내 동료★ 수 (나는 안 센다)
       *
       * 클랜 육각 6번 축과 같은 뜻이고 그걸 개인 단위로 내린 것이다.
       * 5초는 클랜 축에서 사장님이 확정한 값이다 (D-256).
       */
      for (let n = 0; n < arr.length; n += 1) {
        const e = arr[n] as Kill
        const K = whoOf(mk, e.killer)
        if (!K) continue
        for (let m = n - 1; m >= 0; m -= 1) {
          const past = arr[m] as Kill
          if (e.t - past.t > TRADE_WINDOW_SECONDS) break
          /* 먼저 죽은 사람이 ★내 편★ 이고, 그 사람을 잡은 자가 ★지금 내가 잡은 자★ 인가 */
          if (past.vt !== null && e.kt !== null && past.vt === e.kt && past.killer === e.victim) {
            tallyOf(mk, K.pid).tradeKills += 1
            break
          }
        }
      }
      /*
       * 분모 — ★내가 살아 있을 때★ 죽은 동료 수.
       *
       * ⚠ 옛 판은 «그 라운드에 죽은 동료» 를 다 셌다. 그러면 ★내가 먼저 죽은 뒤★ 의
       *   동료 죽음까지 분모에 들어가서, 되갚을 수 없었던 것을 «안 갚았다» 로 적는다.
       *   실측 그 판의 교환율 평균 4.4% · 중앙 3.4% 로 바닥에 깔렸다.
       *   모르는 것도 못 한 것도 아닌 ★할 수 없었던 것★ 은 빼는 게 맞다 (D-106).
       */
      {
        const myDeathAt = new Map<string, number>()
        for (const e of arr) {
          if (!myDeathAt.has(e.victim)) myDeathAt.set(e.victim, e.t)
        }
        for (const e of arr) {
          if (e.vt === null) continue
          const team = teams?.get(e.vt)
          if (!team) continue
          for (const u of team) {
            if (u === e.victim) continue
            /* 내가 그 전에 죽었으면 되갚을 수 없었다 — 분모에 안 넣는다 */
            const mine = myDeathAt.get(u)
            if (mine !== undefined && mine < e.t) continue
            const W = whoOf(mk, u)
            if (!W) continue
            tallyOf(mk, W.pid).mateDeaths += 1
          }
        }
      }

      /* 세이브 · 소수싸움 — 살아 있는 수를 따라가며 밀린 쪽을 본다 */
      if (!teams || teams.size !== 2) continue
      const [tA, tB] = [...teams.keys()] as [string, string]
      const flagged = roundWinner.get(`${mk}|${(arr[0] as Kill).rd}`) ?? null
      /* «!팀» 은 그 팀이 졌다는 뜻 — 두 팀뿐이니 남은 쪽이 이겼다 */
      const win = flagged === null ? null : flagged.startsWith('!') ? (flagged.slice(1) === tA ? tB : tA) : flagged
      /*
       * ★그 라운드를 이겼는지 모르면 세이브·소수싸움을 아예 안 센다★
       * (2026-09-15 사장님: «양팀 다 아무도 세이브 한적이 없는데 40:10으로 뜨는 이유가 궁금해»).
       *
       * ⚠ 옛 판은 `win` 이 `null` 이어도 ★분모만★ 늘렸다. 그러면 «혼자 남았는데 못 이김»
       *   으로 쌓여서, 승패를 모르는 경기가 통째로 «세이브 0/15» 로 보였다.
       *   실측(260915013708124001): 개인 합계 0/15 인데 클랜은 4/10 · 1/10 이었다 —
       *   ★클랜 쪽(`clanHexV2.ts`)에는 `won !== null` 조건이 있었고 여기만 빠져 있었다.★
       *
       * 모르는 것을 «못 했다» 로 적지 않는다 (D-106).
       * 킬·선짤·연속킬은 승패와 무관하므로 위에서 이미 다 셌다 — 여기서만 끊는다.
       */
      /*
       * ★게임영향력 — «우위를 만든 킬»★ (2026-09-15 사장님:
       * «나는 킬을 가장 많이했다고 무조건 걔가 잘한것처럼 되는 그 구조가 싫은거야»
       *  → «너무 좋다 그걸 게임영향력으로 넣자»).
       *
       * 킬을 날린 ★그 순간★ 우리 생존자가 상대보다 많지 않았던 킬만 센다.
       * 4대1로 이기고 있을 때 딴 킬은 안 센다 — 이미 이긴 판이다.
       * 5대5·4대5 처럼 팽팽하거나 밀리는 순간에 따낸 킬만 «영향» 으로 본다.
       *
       * 실측(515판 · 4,078 «경기×선수»)
       *   총 킬과의 상관 ★0.620★ — 최대 라운드 킬은 0.913, 총 킬은 1.000
       *   한 판 열 명이 갈리는 갈래 5.01 (최대 라운드 킬은 3.43)
       *   무기 편향 1.33배 — 킬 자체 편향(1.34배)과 같은 수준이라 보정하지 않는다
       *
       * ⚠ ★승패를 몰라도 센다★ — 이 축은 라운드 승패와 무관하다.
       *   그래서 바로 아래 `win === null` 문보다 ★먼저★ 둔다.
       */
      {
        const left = new Map<string, number>([
          [tA, (teams.get(tA) as Set<string>).size],
          [tB, (teams.get(tB) as Set<string>).size],
        ])
        const sideOf = new Map<string, string>()
        for (const [t, set] of teams) for (const u of set) sideOf.set(u, t)
        for (const e of arr) {
          const mine = sideOf.get(e.killer)
          if (mine !== undefined) {
            const foe = mine === tA ? tB : tA
            /* «많지 않았다» 이므로 동수도 센다 — 5대5 에서 먼저 따낸 킬이 제일 크다 */
            if ((left.get(mine) ?? 0) <= (left.get(foe) ?? 0)) {
              const K = whoOf(mk, e.killer)
              if (K) tallyOf(mk, K.pid).evenKills += 1
            }
          }
          const vt = sideOf.get(e.victim)
          if (vt !== undefined) left.set(vt, (left.get(vt) ?? 1) - 1)
        }
      }

      if (win === null) continue
      const alive = new Map<string, Set<string>>([[tA, new Set(teams.get(tA))], [tB, new Set(teams.get(tB))]])
      const teamOf = new Map<string, string>()
      for (const [t, s] of teams) for (const u of s) teamOf.set(u, t)

      /*
       * ★폭탄 점수★ (2026-09-18 사장님) — 심고 이기면 2점 · 져도 B쪽이면 2점 · A쪽이면 1점.
       * MVP 설명에도 「13라운드 폭탄설치(B) 후 승리 +2점」 으로 들어간다.
       *
       * ⚠ 어느 쪽에 심었는지는 ★설치 자리★ 로 본다 — B묶음(비롱·벙커·바닥·일문) 안이면 B쪽이다.
       * ⚠ 라운드 승패를 모르면 안 센다 (D-106) — 이겼는지 모르면서 2점을 줄 수 없다.
       */
      if (win !== null) {
        const rdNo = Number((arr[0] as Kill).rd)
        for (const plant of plantsByMatch.get(mk) ?? []) {
          if (plant.round !== rdNo) continue
          const P = whoOf(mk, plant.usn)
          if (!P) continue
          const onB = sideZones.b !== null && inZone(
            sideZones.b,
            plant.x === null || plant.y === null ? null : { x: plant.x, y: plant.y },
          )
          const mine = teamOf.get(plant.usn) ?? null
          const bp = bombScore(mine !== null && mine === win, onB)
          const t = tallyOf(mk, P.pid)
          t.score += bp
          t.scoreLog.push({
            r: rdNo,
            k: mine !== null && mine === win ? 'bombWin' : (onB ? 'bombLossB' : 'bombLoss'),
            p: bp,
          })
        }
      }

      const sawOut = new Set<string>()
      const sawAlone = new Set<string>()
      /** 그 라운드에 ★몇 명 모자랐나★ — 세이브 점수(2n−1)의 재료 */
      const shortBy = new Map<string, number>()
      for (const e of arr) {
        const vt = teamOf.get(e.victim)
        if (vt !== undefined) alive.get(vt)?.delete(e.victim)
        const na = (alive.get(tA) as Set<string>).size
        const nb = (alive.get(tB) as Set<string>).size

        /*
         * ★세이브는 상대 수를 안 본다★ (2026-09-15 사장님:
         * «1대1세이브같은경우에 무조건 두팀중 한명은 세이브인데»).
         *
         * ⚠ 옛 판은 세이브와 소수싸움을 ★한 줄에서★ 셌다. 그래서 «수가 같으면
         *   건너뛴다» 가 세이브에도 걸려 ★1대1 이 통째로 빠졌다.★
         *   1대1 은 ★이길 확률이 가장 높은 세이브★ 라, 빠지니 승률이 절반이 됐다 —
         *   실측 개인 6.7% vs 클랜 14.5%. `roundState.ts` 주석은 처음부터
         *   «1대1 이든 1대5 든 전부 세이브» 라고 말하고 있었는데 구현이 안 따랐다.
         *
         * 혼자 남았으면 ★양 팀 다 따로★ 센다 — 1대1 이면 두 사람 다 세이브 상황이다.
         */
        /*
         * ★몇 명 열세였나★ 를 같이 기억한다 — 세이브 점수가 2n−1 이라 인원이 필요하다
         * (2026-09-18 사장님). 더 나쁜 상황을 만났으면 그 값으로 덮는다.
         */
        /*
         * ⚠ ★1대1 도 1점이다★ (2026-09-18 사장님: 「어떤건 세이브했는데도 아예 안뜲」).
         *
         *   옛 판은 `nb - na` 를 그대로 썼다. 1대1 이면 ★0★ 이라 `saveScore(0) = 0` 이 되어
         *   ★MVP 설명에 한 줄도 안 남았다.★ 그런데 명단에는 「1/1」 로 세어져 있었다 —
         *   ★같은 세이브를 두 곳이 다르게 세고 있었다.★
         *
         *   세이브 점수는 ★1명 열세 1점 · 2명 3점 · 3명 5점★ (사장님 확정)이고,
         *   1대1 은 «상대보다 한 명 적지는 않지만 혼자 남은» 자리라 ★1점★ 이 맞다.
         *   그래서 ★최소 1★ 로 둔다 — 명단의 `aloneWon` 과 정확히 짝이 맞는다.
         */
        if (na === 1) {
          for (const u of alive.get(tA) as Set<string>) {
            sawAlone.add(u)
            shortBy.set(u, Math.max(shortBy.get(u) ?? 0, Math.max(1, nb - na)))
          }
        }
        if (nb === 1) {
          for (const u of alive.get(tB) as Set<string>) {
            sawAlone.add(u)
            shortBy.set(u, Math.max(shortBy.get(u) ?? 0, Math.max(1, na - nb)))
          }
        }

        /* 소수싸움은 ★밀릴 때만★ 이다 — 수가 같으면 우리가 밀린 게 아니다 */
        if (na === nb) continue
        const few = alive.get(na < nb ? tA : tB) as Set<string>
        for (const u of few) sawOut.add(u)
      }
      for (const u of sawOut) {
        const W = whoOf(mk, u)
        if (!W) continue
        const t = tallyOf(mk, W.pid)
        t.outRounds += 1
        if (teamOf.get(u) === win) t.outWon += 1
      }
      /*
       * ★공격·수비 라운드 수★ — 평균의 뜻을 지키려면 «몇 판 중» 을 알아야 한다.
       * ⚠ 점수를 못 딴 라운드도 센다 — 0점도 그 판의 성적이다.
       */
      {
        const rdNo2 = Number(roundKey.split('|')[1])
        const defTeam2 = Number.isInteger(rdNo2) ? defenceOf.get(mk)?.get(rdNo2) : undefined
        if (defTeam2 !== undefined) {
          for (const pid of seen) {
            const t2 = tallyOf(mk, pid)
            const myTeam = [...teamOf.entries()].find(([usn]) => whoOf(mk, usn)?.pid === pid)?.[1]
            if (myTeam === undefined) continue
            if (myTeam === defTeam2) t2.defRounds += 1
            else t2.atkRounds += 1
          }
        }
      }

      for (const u of sawAlone) {
        const W = whoOf(mk, u)
        if (!W) continue
        const t = tallyOf(mk, W.pid)
        t.aloneRounds += 1
        if (teamOf.get(u) === win) {
          t.aloneWon += 1
          /*
           * ★세이브 점수★ — 1명 열세 1점 · 2명 3점 · 3명 5점 (2026-09-18 사장님).
           * ⚠ `fewScore` 에도 같이 담는다 — ★소수싸움은 평균★ · ★세이브는 총합★ 으로
           *   줄을 세우기 때문에 같은 재료를 두 축이 다르게 접는다.
           */
          const n = shortBy.get(u) ?? 1
          const sp = saveScore(n)
          t.score += sp
          t.fewScore += sp
          t.scoreLog.push({ r: Number(roundKey.split('|')[1]) || 0, k: 'save' + n, p: sp })
        }
      }
    }

    const weaponOf = new Map<string, number | null>()
    for (const [key, w] of who) {
      const [k] = key.split('|') as [string]
      weaponOf.set(`${k}|${w.pid}`, w.weapon)
    }
    const rows = [...tallies.entries()].map(([id, t]) => {
      const [k, pid] = id.split('|') as [string, string]
      return {
        matchId: matchIdOfKey.get(k) as string,
        playerId: pid,
        weapon: weaponOf.get(id) ?? null,
        ...t,
        formulaVersion: PLAYER_HEX_FORMULA_VERSION,
      }
    })
    result.matches += part.length
    const mvpPicks = await pickMvps(ids, rows)
    result.mvpAssigned += mvpPicks.length
    if (options.confirm && mvpPicks.length > 0) {
      for (const pick of mvpPicks) {
        await prisma.$transaction([
          prisma.matchPlayerStat.updateMany({ where: { matchId: pick.matchId, mvp: true }, data: { mvp: false } }),
          prisma.matchPlayerStat.updateMany({ where: { matchId: pick.matchId, playerId: pick.playerId }, data: { mvp: true } }),
          prisma.match.update({ where: { id: pick.matchId }, data: { mvpPlayerId: pick.playerId } }),
        ])
      }
    }
    if (options.confirm && rows.length > 0) {
      await prisma.$transaction([
        prisma.matchPlayerHex.deleteMany({ where: { matchId: { in: ids } } }),
        prisma.matchPlayerHex.createMany({ data: rows, skipDuplicates: true }),
      ])
    }
    /*
     * ★후반이 시작하는 라운드를 경기에 적는다★ (2026-09-20 사장님:
     *   「mvp설명에 들어가는 라운드에는 ★전반1라운드 후반12라운드★ 이런식으로」).
     *
     *   여기서 이미 구한 값이다 (`switchAt`) — ★화면이 다시 세지 않게★ 저장한다.
     *   둘이 따로 세면 조용히 갈라진다.
     *
     * ⚠ ★못 구한 경기는 안 건드린다★ — `null` 로 덮으면 예전에 채운 값이 지워진다.
     */
    if (options.confirm && secondHalfFromOf.size > 0) {
      for (const [key, from] of secondHalfFromOf) {
        const matchId = matchIdOfKey.get(key)
        if (matchId === undefined) continue
        await prisma.match.update({ where: { id: matchId }, data: { secondHalfFrom: from } }).catch(() => {
          /* 한 경기를 못 써도 집계를 멈추지 않는다 */
        })
      }
      secondHalfFromOf.clear()
    }
    result.matchRows += rows.length
    if ((i / LOG_BATCH) % 5 === 0) log(`  ${Math.min(i + LOG_BATCH, todo.length)} / ${todo.length} 경기 · 킬 ${result.events}`)
  }

  /* ── 2. 접기 ──────────────────────────────────────────────────────────── */
  for (const league of leagues) {
    const tiered = league.divisionCount >= 3
    /* ★인원수 규칙은 IPL 에만★ (2026-09-12 사장님). 다른 리그는 무게를 늘 1 로 둔다 */
    const shortRule = league.slug === 'nolink'
    const minMembers = shortRule ? MIN_MEMBERS : 0
    const shortWeight = shortRule ? SHORT_MEMBER_WEIGHT : 1
    const base = await prisma.$queryRaw<
      {
        lpid: string
        games: number
        wins: number
        sniperg: number
        rifleg: number
        kills: number
        t1: number
        t2: number
        t3: number
        t1w: number
        t2w: number
        t3w: number
        clantier: number | null
      }[]
    >`
      WITH mw AS (
        -- ★인원수 규칙★ (2026-09-12 사장님) — 양 팀 클랜원 합이 모자란 판은 10%만 센다.
        -- IPL 에만 먹인다. 다른 리그는 ${shortRule ? '' : '이 값이 늘 1 이라'} 그대로다
        SELECT m."id" AS mid,
               CASE WHEN COALESCE((
                 SELECT count(*)::int FROM "MatchPlayerStat" st
                  WHERE st."matchId" = m."id"
                    AND st."playerClanId" IS NOT NULL
                    AND st."playerClanId" = CASE WHEN st."side" = 'red' THEN rl."clanId" ELSE bl."clanId" END
               ), 0) >= ${minMembers} THEN 1::float ELSE ${shortWeight}::float END AS w
          FROM "Match" m
          LEFT JOIN "LeagueClan" rl ON rl."id" = m."redLeagueClanId"
          LEFT JOIN "LeagueClan" bl ON bl."id" = m."blueLeagueClanId"
         WHERE m."leagueId" = ${league.id} AND m."supersededAt" IS NULL
      )
      SELECT lp."id" AS lpid,
             SUM(mw.w) AS games,
             SUM(CASE WHEN m."winnerSide" = s."side" THEN mw.w ELSE 0 END) AS wins,
             SUM(CASE WHEN s."weapon" = 1 THEN mw.w ELSE 0 END) AS sniperg,
             SUM(CASE WHEN s."weapon" = 0 THEN mw.w ELSE 0 END) AS rifleg,
             COALESCE(SUM(s."kill" * mw.w), 0) AS kills,
             SUM(CASE WHEN foe."division" = 1 THEN mw.w ELSE 0 END) AS t1,
             SUM(CASE WHEN foe."division" = 2 THEN mw.w ELSE 0 END) AS t2,
             SUM(CASE WHEN foe."division" = 3 THEN mw.w ELSE 0 END) AS t3,
             -- ★구간별 승수★ (2026-09-12 사장님: 승률은 «내 구간» 것을 쓴다)
             SUM(CASE WHEN foe."division" = 1 AND m."winnerSide" = s."side" THEN mw.w ELSE 0 END) AS t1w,
             SUM(CASE WHEN foe."division" = 2 AND m."winnerSide" = s."side" THEN mw.w ELSE 0 END) AS t2w,
             SUM(CASE WHEN foe."division" = 3 AND m."winnerSide" = s."side" THEN mw.w ELSE 0 END) AS t3w,
             MAX(own."division") AS clantier
        FROM "LeaguePlayer" lp
        JOIN "MatchPlayerStat" s ON s."playerId" = lp."playerId"
        JOIN "Match" m ON m."id" = s."matchId" AND m."leagueId" = lp."leagueId"
        JOIN mw ON mw."mid" = m."id"
        LEFT JOIN "LeagueClan" foe ON foe."id" =
          CASE WHEN s."side" = 'red' THEN m."blueLeagueClanId" ELSE m."redLeagueClanId" END
        LEFT JOIN "LeagueClan" own ON own."leagueId" = lp."leagueId" AND own."clanId" = lp."clanId"
       WHERE lp."leagueId" = ${league.id}
         AND m."supersededAt" IS NULL AND m."startAt" >= ${SEASON0_FROM}
         AND (s."participantRole" IS NULL OR s."participantRole" <> 'dropout')
       GROUP BY lp."id"`
    const hex = await prisma.$queryRaw<
      {
        lpid: string
        rounds: number
        firstkills: number
        crackkills: number
        /* ★점수제 재료★ (2026-09-18) */
        atkscore: number
        atkrounds: number
        defscore: number
        defrounds: number
        crackscore: number
        fewscore: number
        burstrounds: number
        alonerounds: number
        alonewon: number
        outrounds: number
        outwon: number
        maxroundkills: number
        evenkills: number
        tradekills: number
        matedeaths: number
        sduelwon: number
        sduellost: number
        rduelwon: number
        rduellost: number
        deathseconds: number
        deathcount: number
        temposeconds: number
        tempocount: number
        openrounds: number
        foeopenrounds: number
        cutrounds: number
        aliverounds: number
        aatkn: number
        aatkok: number
        adefn: number
        adefok: number
        batkn: number
        batkok: number
        bdefn: number
        bdefok: number
        f2atkn: number
        f2atkok: number
        f2defn: number
        f2defok: number
        shortatkn: number
        shortatkok: number
        shortdefn: number
        shortdefok: number
        seatspots: number
        seatbspots: number
        seatf2spots: number
        seatshortspots: number
        sniperkills: number
      }[]
    >`
      WITH mw AS (
        -- ★인원수 규칙★ (2026-09-12 사장님) — 양 팀 클랜원 합이 모자란 판은 10%만 센다.
        -- IPL 에만 먹인다. 다른 리그는 ${shortRule ? '' : '이 값이 늘 1 이라'} 그대로다
        SELECT m."id" AS mid,
               CASE WHEN COALESCE((
                 SELECT count(*)::int FROM "MatchPlayerStat" st
                  WHERE st."matchId" = m."id"
                    AND st."playerClanId" IS NOT NULL
                    AND st."playerClanId" = CASE WHEN st."side" = 'red' THEN rl."clanId" ELSE bl."clanId" END
               ), 0) >= ${minMembers} THEN 1::float ELSE ${shortWeight}::float END AS w
          FROM "Match" m
          LEFT JOIN "LeagueClan" rl ON rl."id" = m."redLeagueClanId"
          LEFT JOIN "LeagueClan" bl ON bl."id" = m."blueLeagueClanId"
         WHERE m."leagueId" = ${league.id} AND m."supersededAt" IS NULL
      )
      SELECT lp."id" AS lpid,
             SUM(h."rounds" * mw.w) AS rounds,
             SUM(h."firstKills" * mw.w) AS firstkills,
             -- ★크랙 성공★ — 칠한 구역 안 25초 첫 킬 (2026-09-16). 값은 판수로 나눈다
             SUM(h."crackKills" * mw.w) AS crackkills,
             -- ★점수제 재료★ (2026-09-18 사장님: 「개인육각도 점수제로 줄세워서 다시 측정해」)
             SUM(h."atkScore" * mw.w) AS atkscore,
             SUM(h."atkRounds" * mw.w) AS atkrounds,
             SUM(h."defScore" * mw.w) AS defscore,
             SUM(h."defRounds" * mw.w) AS defrounds,
             SUM(h."crackScore" * mw.w) AS crackscore,
             SUM(h."fewScore" * mw.w) AS fewscore,
             SUM(h."burstRounds" * mw.w) AS burstrounds,
             -- ★게임영향력★ (2026-09-15 사장님) — 경기마다의 «한 라운드 최대 킬» 을 더한다.
             -- 시즌 값은 이걸 판수로 나눈 ★평균★ 이다. 시즌 최대를 쓰면 거의 전원이
             -- 4~5킬(80~100%)로 몰려 줄이 안 선다.
             SUM(h."maxRoundKills" * mw.w) AS maxroundkills,
             -- ★게임영향력★ — «우위를 만든 킬» 의 합. 값은 이걸 라운드로 나눈다
             SUM(h."evenKills" * mw.w) AS evenkills,
             -- ★교환율★ — 동료가 죽은 직후 그 킬러를 되잡은 횟수 / 동료가 죽은 횟수
             SUM(h."tradeKills" * mw.w) AS tradekills,
             SUM(h."mateDeaths" * mw.w) AS matedeaths,
             SUM(h."deathSeconds" * mw.w) AS deathseconds,
             SUM(h."deathCount" * mw.w) AS deathcount,
             -- ★게임템포★ — 라운드마다 «먼저 겪은 일» 까지의 초 (2026-09-16)
             SUM(h."tempoSeconds" * mw.w) AS temposeconds,
             SUM(h."tempoCount" * mw.w) AS tempocount,
             -- ★개인 새 6축★ (2026-09-16 밤) — 기회창출 · 기회차단 · 안전함
             SUM(h."openRounds" * mw.w)    AS openrounds,
             SUM(h."foeOpenRounds" * mw.w) AS foeopenrounds,
             SUM(h."cutRounds" * mw.w)     AS cutrounds,
             SUM(h."aliveRounds" * mw.w)   AS aliverounds,
             SUM(h."aloneRounds" * mw.w) AS alonerounds,
             SUM(h."aloneWon" * mw.w) AS alonewon,
             SUM(h."outRounds" * mw.w) AS outrounds,
             SUM(h."outWon" * mw.w) AS outwon,
             SUM(CASE WHEN h."weapon" = 1 THEN h."duelWon" * mw.w ELSE 0 END) AS sduelwon,
             SUM(CASE WHEN h."weapon" = 1 THEN h."duelLost" * mw.w ELSE 0 END) AS sduellost,
             SUM(CASE WHEN h."weapon" = 0 THEN h."duelWon" * mw.w ELSE 0 END) AS rduelwon,
             SUM(CASE WHEN h."weapon" = 0 THEN h."duelLost" * mw.w ELSE 0 END) AS rduellost,
             /*
              * ★구역별 어택/방어 · 자리 재료★ (2026-09-17 사장님).
              *
              * ⚠ ★티어 가중치 mw.w 를 안 곱한다★ — 다른 축과 다르다. 일부러다.
              *   이 칸들은 «몇 라운드를 쟀나» 라 화면이 ★분모가 10 미만이면 «측정중»★ 으로
              *   거른다. 가중치를 곱하면 그 수가 소수가 되어 «몇 라운드» 가 아니게 된다.
              *   구역을 뚫었나 못 뚫었나는 상대 티어와도 상관이 없다.
              */
             SUM(h."aAtkN") AS aatkn,
             SUM(h."aAtkOk") AS aatkok,
             SUM(h."aDefN") AS adefn,
             SUM(h."aDefOk") AS adefok,
             SUM(h."bAtkN") AS batkn,
             SUM(h."bAtkOk") AS batkok,
             SUM(h."bDefN") AS bdefn,
             SUM(h."bDefOk") AS bdefok,
             SUM(h."f2AtkN") AS f2atkn,
             SUM(h."f2AtkOk") AS f2atkok,
             SUM(h."f2DefN") AS f2defn,
             SUM(h."f2DefOk") AS f2defok,
             SUM(h."shortAtkN") AS shortatkn,
             SUM(h."shortAtkOk") AS shortatkok,
             SUM(h."shortDefN") AS shortdefn,
             SUM(h."shortDefOk") AS shortdefok,
             SUM(h."seatSpots") AS seatspots,
             SUM(h."seatBSpots") AS seatbspots,
             SUM(h."seatF2Spots") AS seatf2spots,
             SUM(h."seatShortSpots") AS seatshortspots,
             SUM(h."sniperKills") AS sniperkills
        FROM "LeaguePlayer" lp
        JOIN "MatchPlayerHex" h ON h."playerId" = lp."playerId"
        JOIN "Match" m ON m."id" = h."matchId" AND m."leagueId" = lp."leagueId"
        JOIN mw ON mw."mid" = m."id"
       WHERE lp."leagueId" = ${league.id} AND h."formulaVersion" = ${PLAYER_HEX_FORMULA_VERSION}
         AND m."supersededAt" IS NULL
       GROUP BY lp."id"`
    /*
     * ── ★스나차이 · 라플차이★ — «앞선 판» 세기 (2026-09-16 밤 사장님) ──
     *
     *   클랜 육각이 경기마다 무기별 점수를 이미 쌓아 두었다 (`tally.gapScore`).
     *   ★다시 세지 않고 읽는다★ — 두 곳에서 세면 갈린다.
     *
     *   선수가 그 경기에서 어느 클랜이었는지는 `MatchPlayerStat.playerClanId` 가 안다.
     *   그 클랜의 줄에서 `ourSniper > foeSniper` 면 «스나 쪽이 앞섰다» 이다.
     *
     *   ⚠ 클랜 육각이 아직 v5 로 안 돌았으면 여기서 아무것도 안 나온다 —
     *     그때는 축이 `null` 이고 화면이 «측정중» 이라 적는다 (0% 로 안 우긴다).
     */
    const gapRows = await prisma.$queryRaw<{ lpid: string; sniperahead: bigint; rifleahead: bigint; games: bigint }[]>`
      SELECT lp."id" AS lpid,
             /*
              * ⚠ ★COUNT(DISTINCT) 이어야 한다★ — 처음엔 COUNT(*) 로 셀다가
              *   한 경기에 같은 선수 줄이 여럿이면 두 번 세졌다.
              *   그 탓에 ★137%★ 같은 값이 나왔다 (분모는 DISTINCT 였다).
              */
             COUNT(DISTINCT m."id") FILTER (
               WHERE (h."tally"->'gapScore'->>'ourSniper')::float
                   > (h."tally"->'gapScore'->>'foeSniper')::float
             ) AS sniperahead,
             COUNT(DISTINCT m."id") FILTER (
               WHERE (h."tally"->'gapScore'->>'ourRifle')::float
                   > (h."tally"->'gapScore'->>'foeRifle')::float
             ) AS rifleahead,
             COUNT(DISTINCT m."id") AS games
        FROM "LeaguePlayer" lp
        JOIN "MatchPlayerStat" s ON s."playerId" = lp."playerId"
        JOIN "Match" m ON m."id" = s."matchId" AND m."leagueId" = lp."leagueId"
        /*
         * ★클랜 표를 거치지 않는다★ — 그 선수가 어느 쪽이었는지는 side 가 바로 말해 준다.
         *   처음엔 LeagueClan 을 OR 로 이었다가 ★질의가 타임아웃★ 났다.
         */
        JOIN "MatchClanHexV2" h
          ON h."matchId" = m."id"
         AND h."leagueClanId" = CASE WHEN s."side" = 'red' THEN m."redLeagueClanId" ELSE m."blueLeagueClanId" END
         AND h."formulaVersion" = ${CLAN_HEX_V2_FORMULA_VERSION}
       WHERE lp."leagueId" = ${league.id}
         AND m."supersededAt" IS NULL AND m."startAt" >= ${SEASON0_FROM}
         AND h."tally"->'gapScore' IS NOT NULL
       GROUP BY lp."id"`
    const gapOf = new Map(gapRows.map((r) => [r.lpid, r]))

    /**
     * ★구간 × 무기 킬·데스★ (2026-09-12 사장님) — 점수의 킬뎃 몫이 쓴다.
     * 칸을 열여덟 개 늘리는 대신 작은 질의 하나를 더 둔다. 한 리그에 수천 줄이다.
     */
    const tw = await prisma.$queryRaw<
      { lpid: string; tier: number | null; wp: number | null; g: number; k: number; d: number }[]
    >`
      SELECT lp."id" AS lpid, foe."division" AS tier, s."weapon" AS wp,
             COUNT(s.*)::int AS g,
             COALESCE(SUM(s."kill"), 0)::int AS k,
             COALESCE(SUM(s."death"), 0)::int AS d
        FROM "LeaguePlayer" lp
        JOIN "MatchPlayerStat" s ON s."playerId" = lp."playerId"
        JOIN "Match" m ON m."id" = s."matchId" AND m."leagueId" = lp."leagueId"
        LEFT JOIN "LeagueClan" foe ON foe."id" =
          CASE WHEN s."side" = 'red' THEN m."blueLeagueClanId" ELSE m."redLeagueClanId" END
       WHERE lp."leagueId" = ${league.id}
         AND m."supersededAt" IS NULL AND m."startAt" >= ${SEASON0_FROM}
         AND s."kill" IS NOT NULL AND s."death" IS NOT NULL
         AND (s."participantRole" IS NULL OR s."participantRole" <> 'dropout')
       GROUP BY lp."id", foe."division", s."weapon"`
    const twOf = new Map<string, typeof tw>()
    for (const row of tw) {
      const list = twOf.get(row.lpid) ?? []
      list.push(row)
      twOf.set(row.lpid, list)
    }
    /**
     * ★내 구간 + 내 무기 킬뎃★ — 표본이 모자라면 한 칸씩 넓힌다.
     *   ① 내 구간 · 내 무기 (10판 이상)  ② 내 구간 전체 (10판 이상)  ③ 시즌 전체
     * 셋 다 모자라면 `null` — 여섯 축 값으로 대신한다 (지어내지 않는다).
     */
    const kdRateOf = (lpid: string, homeTier: TierNo | null, weapon: 0 | 1 | null): number | null => {
      const list = twOf.get(lpid) ?? []
      const sum = (f: (r: (typeof list)[number]) => boolean) => {
        let g = 0, k = 0, d = 0
        for (const r of list) if (f(r)) { g += r.g; k += r.k; d += r.d }
        return { g, k, d }
      }
      const pick =
        homeTier !== null && weapon !== null && sum((r) => r.tier === homeTier && r.wp === weapon).g >= MIN_HOME_TIER_GAMES
          ? sum((r) => r.tier === homeTier && r.wp === weapon)
          : homeTier !== null && sum((r) => r.tier === homeTier).g >= MIN_HOME_TIER_GAMES
            ? sum((r) => r.tier === homeTier)
            : sum(() => true)
      return pick.k + pick.d > 0 ? Math.round((pick.k / (pick.k + pick.d)) * 1000) / 10 : null
    }

    const hexOf = new Map(hex.map((h) => [h.lpid, h]))
    const inputs: PlayerHexInput[] = base.map((b) => {
      const h = hexOf.get(b.lpid)
      const asTier = (n: number | null): TierNo | null => (tiered && (n === 1 || n === 2 || n === 3) ? n : null)
      return {
        leaguePlayerId: b.lpid,
        games: b.games,
        wins: b.wins,
        sniperGames: b.sniperg,
        rifleGames: b.rifleg,
        kills: b.kills,
        tierGames: tiered ? { 1: b.t1, 2: b.t2, 3: b.t3 } : { 1: 0, 2: 0, 3: 0 },
        tierWins: tiered ? { 1: b.t1w, 2: b.t2w, 3: b.t3w } : { 1: 0, 2: 0, 3: 0 },
        /* ★내 구간 + 내 무기 킬뎃★ (2026-09-12 사장님) */
        kdRate: kdRateOf(b.lpid, tiered ? homeTierOf({ 1: b.t1, 2: b.t2, 3: b.t3 }) : null, mainWeaponOf({ sniperGames: b.sniperg, rifleGames: b.rifleg })),
        clanTier: asTier(b.clantier),
        rounds: h?.rounds ?? 0,
        firstKills: h?.firstkills ?? 0,
        crackKills: h?.crackkills ?? 0,
        /* ★점수제 재료★ (2026-09-18 사장님) */
        atkScore: h?.atkscore ?? 0,
        atkRounds: h?.atkrounds ?? 0,
        defScore: h?.defscore ?? 0,
        defRounds: h?.defrounds ?? 0,
        crackScore: h?.crackscore ?? 0,
        fewScore: h?.fewscore ?? 0,
        /* ★구역별 어택/방어 · 자리 재료★ (2026-09-17 사장님) */
        aAtkN: Number(h?.aatkn ?? 0),
        aAtkOk: Number(h?.aatkok ?? 0),
        aDefN: Number(h?.adefn ?? 0),
        aDefOk: Number(h?.adefok ?? 0),
        bAtkN: Number(h?.batkn ?? 0),
        bAtkOk: Number(h?.batkok ?? 0),
        bDefN: Number(h?.bdefn ?? 0),
        bDefOk: Number(h?.bdefok ?? 0),
        f2AtkN: Number(h?.f2atkn ?? 0),
        f2AtkOk: Number(h?.f2atkok ?? 0),
        f2DefN: Number(h?.f2defn ?? 0),
        f2DefOk: Number(h?.f2defok ?? 0),
        shortAtkN: Number(h?.shortatkn ?? 0),
        shortAtkOk: Number(h?.shortatkok ?? 0),
        shortDefN: Number(h?.shortdefn ?? 0),
        shortDefOk: Number(h?.shortdefok ?? 0),
        seatSpots: Number(h?.seatspots ?? 0),
        seatBSpots: Number(h?.seatbspots ?? 0),
        seatF2Spots: Number(h?.seatf2spots ?? 0),
        seatShortSpots: Number(h?.seatshortspots ?? 0),
        sniperKills: Number(h?.sniperkills ?? 0),
        ...seatOf(b, h),
        /*
         * ★스나차이 · 라플차이★ — 그 선수 무기 쪽이 앞선 판 수 (2026-09-16 밤).
         *   무기를 모르면 셀 수 없다 — 그때는 `undefined` 라 축이 `null` 이 된다.
         */
        gapWinGames: (() => {
          const g = gapOf.get(b.lpid)
          if (g === undefined) return undefined
          const w = mainWeaponOf({ sniperGames: b.sniperg, rifleGames: b.rifleg })
          if (w === null) return undefined
          return Number(w === 1 ? g.sniperahead : g.rifleahead)
        })(),
        burstRounds: h?.burstrounds ?? 0,
        /* 경기별 «한 라운드 최대 킬» 의 합 — 값은 판수로 나눠 평균을 낸다 (2026-09-15) */
        maxRoundKills: h?.maxroundkills ?? 0,
        evenKills: h?.evenkills ?? 0,
        tradeKills: h?.tradekills ?? 0,
        mateDeaths: h?.matedeaths ?? 0,
        deathSeconds: h?.deathseconds ?? 0,
        deathCount: h?.deathcount ?? 0,
        tempoSeconds: h?.temposeconds ?? 0,
        tempoCount: h?.tempocount ?? 0,
        openRounds: h?.openrounds ?? 0,
        foeOpenRounds: h?.foeopenrounds ?? 0,
        cutRounds: h?.cutrounds ?? 0,
        aliveRounds: h?.aliverounds ?? 0,
        aloneRounds: h?.alonerounds ?? 0,
        aloneWon: h?.alonewon ?? 0,
        outRounds: h?.outrounds ?? 0,
        outWon: h?.outwon ?? 0,
        sniperDuelWon: h?.sduelwon ?? 0,
        sniperDuelLost: h?.sduellost ?? 0,
        rifleDuelWon: h?.rduelwon ?? 0,
        rifleDuelLost: h?.rduellost ?? 0,
      }
    })
    const folded = foldPlayerHex(inputs)
    const inputOf = new Map(inputs.map((p) => [p.leaguePlayerId, p]))
    result.pools[league.slug] = {
      sniper: folded.filter((r) => r.weapon === 1).length,
      rifle: folded.filter((r) => r.weapon === 0).length,
      unmeasured: folded.filter((r) => r.weapon === null).length,
    }
    if (!options.confirm) continue
    for (const r of folded) {
      const p = inputOf.get(r.leaguePlayerId) as PlayerHexInput
      const data = {
        weapon: r.weapon,
        games: p.games,
        weaponGames: r.weaponGames,
        wins: p.wins,
        rounds: p.rounds,
        save: r.axes.save.value, savePct: r.axes.save.pct, saveRank: r.axes.save.rank, saveTotal: r.axes.save.total,
        duel: r.axes.duel.value, duelPct: r.axes.duel.pct, duelRank: r.axes.duel.rank, duelTotal: r.axes.duel.total,
        /* ★기회창출 / 기회차단★ — DB 칸은 `carry*` 그대로 (2026-09-16 밤) */
        carry: r.axes.chance.value, carryPct: r.axes.chance.pct, carryRank: r.axes.chance.rank, carryTotal: r.axes.chance.total,
        /* ⚠ ★DB 칸 이름은  그대로다★ — 2026-09-16 에 축이 «평균 사망 시간»
           으로 바뀌었지만 칸을 갈면 마이그레이션이 커진다. 어느 판의 값인지는
            이 가른다. 화면에는 칸 이름이 안 나간다 */
        /* ★안전함 / 크랙★ — DB 칸은 `opening*` 그대로 */
        opening: r.axes.safe.value, openingPct: r.axes.safe.pct, openingRank: r.axes.safe.rank, openingTotal: r.axes.safe.total,
        /* ⚠ ★DB 칸 이름은 `burst*` 그대로다★ — 2026-09-16 에 ⑤ 가 «크랙 성공» 이 됐지만
           칸을 갈면 마이그레이션이 커진다. 어느 판인지는 `formulaVersion` 이 가른다 */
        /* ★스나차이 / 라플차이★ — DB 칸은 `burst*` 그대로 */
        burst: r.axes.gap.value, burstPct: r.axes.gap.pct, burstRank: r.axes.gap.rank, burstTotal: r.axes.gap.total,
        outnumbered: r.axes.outnumbered.value, outnumberedPct: r.axes.outnumbered.pct,
        outnumberedRank: r.axes.outnumbered.rank, outnumberedTotal: r.axes.outnumbered.total,
        winRate: r.winRate.value, winRatePct: r.winRate.pct, winRateRank: r.winRate.rank, winRateTotal: r.winRate.total,
        hex: r.hex,
        tierFactor: r.tierFactor,
        shrink: r.shrink,
        clanBonus: r.clanBonus,
        score: r.score,
        scoreRank: r.scoreRank,
        scoreTotal: r.scoreTotal,
        duelWon: r.duelWon,
        duelLost: r.duelLost,
        aloneRounds: p.aloneRounds,
        aloneWon: p.aloneWon,
        outRounds: p.outRounds,
        outWon: p.outWon,
        firstKills: p.firstKills,
        crackKills: p.crackKills,
        gapWinGames: p.gapWinGames ?? 0,
        /* ★구역별 어택/방어 · 자리 재료★ (2026-09-17 사장님) */
        aAtkN: p.aAtkN ?? 0,
        aAtkOk: p.aAtkOk ?? 0,
        aDefN: p.aDefN ?? 0,
        aDefOk: p.aDefOk ?? 0,
        bAtkN: p.bAtkN ?? 0,
        bAtkOk: p.bAtkOk ?? 0,
        bDefN: p.bDefN ?? 0,
        bDefOk: p.bDefOk ?? 0,
        f2AtkN: p.f2AtkN ?? 0,
        f2AtkOk: p.f2AtkOk ?? 0,
        f2DefN: p.f2DefN ?? 0,
        f2DefOk: p.f2DefOk ?? 0,
        shortAtkN: p.shortAtkN ?? 0,
        shortAtkOk: p.shortAtkOk ?? 0,
        shortDefN: p.shortDefN ?? 0,
        shortDefOk: p.shortDefOk ?? 0,
        seatSpots: p.seatSpots ?? 0,
        seatBSpots: p.seatBSpots ?? 0,
        seatF2Spots: p.seatF2Spots ?? 0,
        seatShortSpots: p.seatShortSpots ?? 0,
        sniperKills: p.sniperKills ?? 0,
        /*
         * ★그 선수의 자리★ — 시즌 합으로 한 번만 정한다. 경기 하나로 정하면 흔들린다 (최빈 69.8%).
         * 30경기 미만이거나 1·2위가 1.1배 안쪽이면 ★이름을 안 붙인다★ (null / all).
         * 개인 육각은 이 칸을 안 본다 — 화면 이름표용이다.
         */
        seat: p.seat ?? null,
        seatRatio: p.seatRatio ?? null,
        /* 게임템포의 재료 — 화면은 접힌 값(`opening`)을 읽지만 원시 합도 남겨 둔다 */
        tempoSeconds: p.tempoSeconds,
        tempoCount: p.tempoCount,
        /* ★개인 새 6축 재료★ (2026-09-16 밤 사장님) */
        openRounds: p.openRounds,
        foeOpenRounds: p.foeOpenRounds,
        cutRounds: p.cutRounds,
        aliveRounds: p.aliveRounds,
        burstRounds: p.burstRounds,
        /* ★내 구간★ — 가장 많이 뛴 티어 (2026-09-11 사장님). 구간별 랭킹이 이 칸을 거른다 */
        homeTier: homeTierOf(p.tierGames),
        tier1Games: p.tierGames[1],
        tier2Games: p.tierGames[2],
        tier3Games: p.tierGames[3],
        formulaVersion: PLAYER_HEX_FORMULA_VERSION,
      }
      await prisma.leaguePlayerHex.upsert({
        where: { leaguePlayerId: r.leaguePlayerId },
        create: { leaguePlayerId: r.leaguePlayerId, ...data },
        update: data,
      })
      result.playerRows += 1
    }
    log(`${league.slug} — 스나 ${result.pools[league.slug]?.sniper} · 라플 ${result.pools[league.slug]?.rifle} · 미측정 ${result.pools[league.slug]?.unmeasured}`)
  }
  return result
}

/* ────────────────────────────────────────────────────────────────────────── */
/* ★MVP 규칙★ (2026-09-11 · 사장님 확정)                                          */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * 원본 자료에 MVP 가 없는 경기(IPL 병영 로그 전부 · SPL 일부)에서 규칙으로 MVP 를 정한다.
 *
 *   후보   = ★이긴 팀★ 선수 (목업: 진 팀에는 MVP 없음)
 *   1순위  = 세이브(혼자 남아 이긴 라운드) 2회 이상 → 무조건. 여럿이면 세이브 많은 쪽
 *   2순위  = 킬 많은 순 → 같으면 데스 적은 순
 *   그래도 같으면 무작위 — 단 «경기마다 고정된 무작위» (경기·선수 id 해시) 라 새로고침해도 안 바뀐다
 *
 * 원본 MVP 가 있는 경기(`MatchPlayerStat.mvp = true` 가 하나라도 있으면)는 손대지 않는다.
 * 세이브가 이 규칙에 들어가므로 `MatchPlayerHex` 를 센 뒤에 정한다.
 */
export const MVP_SAVE_THRESHOLD = 2

function stableHash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h
}

export interface MvpCandidate {
  playerId: string
  saves: number
  kill: number | null
  death: number | null
  /** ★그 경기에서 번 점수★ (2026-09-18). 모르면 `null` — 그때는 옛 규칙으로 떨어진다 */
  score?: number | null
}

/**
 * ★MVP 는 그 경기 점수 1등★ (2026-09-18 사장님).
 *
 * > «이제 엠브이피도 이 점수 젤 높은애로 주고»
 *
 * 점수는 `matchScore.ts` 가 정한 값을 `MatchPlayerHex.score` 에 쌓아 둔 것이다.
 * ⚠ ★점수를 모르는 경기는 옛 규칙으로 떨어진다★ — 배틀로그가 없으면 점수가 없다.
 *   그런 경기까지 MVP 를 비워 두면 화면에서 칸이 사라진다. 옛 규칙은 `pickMvpV1` 이다.
 * ⚠ 같은 점수면 ★킬 많은 쪽 → 덜 죽은 쪽 → 붙박이 해시★ 로 가른다 (같은 입력이면 같은 답).
 */
export function pickMvp(matchId: string, candidates: readonly MvpCandidate[]): string | null {
  if (candidates.length === 0) return null
  const anyScore = candidates.some((c) => typeof c.score === 'number')
  if (!anyScore) return pickMvpV1(matchId, candidates)
  const sorted = [...candidates].sort((a, b) => {
    const as = a.score ?? -1
    const bs = b.score ?? -1
    if (as !== bs) return bs - as
    const ak = a.kill ?? -1
    const bk = b.kill ?? -1
    if (ak !== bk) return bk - ak
    const ad = a.death ?? Number.MAX_SAFE_INTEGER
    const bd = b.death ?? Number.MAX_SAFE_INTEGER
    if (ad !== bd) return ad - bd
    return stableHash(`${matchId}|${a.playerId}`) - stableHash(`${matchId}|${b.playerId}`)
  })
  return (sorted[0] as MvpCandidate).playerId
}

/**
 * ⚠ ★옛 MVP 규칙★ — 2026-09-18 까지 쓰던 판 (`CLAUDE.md` 1-4).
 *   세이브(문턱 이상) → 킬 → 데스 → 해시. ★점수를 모르는 경기가 이걸 쓴다.★
 */
export function pickMvpV1(matchId: string, candidates: readonly MvpCandidate[]): string | null {
  if (candidates.length === 0) return null
  const sorted = [...candidates].sort((a, b) => {
    const aSave = a.saves >= MVP_SAVE_THRESHOLD ? a.saves : 0
    const bSave = b.saves >= MVP_SAVE_THRESHOLD ? b.saves : 0
    if (aSave !== bSave) return bSave - aSave
    const ak = a.kill ?? -1
    const bk = b.kill ?? -1
    if (ak !== bk) return bk - ak
    const ad = a.death ?? Number.MAX_SAFE_INTEGER
    const bd = b.death ?? Number.MAX_SAFE_INTEGER
    if (ad !== bd) return ad - bd
    return stableHash(`${matchId}|${a.playerId}`) - stableHash(`${matchId}|${b.playerId}`)
  })
  return (sorted[0] as MvpCandidate).playerId
}

async function pickMvps(
  matchIds: readonly string[],
  hexRows: readonly { matchId: string; playerId: string; aloneWon: number; score: number }[],
): Promise<{ matchId: string; playerId: string }[]> {
  if (matchIds.length === 0) return []
  const matches = await prisma.match.findMany({
    where: { id: { in: [...matchIds] } },
    select: {
      id: true,
      winnerSide: true,
      stats: { select: { playerId: true, side: true, kill: true, death: true, mvp: true } },
    },
  })
  const savesOf = new Map(hexRows.map((r) => [`${r.matchId}|${r.playerId}`, r.aloneWon]))
  /* ★점수★ — MVP 를 이걸로 정한다 (2026-09-18 사장님) */
  const scoreOf = new Map(hexRows.map((r) => [`${r.matchId}|${r.playerId}`, r.score]))
  const out: { matchId: string; playerId: string }[] = []
  for (const m of matches) {
    if (m.winnerSide !== 'red' && m.winnerSide !== 'blue') continue
    /* 원본 MVP 가 있으면 그대로 둔다 — 단, 규칙으로 정한 것은 다시 정해도 된다 (같은 규칙이면 같은 답) */
    const hasSourceMvp = m.stats.some((s) => s.mvp === true) && !RULE_MVP_LEAGUES_REPICK
    if (hasSourceMvp) continue
    const winners = m.stats.filter((s) => s.side === m.winnerSide)
    const pick = pickMvp(m.id, winners.map((s) => ({
      playerId: s.playerId,
      saves: savesOf.get(`${m.id}|${s.playerId}`) ?? 0,
      kill: s.kill,
      death: s.death,
      score: scoreOf.get(`${m.id}|${s.playerId}`) ?? null,
    })))
    if (pick) out.push({ matchId: m.id, playerId: pick })
  }
  return out
}

/**
 * true 면 이미 MVP 가 찍힌 경기도 규칙으로 다시 정한다. SPL 원본 MVP(102건)를 지키려면 false.
 * 처음 소급(2026-09-11)은 false — 원본이 있는 경기는 원본을 믿는다.
 */
const RULE_MVP_LEAGUES_REPICK: boolean = false
