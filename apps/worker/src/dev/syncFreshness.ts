/**
 * **증분 동기화가 실제로 무엇을 넣고 있나** — 신선도 실측 (2026-09-01 · D-224 후속).
 *
 * ```
 * node scripts/prod-run.mjs sync-freshness
 * pnpm --filter @sacloud/worker exec tsx src/dev/syncFreshness.ts   # 로컬
 * ```
 *
 * ── 왜 필요한가
 *   「최신 경기가 26시간 전」은 두 가지 중 하나다. **둘은 처방이 정반대다.**
 *
 *     ① 원본에 새 경기가 없다        → `ingestedAt` 은 최근인데 `startAt` 이 낡았다
 *     ② 우리가 못 받고 있다          → `ingestedAt` 자체가 낡았다
 *
 *   그래서 두 시각을 **따로** 잰다. 그리고 미러가 훑을 클랜을 실제로 고를 수 있는지
 *   (`placement=false` 모집단 · 적응형 선택 결과)를 같은 자리에서 확인한다 —
 *   모집단이 0이면 요청이 한 건도 안 나가고, 그래도 잡은 **성공**으로 끝난다.
 *
 * ── **읽기만 한다.** 한 줄도 쓰지 않는다.
 */
import { prisma } from '@sacloud/db'
import {
  SUPPLY_POLLING_DEFAULTS,
  selectSupplyClansToScan,
  type SupplyClanActivity,
} from '../lib/supplyPollingPolicy'

const LEAGUES = ['supply', 'daerule', 'sanply', 'nolink']
const now = new Date()
const kst = (d: Date | null | undefined) =>
  d ? new Date(d.getTime() + 9 * 3600_000).toISOString().replace('T', ' ').slice(0, 19) + ' KST' : '—'
const hoursAgo = (d: Date | null | undefined) =>
  d ? ((now.getTime() - d.getTime()) / 3600_000).toFixed(1) + 'h 전' : '—'
const dayKst = (d: Date) => new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10)

console.info(`기준 시각  ${kst(now)}\n`)

