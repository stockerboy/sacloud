/**
 * 포지션 자동 판정 — **순수 함수** (D-174).
 *
 * 사양은 `docs/PLAYER_TRAITS_SPEC.md`. 입력 자료는 `data/barracks/`.
 *
 * ── 무엇을 하는가
 *   병영수첩 BattleLog 의 킬/데스 **좌표**로 그 선수가 주로 어디에 서 있었는지를 재고,
 *   정답 표본(사람이 알려 준 포지션)의 분포와 견줘 포지션을 고른다.
 *
 * ── 왜 "최다 구역" 으로 정하지 않는가
 *   **2층은 A(숏)의 위층이라 미니맵 x/y 가 겹친다.** 좌표만으로는 둘을 가를 수 없다.
 *   실제로 2층 선수 5명 전원이 "숏이 최다 구역" 으로 나왔다 (실측 · 정확도 45%).
 *   그래서 구역 비율이 아니라 **격자 분포 전체**를 견준다 (실측 75~85%).
 *
 * ── 절대 하지 않는 것
 *   - 킬수·킬뎃·딜량으로 포지션을 **추정하지 않는다.** 좌표만 쓴다
 *   - 원본이 준 `Player.position`(선수가 직접 등록한 값)과 **섞지 않는다.** 다른 값이다
 *   - 표본이 모자라면 찍지 않는다. `null` 이 정답이다
 */

/** 판정기 버전. 규칙을 바꾸면 올린다 — 저장된 판정이 어느 규칙으로 나왔는지 남는다 */
export const POSITION_CLASSIFIER_VERSION = 'position-v1'

/** 구역 코드. 화면 문구가 아니라 **코드**다 (표기는 UI 가 정한다) */
export const ZONE = { second: '2F', bomb: 'B', short: 'SHORT' } as const
export type ZoneCode = (typeof ZONE)[keyof typeof ZONE]

/** BattleLog 한 줄. 우리가 쓰는 필드만 적는다 — 응답에는 더 있을 수 있다 */
export interface BattleLogPositionEvent {
  event_type?: string | null
  /** 죽인 사람이 서 있던 위치 */
  kill_x?: number | string | null
  kill_y?: number | string | null
  /** 죽은 사람이 서 있던 위치 */
  death_x?: number | string | null
  death_y?: number | string | null
  weapon?: string | null
  /** 이 로그의 주인 (그 선수) */
  str_usn?: number | string | null
  /** 죽인 사람 */
  user_nexon_sn?: number | string | null
  /** 죽은 사람 */
  target_str_usn?: number | string | null
  round?: number | string | null
}

export interface MapPoint {
  x: number
  y: number
}

/** 격자 셀 → 구역. 키는 `"셀x,셀y"` 다 (`data/barracks/zonemap.json`) */
export interface ZoneMap {
  /** 셀 한 칸의 크기 */
  cell: number
  zone: Record<string, string>
}

function toNumber(value: number | string | null | undefined): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string' || value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * 그 선수 **본인이 서 있던 좌표**만 뽑는다.
 *
 * `kill` 은 그 선수가 죽인 것이므로 `kill_*` 가 본인 위치이고,
 * `death` 는 그 선수가 죽은 것이므로 `death_*` 가 본인 위치다.
 * 폭파(`bomb`)·수류탄사(`g_death`) 같은 이벤트는 위치의 뜻이 달라 **쓰지 않는다.**
 *
 * > `[미확인]` `kill_x` 가 **언제나** 죽인 사람 위치인지는 원본이 알려 주지 않았다.
 * > 실측 필드 이름과 산점도 모양으로 그렇게 읽었다 (`docs/PLAYER_TRAITS_SPEC.md` 1절).
 */
export function positionPointsOf(events: readonly BattleLogPositionEvent[]): MapPoint[] {
  const points: MapPoint[] = []
  for (const event of events) {
    const type = event.event_type
    const x = toNumber(type === 'kill' ? event.kill_x : type === 'death' ? event.death_x : null)
    const y = toNumber(type === 'kill' ? event.kill_y : type === 'death' ? event.death_y : null)
    if (x === null || y === null) continue
    points.push({ x, y })
  }
  return points
}

/** 이 경기에서 그 선수가 **스나를 들었나.** 스나 든 판은 포지션 표본에서 뺀다 (실측 75%→80%) */
export function hasSniperKill(events: readonly BattleLogPositionEvent[]): boolean {
  return events.some((event) => event.event_type === 'kill' && event.weapon === 'sniper')
}

/** 좌표가 어느 구역인가. 지도에 없는 칸이면 `null` — 없는 구역을 지어내지 않는다 */
export function zoneOf(map: ZoneMap, point: MapPoint): string | null {
  const cellX = Math.floor(point.x / map.cell)
  const cellY = Math.floor(point.y / map.cell)
  return map.zone[`${cellX},${cellY}`] ?? null
}

/** 구역별 좌표 수. 지도 밖은 세지 않는다 */
export function zoneCounts(map: ZoneMap, points: readonly MapPoint[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const point of points) {
    const zone = zoneOf(map, point)
    if (zone === null) continue
    counts[zone] = (counts[zone] ?? 0) + 1
  }
  return counts
}

