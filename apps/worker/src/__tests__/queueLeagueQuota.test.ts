/**
 * ★수집 큐가 리그 하나를 통째로 굶기지 않는지★ (2026-09-10 · SPL 누락 회귀 방지)
 *
 * ══ 왜 이 테스트가 있는가 ══
 *
 * 2026-09-08 에 「활동 클랜을 굶기지 않는다」를 고쳤다. 그런데 그 규칙은
 * ★리그를 구분하지 않는다.★ 409곳을 한 줄로 세우니 ★등록 클랜이 많은 리그가
 * 순번을 다 먹었다.★
 *
 * ```
 * 등록 클랜   IPL 43곳 · SPL 55곳 · ★10mountain 311곳(76%)★
 *
 * 실측 (2026-09-10 01:30 · 운영)
 *   최근 30분에 목록을 물어본 곳   IPL 13곳 · 10mountain 6곳 · ★SPL 1곳★
 *   그 시간대 SPL 경기            보통 시간당 7건 → ★01시대 0건★
 * ```
 * ★자리가 모자란 게 아니라 순서가 문제였다.★ 30분에 닿는 곳이 20곳이니
 * ★한 바퀴가 150자리여도 실제로 도는 것은 앞 40곳쯤★ 이다.
 *
 * 그래서 ★리그마다 앞자리를 예약하고(`LEAGUE_MIN_SLOTS`) 라운드로빈으로 섞는다.★
 * 여기서는 그 규칙을 SQL 없이 다시 짜고 ★24시간 돌려서★ 확인한다 —
 * ⚠ 규칙을 SQL 에서 바꾸면 ★여기도 같이 바꿔야 한다.★
 *
 * ══ ★이 시뮬이 낸 숫자★ (하루 예열 뒤 24시간 · 한 시간에 앞 40곳) ══
 * ```
 *              한 시간에 닿는 40곳의 리그별 최소치      활동 클랜 최대 공백
 * 옛 판(V1)    IPL ★0★ · SPL ★0★ · 10mountain 1        7시간
 * 새 판(V2)    IPL  14  · SPL  13  · 10mountain 13     ★2~3시간★
 * ```
 * ★옛 판은 어떤 시간대에는 한 리그가 통째로 0곳이었다.★ 실측과 같은 모양이다.
 */
import { describe, expect, it } from 'vitest'
import { LEAGUE_MIN_SLOTS, LEAGUE_STALE_CAP, STALE_BAND_CAP } from '../jobs/barracksCollect.js'

const H = (n: number) => n * 3600_000
/** 한 바퀴에 뽑는 클랜 수 — 운영 셸의 `--clans` 기본값 */
const LIMIT = 150
/**
 * ★한 시간에 실제로 닿는 앞자리 수★.
 *
 * 실측에서 30분에 물어본 곳이 13+6+1 = ★20곳★ 이었다. 한 시간이면 40곳이다.
 * ★150자리를 다 준다고 다 도는 것이 아니다★ — 뒤쪽은 그 시간대에 없는 것과 같다.
 */
const REACH = 40

interface Clan {
  lg: 'nolink' | 'supply' | 'sanply'
  slug: string
  lastMatch: number | null
  requestedAt: number | null
  /** 계속 경기를 만드는 곳인가 */
  alive: boolean
}

const band = (r: Clan, now: number): number =>
  r.lastMatch === null
    ? 4
    : now - r.lastMatch <= H(1)
      ? 1
      : now - r.lastMatch <= H(6)
        ? 2
        : now - r.lastMatch <= H(24)
          ? 3
          : 4

const starving = (r: Clan, now: number): boolean =>
  r.requestedAt === null || now - r.requestedAt > H(6)

/** `requestedAt ASC NULLS FIRST, slug` */
const byReq = (a: Clan, b: Clan): number => {
  const x = a.requestedAt
  const y = b.requestedAt
  if (x === null && y === null) return a.slug < b.slug ? -1 : 1
  if (x === null) return -1
  if (y === null) return 1
  return x - y || (a.slug < b.slug ? -1 : 1)
}

/**
 * 굶주린 곳 중 앞 `cap` 개 — ★예약석★. `key` 를 주면 그 묶음(리그)마다 따로 센다.
 * SQL 의 `starveRn` / `leagueStarveRn` 두 창(window)에 그대로 대응한다.
 */
