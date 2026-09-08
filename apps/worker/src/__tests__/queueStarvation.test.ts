/**
 * ★수집 큐가 활동 클랜을 굶기지 않는지★ (2026-09-08 · P0 회귀 방지)
 *
 * ══ 왜 이 테스트가 있는가 ══
 *
 * 2026-09-08 에 수집이 ★8시간★ 멈췄다. 코드는 정상으로 보였고 로그에도
 * 「목록 요청 150회」가 찍혔다. 그런데 실제로는 ★죽은 클랜 150곳★ 에 물어보고 있었다.
 *
 * ```
 * 16:50 실측 — 오늘 경기한 66곳 중 큐에 든 곳 ★3곳(5%)★
 *              앞 12곳의 마지막 경기가 작년 11월 · 12월 · 올해 1월
 * ```
 *
 * 원인은 두 가지였고 ★둘 다 「시간이 지나야」 터진다★ — 그래서 눈으로는 못 잡는다.
 *
 *   ① 「받은 시각」(`BarracksClanMatchRaw.fetchedAt`)을 「물어본 시각」처럼 썼다.
 *      그 값은 ★새 경기가 들어와야★ 생긴다. 죽은 클랜은 영영 안 생기니
 *      「한 번도 못 받음」으로 ★영원히 맨 앞★ 을 차지했다.
 *   ② 0등급(방치)에 상한이 없었다. 한 번 전체가 방치 상태가 되면 0등급이 150 자리를 다 먹었다.
 *
 * 그리고 고치는 과정에서 ★세 번째★ 가 나왔다 —
 *   ③ 상한을 `WHERE` 로 걸어 「빼」 버렸더니 배포 직후(전원 0등급) 한 판에 30곳만 돌았다.
 *      ★밀어내는 것과 빼는 것은 다르다.★
 *
 * 이 테스트는 `pendingClans` 의 우선순위 규칙과 ★같은 규칙★ 을 두고,
 * 극단 상황에서 여러 회차를 돌려 ★활동 클랜이 굶는지★ 를 본다.
 * SQL 을 직접 부르지 않는 이유는 DB 없이 돌아야 하기 때문이다 —
 * ⚠ 규칙을 SQL 에서 바꾸면 ★여기도 같이 바꿔야 한다.★
 */
import { describe, expect, it } from 'vitest'
import { STALE_BAND_CAP } from '../jobs/barracksCollect.js'

const LIMIT = 150
const LAP_MIN = 21
const H = (n: number) => n * 3600_000

interface Clan {
  id: string
  /** 마지막으로 경기한 시각. null 이면 기록 없음 */
  lastMatch: number | null
  /** ★마지막으로 물어본 시각★ — 새 경기가 없어도 갱신된다 (P0 수정의 핵심) */
  requestedAt: number | null
  /** 실제로 활동하는 클랜인가 — 시뮬레이션에서 계속 경기를 만든다 */
  alive: boolean
}

/** `pendingClans` 의 우선순위판과 같은 규칙 */
function pick(rows: Clan[], now: number, cap: number): Clan[] {
  const byReq = (a: Clan, b: Clan) => {
    const x = a.requestedAt
    const y = b.requestedAt
    if (x === null && y === null) return a.id < b.id ? -1 : 1
    if (x === null) return -1
    if (y === null) return 1
    return x - y || (a.id < b.id ? -1 : 1)
  }
  const band = (r: Clan) =>
    r.lastMatch === null
      ? 4
      : now - r.lastMatch <= H(1)
        ? 1
        : now - r.lastMatch <= H(6)
          ? 2
          : now - r.lastMatch <= H(24)
            ? 3
            : 4
  const stale = (r: Clan) => r.requestedAt === null || now - r.requestedAt > H(6)

  const out: Clan[] = []
  const used = new Set<string>()
  /* 0등급은 상한까지만 앞에 세운다 */
  for (const r of rows.filter(stale).sort(byReq).slice(0, cap)) {
    out.push(r)
    used.add(r.id)
  }
  /* ★나머지 자리는 최근 활동 클랜이 가져간다. 상한을 넘은 0등급은 빼지 않고 뒤로 민다★ */
  for (const r of rows.filter((x) => !used.has(x.id)).sort((a, b) => band(a) - band(b) || byReq(a, b))) {
    if (out.length >= LIMIT) break
    out.push(r)
    used.add(r.id)
  }
  return out
}

