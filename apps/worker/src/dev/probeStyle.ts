/**
 * 임시 조사 — 플레이스타일 바 후보 재료의 **반분신뢰도**를 잰다. 읽기 전용.
 * 조사가 끝나면 지운다.
 */
import { prisma } from '@sacloud/db'
import {
  clanByTeamNo,
  roundClocksOf,
  roundResultsOf,
  roundSidesOf,
  rosterOf,
  secondsOf,
  type ClanRoundEvent,
} from '@sacloud/nexon'

const TEAM = 5

const s = (v: unknown): string | null => {
  if (v === null || v === undefined) return null
  const t = String(v).trim()
  return t === '' ? null : t
}
const nOr = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
const rnum = (v: unknown): number | null => {
  const t = s(v)
  if (t === null) return null
  const n = Number(t)
  return Number.isInteger(n) && n >= 1 ? n : null
}

interface Acc {
  rounds: number
  opening: number
  delaySum: number
  delayN: number
  sx: number
  sy: number
  sx2: number
  sy2: number
  sn: number
  survived: number
  survSum: number
  survN: number
  distSum: number
  distN: number
}

const zero = (): Acc => ({
  rounds: 0,
  opening: 0,
  delaySum: 0,
  delayN: 0,
  sx: 0,
  sy: 0,
  sx2: 0,
  sy2: 0,
  sn: 0,
  survived: 0,
  survSum: 0,
  survN: 0,
  distSum: 0,
  distN: 0,
})

type Pair = { defense: Acc; attack: Acc }

/** half(0,1,2=전체) → usn → 진영별 집계 */
const bank = new Map<number, Map<string, Pair>>([
  [0, new Map()],
  [1, new Map()],
  [2, new Map()],
])

const get = (half: number, usn: string): Pair => {
  const m = bank.get(half) as Map<string, Pair>
  let e = m.get(usn)
  if (!e) {
    e = { defense: zero(), attack: zero() }
    m.set(usn, e)
  }
  return e
}

/* 로컬 DB 는 커넥션 5개 제한이고 다른 작업이 동시에 돈다. 끊기면 기다렸다 다시 건다 */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
async function retry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let wait = 2000
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await fn()
    } catch (error) {
      if (attempt >= 40) throw error
      if (attempt === 1 || attempt % 5 === 0) {
        console.log('  대기중(' + label + ' 시도 ' + attempt + ') — ' + String(error).slice(0, 80))
      }
      await sleep(wait)
      wait = Math.min(15000, Math.round(wait * 1.4))
    }
  }
}

/* 원문은 한꺼번에 못 읽는다 — 페이로드가 커서 커넥션이 끊긴다.
   `matchKey` 순으로 조각내 읽고, 같은 경기의 응답들이 붙어 오게 한다 */
const ids = await retry('id 목록', () =>
  prisma.barracksBattleLogRaw.findMany({
    where: { subjectKind: 'clan', status: 'ok' },
    select: { id: true, matchKey: true },
    orderBy: [{ matchKey: 'asc' }, { id: 'asc' }],
  }),
)
console.log('클랜 원문 줄', ids.length)

const CHUNK = 80
const best = new Map<string, { subject: string; payload: unknown; n: number }>()
for (let i = 0; i < ids.length; i += CHUNK) {
  const slice = ids.slice(i, i + CHUNK).map((r) => r.id)
  const rows = await retry('원문 ' + i, () =>
    prisma.barracksBattleLogRaw.findMany({
      where: { id: { in: slice } },
      select: { matchKey: true, subject: true, payload: true },
    }),
  )
  for (const r of rows) {
    const p = r.payload as { battleLog?: unknown[] } | null
    const n = Array.isArray(p?.battleLog) ? (p?.battleLog as unknown[]).length : 0
    const cur = best.get(r.matchKey)
    if (!cur || n > cur.n) best.set(r.matchKey, { subject: r.subject, payload: r.payload, n })
  }
}

interface K {
  round: number
  at: number
  killer: string
  victim: string
  kx: number | null
  ky: number | null
  dx: number | null
  dy: number | null
}