function starveReserved(rows: Clan[], now: number, cap: number, key?: (r: Clan) => string): Set<Clan> {
  const out = new Set<Clan>()
  const used = new Map<string, number>()
  for (const r of rows.filter((x) => starving(x, now)).sort(byReq)) {
    const k = key ? key(r) : '*'
    const n = (used.get(k) ?? 0) + 1
    used.set(k, n)
    if (n <= cap) out.add(r)
  }
  return out
}

/** 「고르는 기준」 — V1 과 V2 가 공유한다. 다른 것은 ★상한과 묶음★ 뿐이다 */
function baseOrder(rows: Clan[], now: number, reserved: Set<Clan>): Clan[] {
  return [...rows].sort(
    (a, b) =>
      Number(!reserved.has(a)) - Number(!reserved.has(b)) ||
      band(a, now) - band(b, now) ||
      byReq(a, b),
  )
}

/** ★옛 판★ — 리그를 구분하지 않고 한 줄로 세운다 (`pendingClansPriorityV1`) */
function pickV1(rows: Clan[], now: number): Clan[] {
  return baseOrder(rows, now, starveReserved(rows, now, STALE_BAND_CAP)).slice(0, LIMIT)
}

/** ★새 판★ — 리그마다 앞자리를 예약하고 라운드로빈으로 섞는다 (`pendingClansPriorityV2`) */
function pickV2(rows: Clan[], now: number): Clan[] {
  /* ★리그 몫 안에서는 상한도 리그별이다★ — 안 그러면 조용한 클랜이 몫을 통째로 먹는다 */
  const ordered = baseOrder(rows, now, starveReserved(rows, now, LEAGUE_STALE_CAP, (r) => r.lg))
  const seen = new Map<string, number>()
  const leagueRn = new Map<Clan, number>()
  for (const r of ordered) {
    const n = (seen.get(r.lg) ?? 0) + 1
    seen.set(r.lg, n)
    leagueRn.set(r, n)
  }
  const rank = (r: Clan) => leagueRn.get(r) ?? Number.MAX_SAFE_INTEGER
  const reservedSeat = (r: Clan) => rank(r) <= LEAGUE_MIN_SLOTS
  /* ③ 남은 자리는 ★전역 상한(옛 규칙) 그대로★ 겨룬다 */
  const tail = baseOrder(rows, now, starveReserved(rows, now, STALE_BAND_CAP))
  const tailAt = new Map(tail.map((r, i) => [r, i]))
  return [...ordered]
    .sort(
      (a, b) =>
        /* ① 예약석이 먼저 */
        Number(!reservedSeat(a)) - Number(!reservedSeat(b)) ||
        /* ② 예약석 안에서는 라운드로빈 — 1등끼리, 2등끼리 */
        (reservedSeat(a) ? rank(a) - rank(b) : 0) ||
        /* ③ 그 뒤는 옛 규칙 그대로 */
        (tailAt.get(a) ?? 0) - (tailAt.get(b) ?? 0),
    )
    .slice(0, LIMIT)
}

/** 운영 실측 그대로의 등록·활동 분포 (2026-09-10) */
function realPool(now: number): Clan[] {
  const out: Clan[] = []
  const add = (lg: Clan['lg'], total: number, live1h: number, live24h: number) => {
    for (let i = 0; i < total; i += 1) {
      const alive = i < live24h
      out.push({
        lg,
        slug: `${lg}-${String(i).padStart(3, '0')}`,
        lastMatch: alive ? now - (i < live1h ? H(0.5) : H(3)) : now - H(24 * 30),
        requestedAt: null,
        alive,
      })
    }
  }
  /*  리그        등록  1시간내  24시간내   ← 2026-09-10 운영 DB 실측 */
  add('nolink', 43, 15, 33)
  add('supply', 55, 0, 20)
  add('sanply', 311, 2, 22)
  return out
}

interface Run {
  /** 한 시간에 닿는 앞 40곳의 리그 분포 — 24시간 최소값 */
  minHeadPerLeague: Record<string, number>
  /** 활동 클랜이 큐에 안 닿은 채 지난 ★최대 시간★ — 리그별 */
  maxGapH: Record<string, number>
}

/**
 * ★재기 전에 하루를 먼저 돌린다★ — 갓 배포한 순간(전원 「한 번도 안 물어봄」)은
 * 정상 상태가 아니다. 그 상태로만 재면 규칙이 평소에 어떻게 도는지를 못 본다.
 */
const WARMUP_H = 24

