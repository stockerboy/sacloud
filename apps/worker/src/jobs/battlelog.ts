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

/** 브라우저 스니펫이 저장하는 파일 모양. 가공하지 않은 응답을 그대로 담는다 */
export interface BattleLogImportFile {
  collected_at?: string
  rows?: {
    source?: string
    endpoint?: string
    matchKey: string
    /** 선수 단위면 `str_usn`. 스니펫 구버전은 `clanNo` 로 적는다 */
    strUsn?: string
    userNexonSn?: string
    clanNo?: string
    fetched_at?: string
    raw: unknown
  }[]
  failures?: { matchKey?: string; error?: string }[]
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

/** 이 줄의 주인(사람 키)을 고른다. 없으면 `null` — 주인을 모르는 원문은 넣지 않는다 */
function subjectOf(row: NonNullable<BattleLogImportFile['rows']>[number]): string | null {
  const explicit = row.strUsn ?? row.userNexonSn ?? row.clanNo
  if (explicit) return String(explicit)
  const first = eventsOf(row.raw)[0]?.str_usn
  return first === null || first === undefined ? null : String(first)
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
  const parsed = JSON.parse(readFileSync(input.file, 'utf8')) as BattleLogImportFile
  const rows = parsed.rows ?? []
  const result: BattleLogImportResult = {
    rows: rows.length,
    stored: 0,
    duplicate: 0,
    skipped: 0,
    failures: parsed.failures?.length ?? 0,
    events: 0,
    points: 0,
  }

  for (const row of rows) {
    const subject = subjectOf(row)
    if (!subject || !row.matchKey) {
      /* 주인이나 경기를 모르면 넣지 않는다. 추측해서 키를 만들지 않는다 */
      result.skipped += 1
      continue
    }

    const events = eventsOf(row.raw)
    result.events += events.length
    result.points += positionPointsOf(events).length

    if (!input.confirm) continue

    const payloadHash = contentHash(row.raw)
    const existing = await prisma.barracksBattleLogRaw.findUnique({
      where: { matchKey_subject_payloadHash: { matchKey: String(row.matchKey), subject, payloadHash } },
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
        matchKey: String(row.matchKey),
        subject,
        subjectKind: row.clanNo && !row.strUsn && !row.userNexonSn ? 'clan' : 'user',
        payload: row.raw as object,
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
  labels: { userNexonSn?: string; playerName?: string; position: string }[]
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
    where: { subjectKind: 'user', status: 'ok' },
    select: { subject: true, matchKey: true, payload: true },
  })

  const bySubject = new Map<string, SubjectSamples>()
  for (const row of rows) {
    const events = eventsOf(row.payload)
    const entry = bySubject.get(row.subject) ?? {
      subject: row.subject,
      points: [],
      games: 0,
      sniperGames: 0,
    }
    /* 스나 든 판은 통째로 뺀다 — 스나는 서는 자리가 다르다 (실측 75%→80%) */
    if (hasSniperKill(events)) {
      entry.sniperGames += 1
    } else {
      entry.games += 1
      entry.points.push(...positionPointsOf(events))
    }
    bySubject.set(row.subject, entry)
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
    const key = label.userNexonSn ? String(label.userNexonSn) : null
    const hist = key ? histograms.get(key) : undefined
    if (!key || !hist) continue
    samples.push({ key, position: label.position, hist })
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
    const playerId = await resolvePlayerId(subject)

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