let used = 0
let sidedRounds = 0
let totalRounds = 0
const keys = [...best.keys()].sort()

for (let i = 0; i < keys.length; i += 1) {
  const key = keys[i] as string
  const entry = best.get(key) as { subject: string; payload: unknown }
  const raw = entry.payload as {
    battleLog?: ClanRoundEvent[]
    teamList?: { team_no?: unknown; clan_no?: unknown }[]
  } | null
  const events = raw?.battleLog ?? []
  if (events.length === 0) continue

  const clanByTeam = clanByTeamNo((raw?.teamList ?? []) as never)
  const teamNo = [...clanByTeam.entries()].find(([, no]) => no === entry.subject)?.[0]
  if (teamNo === undefined) continue

  const roster = rosterOf(events as never)
  if (roster.teams.length !== 2) continue
  if (!roster.teams.every((t) => roster.sizeOf.get(t) === TEAM)) continue

  const clocks = roundClocksOf(events)
  if (clocks.size === 0) continue
  const totalR = Math.max(...clocks.keys())
  const results = roundResultsOf(events as never)
  const wonRound = (r: number) => results.get(r) ?? null
  const map = roundSidesOf(events as never, teamNo, totalR, wonRound)
  if (map.conflict || map.switchRound === null) continue
  used += 1

  const kills: K[] = []
  const seen = new Set<string>()
  for (const ev of events as unknown as Record<string, unknown>[]) {
    const round = rnum(ev.round)
    const at = secondsOf(ev.event_time)
    if (round === null || at === null) continue
    const sk = s(ev.event_type) === 'kill'
    const tk = s(ev.target_event_type) === 'kill'
    if (sk === tk) continue
    const killer = sk ? s(ev.str_usn) : s(ev.target_str_usn)
    const victim = sk ? s(ev.target_str_usn) : s(ev.str_usn)
    if (killer === null || victim === null) continue
    const dedupe = round + ':' + victim + ':' + at
    if (seen.has(dedupe)) continue
    seen.add(dedupe)
    kills.push({
      round,
      at,
      killer,
      victim,
      kx: nOr(ev.kill_x),
      ky: nOr(ev.kill_y),
      dx: nOr(ev.death_x),
      dy: nOr(ev.death_y),
    })
  }
  kills.sort((a, b) => a.at - b.at)

  const half = i % 2

  for (const [round, clock] of clocks) {
    const mySide = map.side.get(round)
    totalRounds += 1
    if (mySide === undefined) continue
    sidedRounds += 1

    const rk = kills.filter((k) => k.round === round)
    if (rk.length === 0) continue
    const first = rk[0] as K
    const t0 = clock.first
    const deathAt = new Map<string, number>()
    for (const k of rk) if (!deathAt.has(k.victim)) deathAt.set(k.victim, k.at)

    for (const [usn, team] of roster.teamOf) {
      const side =
        team === teamNo ? mySide : mySide === 'attack' ? 'defense' : 'attack'
      const mine = rk.filter((k) => k.killer === usn)
      const myDeath = deathAt.get(usn) ?? null
      const myKilled = rk.find((k) => k.victim === usn)

      for (const h of [half, 2]) {
        const a = get(h, usn)[side]
        a.rounds += 1
        if (first.killer === usn || first.victim === usn) a.opening += 1

        let f = Infinity
        for (const k of mine) if (k.at < f) f = k.at
        if (myDeath !== null && myDeath < f) f = myDeath
        if (Number.isFinite(f)) {
          a.delaySum += f - t0
          a.delayN += 1
        }

        if (myDeath === null) a.survived += 1
        else {
          a.survSum += myDeath - t0
          a.survN += 1
        }

        for (const k of mine) {
          if (k.kx === null || k.ky === null) continue
          a.sx += k.kx
          a.sy += k.ky
          a.sx2 += k.kx * k.kx
          a.sy2 += k.ky * k.ky
          a.sn += 1
          if (k.dx !== null && k.dy !== null) {
            a.distSum += Math.hypot(k.kx - k.dx, k.ky - k.dy)
            a.distN += 1
          }
        }
        if (myKilled && myKilled.dx !== null && myKilled.dy !== null) {
          a.sx += myKilled.dx
          a.sy += myKilled.dy
          a.sx2 += myKilled.dx * myKilled.dx
          a.sy2 += myKilled.dy * myKilled.dy
          a.sn += 1
        }
      }
    }
  }
}