function simulate(pick: (rows: Clan[], now: number) => Clan[], hours = 24): Run {
  const T0 = Date.now()
  let now = T0
  const rows = realPool(now)
  const head: Record<string, number[]> = { nolink: [], supply: [], sanply: [] }
  /** 지금 몇 시간째 안 뽑혔나 */
  const gap = new Map<string, number>(rows.filter((r) => r.alive).map((r) => [r.slug, 0]))
  /** 그중 ★가장 길었던 공백★ — 마지막 값만 보면 놓친다 */
  const worst = new Map<string, number>(rows.filter((r) => r.alive).map((r) => [r.slug, 0]))

  for (let lap = 0; lap < WARMUP_H + hours; lap += 1) {
    const measuring = lap >= WARMUP_H
    /* 활동 클랜은 두 시간마다 실제로 경기한다 */
    if (lap % 2 === 0) for (const r of rows) if (r.alive) r.lastMatch = now
    /* ★뽑기는 150곳이지만 한 시간에 실제로 닿는 것은 앞 REACH 곳뿐이다★ */
    const reached = pick(rows, now).slice(0, REACH)
    const inQueue = new Set(reached.map((r) => r.slug))
    if (measuring) {
      for (const lg of Object.keys(head)) head[lg]!.push(reached.filter((r) => r.lg === lg).length)
    }
    for (const r of reached) r.requestedAt = now
    for (const r of rows) {
      if (!r.alive) continue
      const w = inQueue.has(r.slug) ? 0 : (gap.get(r.slug) ?? 0) + 1
      gap.set(r.slug, measuring ? w : 0)
      if (measuring) worst.set(r.slug, Math.max(worst.get(r.slug) ?? 0, w))
    }
    now += H(1)
  }

  const minHeadPerLeague: Record<string, number> = {}
  for (const [lg, v] of Object.entries(head)) minHeadPerLeague[lg] = Math.min(...v)
  const maxGapH: Record<string, number> = { nolink: 0, supply: 0, sanply: 0 }
  for (const r of rows) {
    if (!r.alive) continue
    maxGapH[r.lg] = Math.max(maxGapH[r.lg] ?? 0, worst.get(r.slug) ?? 0)
  }
  return { minHeadPerLeague, maxGapH }
}

describe('수집 큐 — 리그 하나를 통째로 굶기지 않는다', () => {
  it('★옛 판은 실제로 리그를 통째로 굶긴다★ — 이 테스트가 무엇을 막는지 보여 준다', () => {
    const r = simulate(pickV1)
    /* 실측과 같은 모양 — 어떤 시간대에는 한 리그가 앞자리에 ★한 곳도★ 없다 */
    expect(Math.min(...Object.values(r.minHeadPerLeague))).toBe(0)
    expect(r.minHeadPerLeague.supply).toBeLessThan(5)
  })

  it('★새 판은 세 리그가 모두 앞자리에 들어온다★ (한 시간에 닿는 40곳)', () => {
    const r = simulate(pickV2)
    for (const lg of ['nolink', 'supply', 'sanply']) {
      /* 라운드로빈이면 40 ÷ 3 ≈ 13 곳씩이다. 10 아래로 내려가면 규칙이 깨진 것이다 */
      expect(r.minHeadPerLeague[lg], `${lg} 이 앞자리에서 밀렸다`).toBeGreaterThanOrEqual(10)
    }
  })

  it('★새 판은 어느 리그의 활동 클랜도 6시간 넘게 방치하지 않는다★', () => {
    const v2 = simulate(pickV2)
    for (const lg of ['nolink', 'supply', 'sanply']) {
      /* 실제로는 2~3시간이다. 6은 「굶주림」의 경계값 그대로다 */
      expect(v2.maxGapH[lg], `${lg} 의 활동 클랜이 굶었다`).toBeLessThan(6)
    }
    /* 옛 판은 같은 상황에서 7시간까지 벌어진다 — ★고쳐진 것이 맞는지 같이 본다★ */
    expect(Math.max(...Object.values(simulate(pickV1).maxGapH))).toBeGreaterThan(
      Math.max(...Object.values(v2.maxGapH)),
    )
  })

  it('★몫이 한 바퀴를 다 먹지 않는다★ — 남은 자리는 옛 규칙 그대로다', () => {
    /* 3리그 × 25 = 75 로 150 자리의 절반이다. 넘기면 조용한 클랜이 영영 안 돌아온다 */
    expect(LEAGUE_MIN_SLOTS * 3).toBeLessThanOrEqual(LIMIT / 2)
    expect(LEAGUE_MIN_SLOTS).toBeGreaterThan(0)
  })
})
