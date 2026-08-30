/**
 * 병영수첩 BattleLog **원문 적재** + 좌표 기반 **포지션 판정** (D-174).
 *
 * ── 흐름
 * ```
 * 병영수첩 BattleLog (사용자의 로그인된 브라우저가 받은 JSON)
 *   → BarracksBattleLogRaw     원문 그대로 보존 (멱등)
 *   → (좌표 추출 · 구역 지도)   순수 함수 · @sacloud/nexon/position
 *   → PlayerPositionProfile    격자 분포 + 포지션 판정
 * ```
 *
 * ── 왜 파일로 받는가
 *   Node 에서 병영수첩을 부르면 **403** 이다. UA 를 위조해 뚫지 않는다
 *   (`CLAUDE.md` 3-A 5번). 수집은 정상 브라우저가 하고 여기서는 읽기만 한다.
 *   스니펫: `packages/db/legacy/barracks-battlelog-snippet.js`
 *
 * ── 재계산
 *   구역 지도나 판정 규칙을 바꿔도 **다시 요청하지 않는다.** 저장된 원문에서 다시 계산한다.
 */
import { readFileSync } from 'node:fs'
import { prisma } from '@sacloud/db'
import {
  POSITION_CLASSIFIER_VERSION,
  centroidsOf,
  classifyPosition,
  contentHash,
  hasSniperKill,
  killsOf,
  positionPointsByPlayerOf,
  weaponByPlayerOf,
  histogramOf,
  leaveOneOut,
  positionPointsOf,
  zoneCounts,
  type BattleLogPositionEvent,
  type Histogram,
  type LabeledHistogram,
  type MapPoint,
  type ZoneMap,
} from '@sacloud/nexon'
import { log, warn } from '../lib/log.js'

const SOURCE = 'nexon_barracks'
/** 선수 단위 배틀로그. 클랜 단위(`GetBattleLogClan`)는 무기 판정용이라 표가 다르다 (D-114) */
const DEFAULT_ENDPOINT = '/api/BattleLog/GetBattleLog'

/* ============================================================ 원문 적재 === */

/**
 * 브라우저 스니펫이 저장하는 파일 모양. 가공하지 않은 응답을 그대로 담는다.
 *
 * **두 가지 모양을 다 받는다.** 손으로 모은 파일을 버리지 않기 위해서다 —
 * 형식이 조금 다르다고 다시 받게 하면 원본에 쓸데없는 요청을 보내는 셈이다.
 *
 * ```
 * 지금 스니펫   { matchKey, strUsn, raw: { battleLog: [...] } }
 * 2026-08-28 판 { match_key, usn, pos, battleLog: [...] }      ← 라벨(pos)이 같이 있다
 * ```
 */
export interface BattleLogImportRow {
  source?: string
  endpoint?: string
  matchKey?: string
  match_key?: string
  /** 선수 단위면 `str_usn`(또는 주소 조각). 스니펫 구버전은 `clanNo` 로 적는다 */
  strUsn?: string
  userNexonSn?: string
  usn?: string
  clanNo?: string
  barracksId?: string
  /** 클랜 단위 수집기가 붙이는 주인 이름표. `teamList` 가 있으면 이쪽이 이긴다 (D-184) */
  subject?: string
  /** 2026-08-28 수집분에는 포지션 정답이 행마다 붙어 있다 */
  pos?: string
  fetched_at?: string
  raw?: unknown
  battleLog?: unknown
}

export interface BattleLogImportFile {
  collected_at?: string
  rows?: BattleLogImportRow[]
  failures?: { matchKey?: string; error?: string }[]
}

/** 행에서 경기 번호를 고른다 — 두 형식을 다 받는다 */
function matchKeyOf(row: BattleLogImportRow): string | null {
  const key = row.matchKey ?? row.match_key
  return key ? String(key) : null
}

/** 행에서 원문을 고른다. `raw` 가 없으면 행 자체가 응답을 품고 있는 형식이다 */
function rawOf(row: BattleLogImportRow): unknown {
  return row.raw ?? (row.battleLog !== undefined ? { battleLog: row.battleLog } : row)
}