/** 옛 버그판 — 「받은 시각」으로 판단하고 상한이 없다 */
function pickBuggy(rows: Clan[], now: number, got: Map<string, number | null>): Clan[] {
  const band = (r: Clan) => {
    const g = got.get(r.id) ?? null
    if (g === null || now - g > H(6)) return 0
    if (r.lastMatch === null) return 4
    if (now - r.lastMatch <= H(1)) return 1
    if (now - r.lastMatch <= H(6)) return 2
    if (now - r.lastMatch <= H(24)) return 3
    return 4
  }
  return [...rows]
    .sort((a, b) => {
      const d = band(a) - band(b)
      if (d) return d
      const x = got.get(a.id) ?? null
      const y = got.get(b.id) ?? null
      if (x === null && y === null) return a.id < b.id ? -1 : 1
      if (x === null) return -1
      if (y === null) return 1
      return x - y || (a.id < b.id ? -1 : 1)
    })
    .slice(0, LIMIT)
}

interface Result {
  /** 활동 클랜이 큐에 안 들어온 채 지나간 ★최대 시간(분)★ */
  maxGapMin: number
  /** 6시간 넘게 굶은 활동 클랜 수 */
  starved: number
}

function simulate(rows: Clan[], laps: number, mode: 'fixed' | 'buggy'): Result {
  const T0 = Date.now()
  let now = T0
  const active = rows.filter((r) => r.alive)
  const wait = new Map(active.map((r) => [r.id, 0]))
  /* 「받은 시각」 — 죽은 클랜은 영영 안 생긴다. 이것이 옛 버그의 심장이다 */
  const got = new Map<string, number | null>(rows.map((r) => [r.id, null]))

  for (let lap = 0; lap < laps; lap += 1) {
    /* ★활동 클랜은 두 시간마다 실제로 경기한다★ — 안 넣으면 6시간 뒤 전부 죽은 클랜이 된다 */
    if (lap % Math.round(120 / LAP_MIN) === 0) for (const r of active) r.lastMatch = now

    const sel = mode === 'fixed' ? pick(rows, now, STALE_BAND_CAP) : pickBuggy(rows, now, got)
    const inQueue = new Set(sel.map((r) => r.id))
    for (const r of sel) {
      r.requestedAt = now
      /* 새 경기가 있을 때만 「받은 시각」이 생긴다 */
      if (r.alive) got.set(r.id, now)
    }
    for (const r of active) wait.set(r.id, inQueue.has(r.id) ? 0 : (wait.get(r.id) ?? 0) + LAP_MIN)
    now += LAP_MIN * 60_000
  }
  const waits = [...wait.values()]
  return { maxGapMin: waits.length ? Math.max(...waits) : 0, starved: waits.filter((v) => v >= 360).length }
}

const clan = (id: string, o: Partial<Clan> = {}): Clan => ({
  id,
  lastMatch: null,
  requestedAt: null,
  alive: false,
  ...o,
})
const many = (n: number, f: (i: number) => Clan) => Array.from({ length: n }, (_, i) => f(i))
const LAPS_24H = Math.round((24 * 60) / LAP_MIN)

