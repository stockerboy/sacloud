/** 임시 조사 — 적응형 클랜 폴링 시뮬레이션. 읽기만 한다. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { prisma } from '@sacloud/db'

const REPO = join(process.cwd(), '..', '..')
const LEAGUES = ['supply', 'daerule', 'sanply']

/* 후보 정책 — 시뮬레이션용 (실제 상수는 supplyPollingPolicy.ts) */
const CYCLE_MIN = 5
const HOT_H = 6
const WARM_H = 72
const COLD_H = 504
const INTERVAL: Record<string, number> = { hot: 5, warm: 30, cold: 360, dormant: 1440 }

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

async function main() {
  const now = new Date()
  const windowStart = new Date(now.getTime() - 30 * 86400_000)

  /** slug -> 경기 시각 배열 (오름차순) */
  const timeline = new Map<string, number[]>()
  /** slug -> 창 시작 이전 마지막 경기 */
  const before = new Map<string, number>()
  let registered = 0

  for (const slug of LEAGUES) {
    const file = join(REPO, 'packages', 'db', 'data', `supply-mirror-${slug}.json`)
    const raw = JSON.parse(readFileSync(file, 'utf8')) as {
      clans: Record<string, { division: number }>
    }
    const clanSlugs = Object.keys(raw.clans)
    registered += clanSlugs.length

    const league = await prisma.league.findUnique({ where: { slug }, select: { id: true } })
    if (!league) continue
    const rows = await prisma.leagueClan.findMany({
      where: { leagueId: league.id, clan: { slug: { in: clanSlugs } } },
      select: { id: true, clan: { select: { slug: true } } },
    })
    const key = (s: string) => `${slug}/${s}`
    const idToKey = new Map(rows.map((r) => [r.id, key(r.clan.slug)]))
    console.log(`${slug}: 등록 ${clanSlugs.length} · LeagueClan 매칭 ${rows.length}`)
    for (const s of clanSlugs) timeline.set(key(s), [])

    const ids = rows.map((r) => r.id)
    const matches = await prisma.match.findMany({
      where: {
        leagueId: league.id,
        origin: '3rd.supply',
        startAt: { gte: windowStart },
        OR: [{ redLeagueClanId: { in: ids } }, { blueLeagueClanId: { in: ids } }],
      },
      select: { startAt: true, redLeagueClanId: true, blueLeagueClanId: true },
      orderBy: { startAt: 'asc' },
    })
    console.log(`  최근 30일 경기 ${matches.length}`)
    for (const m of matches) {
      for (const id of [m.redLeagueClanId, m.blueLeagueClanId]) {
        const k = idToKey.get(id)
        if (k) timeline.get(k)!.push(m.startAt.getTime())
      }
    }
    /* 창 시작 이전 마지막 경기 */
    for (const r of rows) {
      const prev = await prisma.match.findFirst({
        where: {
          leagueId: league.id,
          origin: '3rd.supply',
          startAt: { lt: windowStart },
          OR: [{ redLeagueClanId: r.id }, { blueLeagueClanId: r.id }],
        },
        orderBy: { startAt: 'desc' },
        select: { startAt: true },
      })
      if (prev) before.set(key(r.clan.slug), prev.startAt.getTime())
    }
  }

  console.log(`\n등록 클랜 합계 ${registered} · 타임라인 ${timeline.size}`)

  /* --- 시뮬레이션 --- */
  const clans = [...timeline.keys()]
  const cursor = new Map<string, number>(clans.map((c) => [c, 0]))
  const last = new Map<string, number | null>(clans.map((c) => [c, before.get(c) ?? null]))

  const cycles = (30 * 24 * 60) / CYCLE_MIN
  const start = windowStart.getTime()
  /** KST 시간대별 [due 합, 사이클 수, 새경기 합] */
  const byHour = Array.from({ length: 24 }, () => ({ due: 0, cycles: 0, matches: 0 }))
  const tierByHour = Array.from({ length: 24 }, () => ({ hot: 0, warm: 0, cold: 0, dormant: 0 }))
  let totalDue = 0
  let maxDue = 0
  const seenPerClan = new Map<string, number>(clans.map((c) => [c, 0]))
  const gapMax = new Map<string, number>(clans.map((c) => [c, 0]))
  const lastScan = new Map<string, number>(clans.map((c) => [c, start]))

  for (let i = 0; i < cycles; i += 1) {
    const t = start + i * CYCLE_MIN * 60_000
    let newMatches = 0
    for (const c of clans) {
      const tl = timeline.get(c)!
      let idx = cursor.get(c)!
      while (idx < tl.length && tl[idx]! <= t) {
        last.set(c, tl[idx]!)
        idx += 1
        newMatches += 1
      }
      cursor.set(c, idx)
    }
    const kstHour = new Date(t + 9 * 3600_000).getUTCHours()
    byHour[kstHour]!.cycles += 1
    byHour[kstHour]!.matches += newMatches

    let due = 0
    for (const c of clans) {
      const lm = last.get(c)
      const hours = lm === null || lm === undefined ? Infinity : (t - lm) / 3600_000
      const tier = hours < HOT_H ? 'hot' : hours < WARM_H ? 'warm' : hours < COLD_H ? 'cold' : 'dormant'
      tierByHour[kstHour]![tier as 'hot'] += 1
      const ticks = Math.max(1, Math.round(INTERVAL[tier]! / CYCLE_MIN))
      if (i % ticks === hash(c) % ticks) {
        due += 1
        seenPerClan.set(c, seenPerClan.get(c)! + 1)
        const gap = t - lastScan.get(c)!
        if (gap > gapMax.get(c)!) gapMax.set(c, gap)
        lastScan.set(c, t)
      }
    }
    byHour[kstHour]!.due += due
    totalDue += due
    if (due > maxDue) maxDue = due
  }

  console.log(`\n사이클 ${cycles}회 · 평균 due ${(totalDue / cycles).toFixed(1)} 클랜/사이클 · 최대 ${maxDue}`)
  console.log('\n시간대(KST) | 평균 due 클랜 | 티어 평균(hot/warm/cold/dormant) | 새 경기/사이클')
  for (let h = 0; h < 24; h += 1) {
    const b = byHour[h]!
    const t = tierByHour[h]!
    const n = b.cycles
    console.log(
      `${String(h).padStart(2, '0')}시  due ${(b.due / n).toFixed(1).padStart(5)}  ` +
        `hot ${(t.hot / n).toFixed(1).padStart(5)} warm ${(t.warm / n).toFixed(1).padStart(5)} ` +
        `cold ${(t.cold / n).toFixed(1).padStart(5)} dorm ${(t.dormant / n).toFixed(1).padStart(5)}  ` +
        `새경기 ${(b.matches / n).toFixed(2)}`,
    )
  }
  const gaps = [...gapMax.values()].map((g) => g / 3600_000)
  gaps.sort((a, b) => b - a)
  console.log(`\n클랜별 최장 미조회 간격(시간) 상위: ${gaps.slice(0, 5).map((g) => g.toFixed(1)).join(' ')}`)
  console.log(`한 번도 안 본 클랜: ${[...seenPerClan.values()].filter((v) => v === 0).length}`)
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