/**
 * 포지션 코드를 하나로 맞춘다.
 *
 * **우리 포지션은 네 개뿐이다 — 스나 · 숏 · 2층 · B** (2026-08-29 사용자 확정).
 * `리베` 는 **B 로 합친다.** 따로 두면 좌표로 갈라지지 않아 정확도만 떨어진다
 * (4분류 80% → 3분류 85% · 실측). 스나는 좌표가 아니라 **주무기**로 정해진다.
 *
 * 2026-08-28 수집분은 `F2` · `RIBE` 로 적혀 있어 여기서 흡수한다.
 * 모르는 코드는 **바꾸지 않고 그대로 둔다** — 조용히 다른 뜻으로 만들지 않기 위해서다.
 */
const POSITION_ALIAS: Record<string, string> = {
  F2: '2F',
  '2F': '2F',
  B: 'B',
  SHORT: 'SHORT',
  A: 'SHORT',
  /* 리베는 B 다 (사용자 확정) */
  RIBE: 'B',
  LIBERO: 'B',
}

export function normalizePosition(code: string): string {
  return POSITION_ALIAS[code.trim().toUpperCase()] ?? code.trim()
}

export interface BattleLogImportResult {
  rows: number
  stored: number
  duplicate: number
  skipped: number
  failures: number
  /** 원문에서 실제로 읽힌 이벤트 수 — 0 이면 응답 모양이 바뀐 것이다 */
  events: number
  /** 좌표가 있는 이벤트 수. 이게 0 이면 포지션 판정을 할 수 없다 */
  points: number
  /** 파일에 포지션 정답이 같이 들어 있으면 여기 모인다 (사람 키 → 포지션) */
  labels: Record<string, string>
}

/** 응답에서 이벤트 배열을 찾는다. 키 이름이 흔들려도 원문은 버리지 않는다 */
export function eventsOf(raw: unknown): BattleLogPositionEvent[] {
  if (Array.isArray(raw)) return raw as BattleLogPositionEvent[]
  if (raw === null || typeof raw !== 'object') return []
  const record = raw as Record<string, unknown>
  for (const key of ['battleLog', 'battleLogs', 'logs', 'events', 'result', 'data']) {
    const value = record[key]
    if (Array.isArray(value)) return value as BattleLogPositionEvent[]
  }
  return []
}

/**
 * 이 줄의 주인(사람 키)을 고른다. 없으면 `null` — 주인을 모르는 원문은 넣지 않는다.
 *
 * **원문 안의 `str_usn` 을 가장 먼저 본다.** 그것이 그 로그의 주인이라고 응답 자신이
 * 말하는 값이기 때문이다. 파일 바깥에 적힌 값(수집기가 붙인 것)보다 우선한다 —
 * 수집기가 어떤 때는 숫자 번호를, 어떤 때는 주소 조각을 붙여서 **같은 사람이 두 명으로
 * 갈라진 적이 있다**(2026-08-29 실측: 어제 수집분 20명 + 오늘 수집분 5명 = 25명으로 셈).
 */
function subjectOf(row: BattleLogImportRow): string | null {
  /* 클랜 단위 응답이면 주인은 **클랜**이다. 안에 든 `str_usn` 은 그 클랜 선수들이라
     그중 아무나 주인으로 삼으면 같은 응답이 선수 로그로 둔갑한다 (D-184) */
  if (isClanResponse(rawOf(row))) {
    const clan = row.clanNo ?? row.subject
    return clan ? String(clan) : null
  }
  const fromEvents = eventsOf(rawOf(row))[0]?.str_usn
  if (fromEvents !== null && fromEvents !== undefined && String(fromEvents).trim() !== '') {
    return String(fromEvents)
  }
  const explicit = row.strUsn ?? row.userNexonSn ?? row.usn ?? row.barracksId ?? row.clanNo
  return explicit ? String(explicit) : null
}

/**
 * 클랜 단위 응답인가 — **`teamList` 로 가른다** (D-184).
 *
 * 수집기가 붙인 이름표를 믿지 않는다. 응답 자신이 갖고 있는 표시를 본다.
 * 클랜 응답에는 `teamList`(팀번호 ↔ 클랜번호 짝)가 최상위에 오고 선수 응답에는 없다.
 *
 * 이걸 안 가르면 클랜 응답이 **첫 선수의 개인 로그로 둔갑한다.**
 * 그러면 그 선수 혼자 한 경기에서 10명분 좌표를 가진 것이 되어
 * 포지션 판정(`subjectKind: 'user'` 만 읽는다)이 통째로 오염된다.
 */