/** 사장님이 든 극단 상황들 그대로 */
const SCENARIOS: { name: string; build: () => Clan[] }[] = [
  {
    name: '죽은 클랜 500 + 활동 클랜 50 (전원 요청 이력 없음)',
    build: () => [
      ...many(500, (i) => clan(`dead${String(i).padStart(3, '0')}`, { lastMatch: Date.now() - H(24 * 90) })),
      ...many(50, (i) => clan(`live${String(i).padStart(3, '0')}`, { lastMatch: Date.now() - H(1), alive: true })),
    ],
  },
  {
    name: '전원이 6시간 넘게 방치 (2026-09-08 16:50 의 실제 상황)',
    build: () => [
      ...many(350, (i) => clan(`dead${i}`, { lastMatch: Date.now() - H(24 * 60) })),
      ...many(60, (i) => clan(`live${i}`, { lastMatch: Date.now() - H(3), alive: true })),
    ],
  },
  {
    name: '신규 등록 클랜 200곳이 한꺼번에 들어옴',
    build: () => [
      ...many(200, (i) => clan(`new${i}`)),
      ...many(200, (i) => clan(`dead${i}`, { lastMatch: Date.now() - H(24 * 40) })),
      ...many(60, (i) => clan(`live${i}`, { lastMatch: Date.now() - H(2), alive: true })),
    ],
  },
  {
    name: '클랜이 1,200곳으로 3배 커져도',
    build: () => [
      ...many(1120, (i) => clan(`dead${i}`, { lastMatch: Date.now() - H(24 * 30) })),
      ...many(80, (i) => clan(`live${i}`, { lastMatch: Date.now() - H(2), alive: true })),
    ],
  },
  {
    name: '활동 클랜이 300곳으로 아주 많을 때 (상한이 방해되지 않는가)',
    build: () => [
      ...many(200, (i) => clan(`dead${i}`, { lastMatch: Date.now() - H(24 * 30) })),
      ...many(300, (i) => clan(`live${i}`, { lastMatch: Date.now() - H(2), alive: true })),
    ],
  },
]

describe('수집 큐 — 활동 클랜을 굶기지 않는다', () => {
  it.each(SCENARIOS)('$name — 24시간 돌려도 굶는 활동 클랜이 없다', ({ build }) => {
    const r = simulate(build(), LAPS_24H, 'fixed')
    expect(r.starved).toBe(0)
    /* 6시간(360분) 안에는 반드시 다시 물어본다 */
    expect(r.maxGapMin).toBeLessThan(360)
  })

  it('옛 방식은 같은 상황에서 실제로 굶는다 — 이 테스트가 무엇을 막는지 보여 준다', () => {
    const r = simulate(SCENARIOS[1]!.build(), LAPS_24H, 'buggy')
    /* 24시간 동안 ★한 번도★ 안 뽑힌다 */
    expect(r.starved).toBeGreaterThan(0)
    expect(r.maxGapMin).toBeGreaterThanOrEqual(24 * 60 - LAP_MIN)
  })

  it('0등급 상한은 「빼기」가 아니라 「뒤로 밀기」다 — 배포 직후에도 자리를 다 채운다', () => {
    /* 전원 요청 이력 없음 = 전원 0등급. 그래도 150 자리가 다 차야 한다 */
    const rows = [
      ...many(400, (i) => clan(`dead${i}`, { lastMatch: Date.now() - H(24 * 30) })),
      ...many(60, (i) => clan(`live${i}`, { lastMatch: Date.now() - H(1), alive: true })),
    ]
    const sel = pick(rows, Date.now(), STALE_BAND_CAP)
    expect(sel).toHaveLength(LIMIT)
    /* 그리고 활동 클랜 60곳이 ★첫 판에 전부★ 들어와야 한다 */
    const got = new Set(sel.map((r) => r.id))
    expect(rows.filter((r) => r.alive).every((r) => got.has(r.id))).toBe(true)
  })

  it('상한 값이 사라지거나 0 이 되면 안 된다', () => {
    expect(STALE_BAND_CAP).toBeGreaterThan(0)
    expect(STALE_BAND_CAP).toBeLessThan(LIMIT)
  })
})