for (const slug of LEAGUES) {
  const league = await prisma.league.findUnique({ where: { slug }, select: { id: true, name: true } })
  if (!league) {
    console.info(`■ ${slug}  — 리그가 없다`)
    continue
  }
  console.info(`■ ${slug}  (${league.name})`)

  /* 1) 미러가 훑을 모집단. `registeredClansFromDb` 와 **같은 조건**이다 (placement=false) */
  const [total, scannable, noSourceId] = await Promise.all([
    prisma.leagueClan.count({ where: { leagueId: league.id } }),
    prisma.leagueClan.count({ where: { leagueId: league.id, placement: false } }),
    prisma.leagueClan.count({
      where: { leagueId: league.id, placement: false, sourceLeagueClanId: null },
    }),
  ])
  console.info(`  등록 클랜        ${total}  ·  미러가 훑는 모집단(placement=false) ${scannable}  ·  그중 원본 id 없음 ${noSourceId}`)

  /* 2) 경기 신선도 — 원본 시각과 우리가 넣은 시각을 **따로** 본다 */
  const where = { leagueId: league.id, origin: '3rd.supply' as const }
  const matches = await prisma.match.count({ where })
  const newestStart = await prisma.match.findFirst({ where, orderBy: { startAt: 'desc' }, select: { startAt: true } })
  const newestIngest = await prisma.match.findFirst({ where, orderBy: { ingestedAt: 'desc' }, select: { ingestedAt: true, startAt: true } })
  console.info(`  경기(3rd.supply) ${matches}`)
  console.info(`    최신 경기 startAt     ${kst(newestStart?.startAt)}  (${hoursAgo(newestStart?.startAt)})`)
  console.info(`    마지막 적재 ingestedAt ${kst(newestIngest?.ingestedAt)}  (${hoursAgo(newestIngest?.ingestedAt)})`)

  /* 3) 최근 8일 — 날짜별로 「그날 열린 경기」와 「그날 우리가 넣은 경기」 */
  const since = new Date(now.getTime() - 8 * 24 * 3600_000)
  const recent = await prisma.match.findMany({
    where: { ...where, OR: [{ startAt: { gte: since } }, { ingestedAt: { gte: since } }] },
    select: { startAt: true, ingestedAt: true },
  })
  const byStart = new Map<string, number>()
  const byIngest = new Map<string, number>()
  for (const m of recent) {
    if (m.startAt >= since) byStart.set(dayKst(m.startAt), (byStart.get(dayKst(m.startAt)) ?? 0) + 1)
    if (m.ingestedAt >= since) byIngest.set(dayKst(m.ingestedAt), (byIngest.get(dayKst(m.ingestedAt)) ?? 0) + 1)
  }
  const days = [...new Set([...byStart.keys(), ...byIngest.keys()])].sort()
  if (days.length > 0) {
    console.info(`    날짜(KST)     열린 경기   적재한 경기`)
    for (const d of days) {
      console.info(`      ${d}      ${String(byStart.get(d) ?? 0).padStart(6)}   ${String(byIngest.get(d) ?? 0).padStart(9)}`)
    }
  }

  /* 3-b) 경기 사이 간격 — **알람 임계값을 추측하지 않으려고 잰다** (D-225).
     원본이 조용한 시간대(새벽)에도 임계값이 울면 알람이 무뎌진다. D-224 의 교훈이다. */
  const starts = recent
    .filter((m) => m.startAt >= since)
    .map((m) => m.startAt.getTime())
    .sort((a, b) => a - b)
  if (starts.length > 2) {
    const gaps: number[] = []
    for (let i = 1; i < starts.length; i += 1) gaps.push((starts[i]! - starts[i - 1]!) / 3600_000)
    gaps.sort((a, b) => a - b)
    const q = (p: number) => gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * p))]!.toFixed(1)
    const overCount = (h: number) => gaps.filter((g) => g > h).length
    console.info(`    최근 8일 경기 간격(h)  중앙 ${q(0.5)} · p90 ${q(0.9)} · p99 ${q(0.99)} · 최대 ${gaps[gaps.length - 1]!.toFixed(1)}`)
    console.info(`      3h 초과 ${overCount(3)}회 · 6h 초과 ${overCount(6)}회 · 12h 초과 ${overCount(12)}회  (총 ${gaps.length}구간)`)
  }

  /* 4) 적응형 폴링이 **지금** 몇 개를 고르나. 모집단이 0이면 여기서 0이 나온다 */
  if (scannable > 0) {
    const rows = await prisma.leagueClan.findMany({
      where: { leagueId: league.id, placement: false },
      select: { id: true, clan: { select: { slug: true } } },
    })
    const ids = rows.map((r) => r.id)
    const [red, blue] = await Promise.all([
      prisma.match.groupBy({ by: ['redLeagueClanId'], where: { origin: '3rd.supply', redLeagueClanId: { in: ids } }, _max: { startAt: true } }),
      prisma.match.groupBy({ by: ['blueLeagueClanId'], where: { origin: '3rd.supply', blueLeagueClanId: { in: ids } }, _max: { startAt: true } }),
    ])
    const last = new Map<string, Date>()
    const keep = (id: string, at: Date | null) => {
      if (!at) return
      const k = last.get(id)
      if (!k || k < at) last.set(id, at)
    }
    for (const r of red) keep(r.redLeagueClanId, r._max.startAt)
    for (const b of blue) keep(b.blueLeagueClanId, b._max.startAt)
    const clans: SupplyClanActivity[] = rows.map((r) => ({
      slug: r.clan.slug,
      lastMatchAt: last.get(r.id) ?? null,
    }))
    const sel = selectSupplyClansToScan({ clans, now, config: SUPPLY_POLLING_DEFAULTS })
    console.info(`    이번 사이클에 훑을 클랜  ${sel.scan.length} / ${clans.length}  (미룬 것 ${sel.deferred} · 하한으로 채운 것 ${sel.toppedUp})`)
    console.info(`    티어별  ${JSON.stringify(sel.byTier)}`)
    const never = clans.filter((c) => c.lastMatchAt === null).length
    console.info(`    경기 기록이 아예 없는 클랜  ${never}`)
  } else {
    console.info(`    ⚠ 모집단이 0이다 — 미러는 이 리그에서 **한 클랜도 훑지 않는다**`)
  }
  console.info('')
}

await prisma.$disconnect()