export function isClanResponse(raw: unknown): boolean {
  if (raw === null || typeof raw !== 'object') return false
  return Array.isArray((raw as Record<string, unknown>).teamList)
}

/**
 * 수집 파일 → `BarracksBattleLogRaw`.
 *
 * 같은 파일을 여러 번 넣어도 행이 늘지 않는다. 같은 내용이면 `fetchCount` 만 올린다.
 * **`--confirm` 없이는 한 줄도 쓰지 않는다.**
 */
export async function importBattleLogs(input: {
  file: string
  confirm?: boolean
}): Promise<BattleLogImportResult> {
  const parsed = JSON.parse(readFileSync(input.file, 'utf8')) as
    | BattleLogImportFile
    | BattleLogImportRow[]
  /* 수집기가 `{ rows: [...] }` 로 주기도 하고 배열만 주기도 한다.
     둘 다 받는다 — 파일 껍데기 때문에 원문 4천 건을 놓치면 안 된다 */
  const rows = Array.isArray(parsed) ? parsed : (parsed.rows ?? [])
  const result: BattleLogImportResult = {
    rows: rows.length,
    stored: 0,
    duplicate: 0,
    skipped: 0,
    failures: Array.isArray(parsed) ? 0 : (parsed.failures?.length ?? 0),
    events: 0,
    points: 0,
    labels: {},
  }

  for (const row of rows) {
    const subject = subjectOf(row)
    const matchKey = matchKeyOf(row)
    if (!subject || !matchKey) {
      /* 주인이나 경기를 모르면 넣지 않는다. 추측해서 키를 만들지 않는다 */
      result.skipped += 1
      continue
    }

    const raw = rawOf(row)
    const events = eventsOf(raw)
    result.events += events.length
    result.points += positionPointsOf(events).length
    /* 행에 붙어 있는 포지션 정답은 **원문과 함께 보존한다** — 라벨을 다시 받지 않기 위해서다 */
    if (row.pos) result.labels[subject] = normalizePosition(row.pos)

    if (!input.confirm) continue

    const payloadHash = contentHash(raw)
    const existing = await prisma.barracksBattleLogRaw.findUnique({
      where: { matchKey_subject_payloadHash: { matchKey, subject, payloadHash } },
      select: { id: true },
    })
    if (existing) {
      await prisma.barracksBattleLogRaw.update({
        where: { id: existing.id },
        data: { fetchCount: { increment: 1 } },
      })
      result.duplicate += 1
      continue
    }
    await prisma.barracksBattleLogRaw.create({
      data: {
        source: row.source ?? SOURCE,
        endpoint: row.endpoint ?? DEFAULT_ENDPOINT,
        matchKey,
        subject,
        /* 응답 자신이 가진 표시(`teamList`)를 먼저 본다 — 수집기 이름표는 흔들린다 (D-184) */
        subjectKind:
          isClanResponse(raw) || (row.clanNo && !row.strUsn && !row.userNexonSn && !row.usn)
            ? 'clan'
            : 'user',
        payload: raw as object,
        payloadHash,
        status: 'ok',
      },
    })
    result.stored += 1
  }

  if (result.events > 0 && result.points === 0) {
    warn('이벤트는 있는데 좌표가 하나도 없다 — 응답 모양이 바뀌었을 수 있다 (kill_x/kill_y 확인)')
  }
  return result
}

/* ========================================================== 포지션 판정 === */

/** `data/barracks/position-labels.json` — 사람이 알려 준 정답. 없으면 판정하지 않는다 */
export interface PositionLabelFile {
  /** 라벨을 누가 언제 준 것인지. 근거를 남긴다 */
  note?: string
  labels: {
    /** 숫자 번호. 우리 DB(`Player.sourcePlayerId`)와 같은 형식 */
    userNexonSn?: string | null
    /** 병영수첩 프로필 주소 조각(16진+SA). API 가 이 값도 키로 받는다(실측) */
    barracksId?: string | null
    playerName?: string
    position: string
  }[]
}

/**
 * 라벨 한 줄의 사람 키.
 *
 * 원문(`BarracksBattleLogRaw.subject`)이 어느 형식으로 저장됐는지에 따라 달라서
 * **둘 다 받는다.** 하나로 강제하면 손으로 모은 라벨을 못 쓴다.
 */
function labelKeysOf(label: PositionLabelFile['labels'][number]): string[] {
  return [label.userNexonSn, label.barracksId].filter(Boolean).map(String)
}