/** 격자 분포. 키는 `"셀x,셀y"` · 값은 **비율**(합 1)이다 — 표본 수가 달라도 견줄 수 있게 */
export type Histogram = Record<string, number>

/** 좌표를 `cell` 단위 격자로 접어 비율 분포로 만든다 */
export function histogramOf(points: readonly MapPoint[], cell = 20): Histogram {
  const counts: Record<string, number> = {}
  for (const point of points) {
    const key = `${Math.floor(point.x / cell)},${Math.floor(point.y / cell)}`
    counts[key] = (counts[key] ?? 0) + 1
  }
  const total = points.length
  if (total === 0) return {}
  const hist: Histogram = {}
  for (const [key, count] of Object.entries(counts)) hist[key] = count / total
  return hist
}

/** 두 분포가 얼마나 닮았나 (0~1). 한쪽이 비면 0 이다 */
export function cosineSimilarity(a: Histogram, b: Histogram): number {
  let dot = 0
  let normA = 0
  let normB = 0
  for (const value of Object.values(a)) normA += value * value
  for (const value of Object.values(b)) normB += value * value
  for (const [key, value] of Object.entries(a)) {
    const other = b[key]
    if (other !== undefined) dot += value * other
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

/** 여러 사람의 분포를 하나로 — 정답 표본의 중심을 만든다 */
export function centroidOf(histograms: readonly Histogram[]): Histogram {
  if (histograms.length === 0) return {}
  const sum: Histogram = {}
  for (const hist of histograms) {
    for (const [key, value] of Object.entries(hist)) sum[key] = (sum[key] ?? 0) + value
  }
  const centroid: Histogram = {}
  for (const [key, value] of Object.entries(sum)) centroid[key] = value / histograms.length
  return centroid
}

export interface PositionVerdict {
  /** 고른 포지션. 표본이 없으면 `null` — 찍지 않는다 */
  position: string | null
  /** 그 포지션과의 닮음 (0~1) */
  score: number
  /** 2등 포지션과 그 점수. 둘이 붙어 있으면 믿을 값이 아니다 */
  runnerUp: string | null
  runnerUpScore: number
  /** 1등과 2등의 차이. 판정을 얼마나 믿을지 재는 값이다 */
  margin: number
}

const EMPTY_VERDICT: PositionVerdict = {
  position: null,
  score: 0,
  runnerUp: null,
  runnerUpScore: 0,
  margin: 0,
}

/**
 * 정답 표본의 중심들과 견줘 포지션을 고른다.
 *
 * 중심이 하나도 없거나 분포가 비면 **판정하지 않는다.**
 */
export function classifyPosition(
  hist: Histogram,
  centroids: Readonly<Record<string, Histogram>>,
): PositionVerdict {
  const entries = Object.entries(centroids)
  if (entries.length === 0 || Object.keys(hist).length === 0) return EMPTY_VERDICT

  const scored = entries
    .map(([position, centroid]) => ({ position, score: cosineSimilarity(hist, centroid) }))
    .sort((a, b) => b.score - a.score || a.position.localeCompare(b.position))

  const best = scored[0]
  if (!best || best.score <= 0) return EMPTY_VERDICT
  const second = scored[1]
  return {
    position: best.position,
    score: best.score,
    runnerUp: second?.position ?? null,
    runnerUpScore: second?.score ?? 0,
    margin: best.score - (second?.score ?? 0),
  }
}

export interface LabeledHistogram {
  /** 사람 키. 병영수첩 계정 번호를 쓴다 (닉네임은 바뀐다) */
  key: string
  position: string
  hist: Histogram
}

/** 정답 표본 → 포지션별 중심 */
export function centroidsOf(samples: readonly LabeledHistogram[]): Record<string, Histogram> {
  const byPosition = new Map<string, Histogram[]>()
  for (const sample of samples) {
    const list = byPosition.get(sample.position) ?? []
    list.push(sample.hist)
    byPosition.set(sample.position, list)
  }
  const centroids: Record<string, Histogram> = {}
  for (const [position, list] of byPosition) centroids[position] = centroidOf(list)
  return centroids
}

export interface LeaveOneOutResult {
  total: number
  correct: number
  accuracy: number
  /** 틀린 사람 — 무엇을 무엇으로 봤는지 남긴다 */
  misses: { key: string; expected: string; got: string | null }[]
}

/**
 * **한 명씩 빼고 학습해 그 사람을 맞힌다.**
 *
 * 자기 자신을 중심에 넣고 자기를 맞히면 당연히 맞는다. 그건 검증이 아니다.
 * 정답이 한 명뿐인 포지션은 그 사람을 빼면 중심이 없어져 **맞힐 수 없다** —
 * 그 경우도 틀린 것으로 센다. 표본이 모자란다는 사실을 감추지 않는다.
 */
export function leaveOneOut(samples: readonly LabeledHistogram[]): LeaveOneOutResult {
  const misses: LeaveOneOutResult['misses'] = []
  let correct = 0
  for (const sample of samples) {
    const rest = samples.filter((other) => other.key !== sample.key)
    const verdict = classifyPosition(sample.hist, centroidsOf(rest))
    if (verdict.position === sample.position) correct += 1
    else misses.push({ key: sample.key, expected: sample.position, got: verdict.position })
  }
  const total = samples.length
  return { total, correct, accuracy: total === 0 ? 0 : correct / total, misses }
}