console.log('경기 사용', used, '/', best.size, ' 진영 아는 라운드', sidedRounds, '/', totalRounds)

const metrics: Record<string, (a: Acc) => number | null> = {
  오프닝관여율: (a) => (a.rounds >= 1 ? a.opening / a.rounds : null),
  첫교전지연: (a) => (a.delayN >= 1 ? a.delaySum / a.delayN : null),
  자리흩어짐: (a) =>
    a.sn >= 2
      ? Math.sqrt(
          Math.max(0, a.sx2 / a.sn - (a.sx / a.sn) ** 2) +
            Math.max(0, a.sy2 / a.sn - (a.sy / a.sn) ** 2),
        )
      : null,
  생존율: (a) => (a.rounds >= 1 ? a.survived / a.rounds : null),
  생존시간: (a) => (a.survN >= 1 ? a.survSum / a.survN : null),
  교전거리: (a) => (a.distN >= 1 ? a.distSum / a.distN : null),
}

const pear = (xs: number[], ys: number[]): number | null => {
  const n = xs.length
  if (n < 3) return null
  const mx = xs.reduce((t, x) => t + x, 0) / n
  const my = ys.reduce((t, y) => t + y, 0) / n
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < n; i += 1) {
    const dx = (xs[i] as number) - mx
    const dy = (ys[i] as number) - my
    sxy += dx * dy
    sxx += dx * dx
    syy += dy * dy
  }
  if (sxx === 0 || syy === 0) return null
  return sxy / Math.sqrt(sxx * syy)
}

for (const MIN of [10, 20, 40]) {
  console.log('\n=== 최소 라운드 ' + MIN + ' · 반분신뢰도(Spearman-Brown) ===')
  for (const side of ['defense', 'attack'] as const) {
    const out: string[] = []
    for (const [name, fn] of Object.entries(metrics)) {
      const xs: number[] = []
      const ys: number[] = []
      const A = bank.get(0) as Map<string, Pair>
      const B = bank.get(1) as Map<string, Pair>
      for (const [usn, e] of A) {
        const f = B.get(usn)
        if (!f) continue
        if (e[side].rounds < MIN || f[side].rounds < MIN) continue
        const x = fn(e[side])
        const y = fn(f[side])
        if (x === null || y === null) continue
        xs.push(x)
        ys.push(y)
      }
      const r = pear(xs, ys)
      const sb = r === null ? null : (2 * r) / (1 + r)
      out.push(
        name +
          ' n=' +
          xs.length +
          ' r=' +
          (r === null ? '-' : r.toFixed(3)) +
          ' SB=' +
          (sb === null ? '-' : sb.toFixed(3)),
      )
    }
    console.log('  ' + (side === 'defense' ? '블루(수비)' : '레드(공격)'))
    for (const line of out) console.log('    ' + line)
  }
}

const ALL = bank.get(2) as Map<string, Pair>
console.log('')
for (const MIN of [10, 20, 30, 40, 60]) {
  let d = 0
  let a = 0
  let both = 0
  for (const [, e] of ALL) {
    const dd = e.defense.rounds >= MIN
    const aa = e.attack.rounds >= MIN
    if (dd) d += 1
    if (aa) a += 1
    if (dd && aa) both += 1
  }
  console.log(
    '최소 ' + String(MIN).padStart(2) + ' 라운드 → 수비 ' + d + '명 · 공격 ' + a + '명 · 둘 다 ' + both + '명 (전체 ' + ALL.size + '명)',
  )
}

await prisma.$disconnect()
