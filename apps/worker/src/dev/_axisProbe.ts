/* 임시 실측 — 읽기만 한다. 새 축(① 스나대스나 · ⑤ 선짤 · ⑥ 교환) 후보 재기. 보고 뒤 지운다 */
import { loadEnvFiles } from '../lib/env.js'
loadEnvFiles()
const { prisma } = await import('@sacloud/db')
const { clanByTeamNo, rosterOf, killsOf, weaponByPlayerOf } = await import('@sacloud/nexon')

/** `MM:SS` 를 누적 초로. `secondsOf` 와 같은 규칙 */
function secondsOf(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const m = /^(\d+):(\d{1,2})$/.exec(String(value).trim())
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}
const str = (v: unknown): string | null => {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

interface K {
  round: number
  at: number
  killer: string
  victim: string
  weapon: 0 | 1 | null
}

/** `killsOf` 와 같은 중복 제거 규칙(`라운드:죽은사람:시각`)을 쓰되 **시각도 함께** 남긴다 */
function killsWithTime(events: readonly Record<string, unknown>[]): K[] {
  const out: K[] = []
  const seen = new Set<string>()
  for (const e of events) {
    const subjectKilled = str(e['event_type']) === 'kill'
    const targetKilled = str(e['target_event_type']) === 'kill'
    if (subjectKilled === targetKilled) continue
    const killer = subjectKilled ? str(e['str_usn']) : str(e['target_str_usn'])
    const victim = subjectKilled ? str(e['target_str_usn']) : str(e['str_usn'])
    if (killer === null || victim === null) continue
    const round = Number(e['round'])
    const at = secondsOf(e['event_time'])
    if (!Number.isInteger(round) || round < 1 || at === null) continue
    const key = `${round}:${victim}:${str(e['event_time']) ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    const rw = subjectKilled ? str(e['weapon']) : str(e['target_weapon'])
    out.push({ round, at, killer, victim, weapon: rw === 'sniper' ? 1 : rw === 'riple' ? 0 : null })
  }
  return out.sort((a, b) => a.round - b.round || a.at - b.at)
}

/** 클랜 하나가 쌓는 분자·분모 */
interface Acc {
  matches: number
  rounds: number
  duelWon: number
  duelLost: number
  fbRounds: number
  fbOurs: number
  fbTied: number
  deaths: number
  tradeSameRound: number
  trade3: number
  trade5: number
  trade10: number
  tradeNextDeath: number
  /** 반반 나눠 담기 — 순위 안정성용. [duelWon, duelLost, fbOurs, fbRounds, tradeSame, deaths] */
  halfA: number[]
  halfB: number[]
}
const zero = (): Acc => ({
  matches: 0,
  rounds: 0,
  duelWon: 0,
  duelLost: 0,
  fbRounds: 0,
  fbOurs: 0,
  fbTied: 0,
  deaths: 0,
  tradeSameRound: 0,
  trade3: 0,
  trade5: 0,
  trade10: 0,
  tradeNextDeath: 0,
  halfA: [0, 0, 0, 0, 0, 0],
  halfB: [0, 0, 0, 0, 0, 0],
})

const clanOfNumber = new Map<string, string>()
for (const l of await prisma.barracksClanNumber.findMany({
  select: { clanNo: true, clanId: true },
})) {
  clanOfNumber.set(l.clanNo, l.clanId)
}

const acc = new Map<string, Acc>()
const done = new Set<string>()
let cursor: string | undefined
let rows = 0
let weaponUnknownKills = 0
let totalKills = 0
let badTime = 0

for (;;) {
  const batch = await prisma.barracksBattleLogRaw.findMany({
    where: { subjectKind: 'clan', status: 'ok' },
    select: { id: true, subject: true, matchKey: true, payload: true },
    orderBy: { id: 'asc' },
    take: 200,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  })
  if (batch.length === 0) break
  cursor = batch[batch.length - 1]!.id

  for (const row of batch) {
    if (done.has(row.matchKey)) continue
    const holder = row.payload as { raw?: unknown }
    const raw = (
      typeof holder?.raw === 'object' && holder.raw !== null ? holder.raw : row.payload
    ) as {
      battleLog?: Record<string, unknown>[]
      teamList?: { team_no?: string | null; clan_no?: string | null }[]
    }
    const events = raw.battleLog ?? []
    if (events.length === 0) continue
    done.add(row.matchKey)
    rows += 1

    const roster = rosterOf(events as never)
    const byTeam = clanByTeamNo(raw.teamList ?? [])
    const kills = killsWithTime(events)
    badTime += events.filter((e) => secondsOf(e['event_time']) === null).length
    if (kills.length === 0) continue
    totalKills += kills.length
    weaponUnknownKills += kills.filter((k) => k.weapon === null).length

    const weaponOf = weaponByPlayerOf(killsOf(events as never))
    const rounds = [...new Set(kills.map((k) => k.round))]

    for (const team of roster.teams) {
      const clanNo = byTeam.get(team)
      const clanId = clanNo ? clanOfNumber.get(clanNo) : undefined
      if (!clanId) continue
      let a = acc.get(clanId)
      if (!a) {
        a = zero()
        acc.set(clanId, a)
      }
      a.matches += 1
      a.rounds += rounds.length
      const half = a.matches % 2 === 0 ? a.halfB : a.halfA
      const ours = (u: string) => roster.teamOf.get(u) === team

      /* ── ① 스나 대 스나 ── */
      for (const k of kills) {
        if (weaponOf.get(k.killer) !== 1 || weaponOf.get(k.victim) !== 1) continue
        if (ours(k.killer) && !ours(k.victim)) {
          a.duelWon += 1
          half[0] = (half[0] ?? 0) + 1
        } else if (!ours(k.killer) && ours(k.victim)) {
          a.duelLost += 1
          half[1] = (half[1] ?? 0) + 1
        }
      }

      /* ── ⑤ 선짤 ── */
      for (const r of rounds) {
        const inRound = kills.filter((k) => k.round === r)
        if (inRound.length === 0) continue
        const first = Math.min(...inRound.map((k) => k.at))
        const firsts = inRound.filter((k) => k.at === first)
        const oursFirst = firsts.some((k) => ours(k.killer))
        const foeFirst = firsts.some((k) => !ours(k.killer))
        if (oursFirst && foeFirst) {
          a.fbTied += 1
          continue
        }
        a.fbRounds += 1
        half[3] = (half[3] ?? 0) + 1
        if (oursFirst) {
          a.fbOurs += 1
          half[2] = (half[2] ?? 0) + 1
        }
      }

      /* ── ⑥ 교환 ── */
      for (const d of kills) {
        if (!ours(d.victim) || ours(d.killer)) continue
        a.deaths += 1
        half[5] = (half[5] ?? 0) + 1
        const revenge = kills.filter(
          (k) => k.victim === d.killer && ours(k.killer) && k.round === d.round && k.at >= d.at,
        )
        if (revenge.length > 0) {
          const gap = Math.min(...revenge.map((k) => k.at)) - d.at
          a.tradeSameRound += 1
          half[4] = (half[4] ?? 0) + 1
          if (gap <= 3) a.trade3 += 1
          if (gap <= 5) a.trade5 += 1
          if (gap <= 10) a.trade10 += 1
        }
        /* (e) 그 킬러의 **다음 죽음**이 우리 손인가 — 시간을 안 본다 */
        const nextDeath = kills.find((k) => k.victim === d.killer && k.at > d.at)
        if (nextDeath && ours(nextDeath.killer)) a.tradeNextDeath += 1
      }
    }
  }
}

console.info(`훑은 경기 ${rows} · 클랜 ${acc.size}`)
console.info(
  `킬 ${totalKills} 중 무기 미상 ${weaponUnknownKills} (${((weaponUnknownKills / totalKills) * 100).toFixed(1)}%) · event_time 파싱 실패 이벤트 ${badTime}`,
)

const MIN = 20
const stat = (xs: number[]) => {
  if (xs.length === 0) return { n: 0, med: NaN, p10: NaN, p90: NaN, sd: NaN, zeros: 0 }
  const s = [...xs].sort((a, b) => a - b)
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(s.length * p))] as number
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length)
  return {
    n: xs.length,
    med: s[Math.floor(s.length / 2)] as number,
    p10: q(0.1),
    p90: q(0.9),
    sd,
    zeros: xs.filter((x) => x === 0).length,
  }
}
const spearman = (pairs: [number, number][]) => {
  if (pairs.length < 4) return NaN
  const rank = (vs: number[]) => {
    const idx = vs.map((v, i) => [v, i] as [number, number]).sort((a, b) => a[0] - b[0])
    const r = new Array<number>(vs.length)
    idx.forEach(([, i], k) => {
      r[i] = k + 1
    })
    return r
  }
  const ra = rank(pairs.map((p) => p[0]))
  const rb = rank(pairs.map((p) => p[1]))
  const n = pairs.length
  const m = (n + 1) / 2
  let num = 0
  let da = 0
  let db = 0
  for (let i = 0; i < n; i += 1) {
    num += ((ra[i] as number) - m) * ((rb[i] as number) - m)
    da += ((ra[i] as number) - m) ** 2
    db += ((rb[i] as number) - m) ** 2
  }
  return num / Math.sqrt(da * db)
}
const f = (x: number) => (Number.isFinite(x) ? x.toFixed(3) : '   —  ')
const line = (name: string, xs: number[]) => {
  const s = stat(xs)
  console.info(
    `    ${name.padEnd(24)} n=${String(s.n).padStart(3)}  중앙 ${f(s.med)}  10%${f(s.p10)} 90%${f(s.p90)}  표준편차 ${f(s.sd)}  0인곳 ${s.zeros}`,
  )
}

const all = [...acc.values()]

console.info(`\n=== ① 스나 대 스나 — 분모 후보 (스나킬 합 >= ${MIN}) ===`)
const d = all.filter((a) => a.duelWon + a.duelLost >= MIN)
line('(a) 우리/(우리+상대)', d.map((a) => a.duelWon / (a.duelWon + a.duelLost)))
line(
  '(b) 우리/상대',
  d.filter((a) => a.duelLost > 0).map((a) => a.duelWon / a.duelLost),
)
console.info(`        상대가 0 이라 무한대가 되는 클랜: ${d.filter((a) => a.duelLost === 0).length}`)
line('(c) (우리-상대)/라운드', d.map((a) => (a.duelWon - a.duelLost) / a.rounds))
console.info(
  `    (a)↔(b) 순위상관 ${f(spearman(d.filter((a) => a.duelLost > 0).map((a) => [a.duelWon / (a.duelWon + a.duelLost), a.duelWon / a.duelLost])))}`,
)
console.info(
  `    (a)↔(c) 순위상관 ${f(spearman(d.map((a) => [a.duelWon / (a.duelWon + a.duelLost), (a.duelWon - a.duelLost) / a.rounds])))}`,
)
console.info(
  `    반반 순위상관(안정성) (a) ${f(spearman(d.filter((a) => (a.halfA[0] ?? 0) + (a.halfA[1] ?? 0) >= 5 && (a.halfB[0] ?? 0) + (a.halfB[1] ?? 0) >= 5).map((a) => [(a.halfA[0] as number) / ((a.halfA[0] as number) + (a.halfA[1] as number)), (a.halfB[0] as number) / ((a.halfB[0] as number) + (a.halfB[1] as number))])))}`,
)
console.info(
  `    반반 순위상관(안정성) (c) ${f(spearman(d.filter((a) => (a.halfA[0] ?? 0) + (a.halfA[1] ?? 0) >= 5 && (a.halfB[0] ?? 0) + (a.halfB[1] ?? 0) >= 5).map((a) => [(a.halfA[0] as number) - (a.halfA[1] as number), (a.halfB[0] as number) - (a.halfB[1] as number)])))}`,
)

console.info(`\n=== ⑤ 선짤 (첫킬 있는 라운드 >= ${MIN}) ===`)
const fb = all.filter((a) => a.fbRounds >= MIN)
line('선짤 비율', fb.map((a) => a.fbOurs / a.fbRounds))
const tiedTotal = all.reduce((s, a) => s + a.fbTied, 0)
const fbTotal = all.reduce((s, a) => s + a.fbRounds, 0)
console.info(
  `    동시각 첫 킬이 양 팀에 있어 **뺀** 라운드: ${tiedTotal} / ${tiedTotal + fbTotal} (${((tiedTotal / (tiedTotal + fbTotal)) * 100).toFixed(2)}%)`,
)
console.info(
  `    반반 순위상관(안정성) ${f(spearman(fb.filter((a) => (a.halfA[3] ?? 0) >= 10 && (a.halfB[3] ?? 0) >= 10).map((a) => [(a.halfA[2] as number) / (a.halfA[3] as number), (a.halfB[2] as number) / (a.halfB[3] as number)])))}`,
)

console.info(`\n=== ⑥ 교환 — 「직후」 후보 (우리 사망 >= ${MIN}) ===`)
const tr = all.filter((a) => a.deaths >= MIN)
line('(a) 같은 라운드 안', tr.map((a) => a.tradeSameRound / a.deaths))
line('(b) 3초 안', tr.map((a) => a.trade3 / a.deaths))
line('(c) 5초 안', tr.map((a) => a.trade5 / a.deaths))
line('(d) 10초 안', tr.map((a) => a.trade10 / a.deaths))
line('(e) 그 킬러의 다음 죽음', tr.map((a) => a.tradeNextDeath / a.deaths))
const pairs: [string, (a: Acc) => number][] = [
  ['(b)3초', (a) => a.trade3],
  ['(c)5초', (a) => a.trade5],
  ['(d)10초', (a) => a.trade10],
  ['(e)다음죽음', (a) => a.tradeNextDeath],
]
for (const [name, get] of pairs) {
  console.info(
    `    (a)↔${name} 순위상관 ${f(spearman(tr.map((a) => [a.tradeSameRound / a.deaths, get(a) / a.deaths])))}`,
  )
}
console.info(
  `    반반 순위상관(안정성) (a)같은라운드 ${f(spearman(tr.filter((a) => (a.halfA[5] ?? 0) >= 10 && (a.halfB[5] ?? 0) >= 10).map((a) => [(a.halfA[4] as number) / (a.halfA[5] as number), (a.halfB[4] as number) / (a.halfB[5] as number)])))}`,
)

await prisma.$disconnect()