export interface PositionBuildResult {
  /** 원문이 있는 사람 수 */
  subjects: number
  /** 분포를 만든 사람 수 (최소 경기 수를 넘긴 사람) */
  profiled: number
  /** 표본이 모자라 건너뛴 사람 */
  tooFewGames: number
  /** 스나를 들어서 뺀 경기 수 (전체 합) */
  sniperGamesExcluded: number
  /** 좌표가 지도 밖이라 구역을 못 정한 비율 확인용 */
  zoneCounts: Record<string, number>
  /** 라벨이 붙은 사람 수 */
  labeled: number
  /** 한 명씩 빼고 맞힌 정확도. 라벨이 없으면 `null` */
  accuracy: number | null
  misses: { key: string; expected: string; got: string | null }[]
  written: number
}

interface SubjectSamples {
  subject: string
  /** 경기별 좌표. 스나 든 판은 이미 빠져 있다 */
  points: MapPoint[]
  games: number
  sniperGames: number
}

/**
 * 저장된 원문 → 사람별 격자 분포 → 포지션.
 *
 * 라벨(정답)이 있으면 그것으로 중심을 만들고, **한 명씩 빼고 맞히는 방식**으로
 * 정확도를 함께 보고한다. 라벨이 없으면 분포만 만들고 **포지션은 비운다** —
 * 중심 없이 찍지 않는다.
 */
export async function buildPositionProfiles(input: {
  zonemapFile: string
  labelsFile?: string | null
  /** 이 판수 미만이면 분포를 만들지 않는다. 표본이 적으면 분포가 흔들린다 */
  minGames?: number
  /** 격자 크기. 구역 지도(10)와 다른 값이어도 된다 — 분포는 더 성기게 본다 */
  cell?: number
  confirm?: boolean
}): Promise<PositionBuildResult> {
  const zonemap = JSON.parse(readFileSync(input.zonemapFile, 'utf8')) as ZoneMap
  const minGames = input.minGames ?? 10
  const cell = input.cell ?? 20

  const labels = input.labelsFile
    ? (JSON.parse(readFileSync(input.labelsFile, 'utf8')) as PositionLabelFile)
    : null

  const rows = await prisma.barracksBattleLogRaw.findMany({
    where: { subjectKind: { in: ['user', 'clan'] }, status: 'ok' },
    select: { subject: true, subjectKind: true, matchKey: true, payload: true },
  })

  const bySubject = new Map<string, SubjectSamples>()
  /** `str_usn` → 병영수첩 계정 번호. 우리 Player 와 잇는 데 쓴다 */
  const accountOf = new Map<string, string>()

  const entryFor = (subject: string): SubjectSamples => {
    const found = bySubject.get(subject)
    if (found) return found
    const made: SubjectSamples = { subject, points: [], games: 0, sniperGames: 0 }
    bySubject.set(subject, made)
    return made
  }

  for (const row of rows) {
    const events = eventsOf(row.payload)

    if (row.subjectKind === 'user') {
      const entry = entryFor(row.subject)
      /* 스나 든 판은 통째로 뺀다 — 스나는 서는 자리가 다르다 (실측 75%→80%) */
      if (hasSniperKill(events)) {
        entry.sniperGames += 1
      } else {
        entry.games += 1
        entry.points.push(...positionPointsOf(events))
      }
      continue
    }

    /*
      클랜 단위 응답 (D-196).

      한 줄에 **두 사람의 위치**가 들어 있으므로 사람별로 갈라 담는다.
      예전에는 이 응답을 아예 안 읽었다 — 그대로 읽으면 첫 선수가 10명분 좌표를
      가진 것이 되어 판정이 오염되기 때문이다 (D-184). 이제는 짝지어 읽는다.

      스나 판 제외도 **사람별로** 한다. `hasSniperKill` 은 "이 로그 안에 스나 킬이
      하나라도 있나" 라서, 열 명이 섞인 클랜 응답에서는 한 명만 스나를 들어도
      전원이 빠져 버린다.
    */
    const kills = killsOf(events as never)
    const weapons = weaponByPlayerOf(kills)
    for (const [usn, points] of positionPointsByPlayerOf(events as never)) {
      const entry = entryFor(usn)
      if (weapons.get(usn) === 1) {
        entry.sniperGames += 1
        continue
      }
      entry.games += 1
      entry.points.push(...points)
    }
    for (const event of events as unknown as Record<string, unknown>[]) {
      const put = (usn: unknown, sn: unknown) => {
        if (typeof usn === 'string' && usn !== '' && sn !== null && sn !== undefined && sn !== '') {
          accountOf.set(usn, String(sn))
        }
      }
      put(event.str_usn, event.user_nexon_sn)
      put(event.target_str_usn, event.target_user_nexon_sn)
    }
  }

  const result: PositionBuildResult = {
    subjects: bySubject.size,
    profiled: 0,
    tooFewGames: 0,
    sniperGamesExcluded: 0,
    zoneCounts: {},
    labeled: 0,
    accuracy: null,
    misses: [],
    written: 0,
  }

  const histograms = new Map<string, Histogram>()
  const usable = new Map<string, SubjectSamples>()
  for (const entry of bySubject.values()) {
    result.sniperGamesExcluded += entry.sniperGames
    if (entry.games < minGames || entry.points.length === 0) {
      result.tooFewGames += 1
      continue
    }
    histograms.set(entry.subject, histogramOf(entry.points, cell))
    usable.set(entry.subject, entry)
    result.profiled += 1
    for (const [zone, count] of Object.entries(zoneCounts(zonemap, entry.points))) {
      result.zoneCounts[zone] = (result.zoneCounts[zone] ?? 0) + count
    }
  }

  /* ---- 정답 표본 → 중심 ---- */
  const samples: LabeledHistogram[] = []
  for (const label of labels?.labels ?? []) {
    /* 라벨은 숫자 번호로도, 주소 조각으로도 온다. 분포가 있는 쪽을 쓴다 */
    const key = labelKeysOf(label).find((candidate) => histograms.has(candidate))
    const hist = key ? histograms.get(key) : undefined
    if (!key || !hist) continue
    samples.push({ key, position: normalizePosition(label.position), hist })
  }
  result.labeled = samples.length
  const centroids = centroidsOf(samples)

  if (samples.length > 0) {
    const validation = leaveOneOut(samples)
    result.accuracy = validation.accuracy
    result.misses = validation.misses
  }

  if (!input.confirm) return result

  for (const [subject, hist] of histograms) {
    const entry = usable.get(subject)
    if (!entry) continue
    /* 중심이 없으면 **포지션을 비운다.** 분포는 남긴다 — 라벨이 생기면 재계산만 하면 된다 */
    const verdict = samples.length > 0 ? classifyPosition(hist, centroids) : null
    /* 로그의 사람 키는 `str_usn` 인데 우리 `Player.sourcePlayerId` 는 **계정 번호**다.
       이걸 안 거치면 `playerId` 가 전부 `null` 이 되고, 그러면 이 판정을 화면에서 못 쓴다 */
    const playerId = await resolvePlayerId(accountOf.get(subject) ?? subject)

    const data = {
      playerId,
      position: verdict?.position ?? null,
      score: verdict?.score ?? 0,
      margin: verdict?.margin ?? 0,
      games: entry.games,
      sniperGamesExcluded: entry.sniperGames,
      points: entry.points.length,
      histogram: hist as unknown as object,
      classifierVersion: POSITION_CLASSIFIER_VERSION,
      computedAt: new Date(),
    }
    await prisma.playerPositionProfile.upsert({
      where: {
        userNexonSn_classifierVersion: {
          userNexonSn: subject,
          classifierVersion: POSITION_CLASSIFIER_VERSION,
        },
      },
      create: { userNexonSn: subject, ...data },
      update: data,
    })
    result.written += 1
  }

  if (samples.length === 0) {
    log('정답 라벨이 없어 분포만 저장했다. 라벨이 생기면 원문 재수집 없이 다시 고른다')
  }
  return result
}

/**
 * 병영수첩 계정 번호 → 우리 Player.
 *
 * 무기 판정(D-114)과 **같은 규칙**을 쓴다 — 계정 번호로만 잇는다.
 * 닉네임으로 전역에서 합치지 않는다 (D-036). 못 찾으면 비워 두고 분포는 남긴다.
 */
async function resolvePlayerId(userNexonSn: string): Promise<string | null> {
  const player = await prisma.player.findFirst({
    where: { sourcePlayerId: userNexonSn },
    select: { id: true },
  })
  return player?.id ?? null
}
