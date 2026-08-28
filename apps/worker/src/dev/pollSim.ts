/**
 * 적응형 폴링 시뮬레이션 — **요청량과 발견 지연을 숫자로 재는** 도구 (B15 · D-168).
 *
 * 워크플로 주석의 숫자를 주석이 아니라 **실측**으로 남기려고 만들었다.
 * 로컬 DB 의 실제 경기 시각을 그대로 쓴다. **읽기만 한다** — 요청도 쓰기도 없다.
 *
 *   1. 등록 클랜(`LeagueClan.placement=false`)과 그 클랜이 뛴 경기를 읽는다
 *   2. 과거 N일을 사이클 단위로 되감으며 `selectSupplyClansToScan` 을 **그대로** 부른다
 *   3. 세 가지를 잰다
 *        · 사이클당 훑는 클랜 수 → 요청량
 *        · 클랜별 최장 미조회 간격 → "조용한 클랜을 놓치지 않는가"
 *        · **경기별 발견 지연** → "새 경기가 5분 안에 뜨는가"
 *
 * 발견 지연이 이 도구의 핵심이다. 경기는 클랜 **두 개**가 뛰므로 **둘 중 하나만**
 * 훑어도 발견된다. 클랜 단위 통계만 보면 그 사실이 안 보인다.
 */
import { prisma } from '@sacloud/db'
import {
  estimateSupplyCycleRequests,
  readSupplyPollingConfig,
  selectSupplyClansToScan,
  supplyClanTier,
  type SupplyClanActivity,
  type SupplyPollingConfig,
} from '../lib/supplyPollingPolicy.js'

const LEAGUES = (
  process.argv.find((a) => a.startsWith('--leagues='))?.split('=')[1] ?? 'supply,daerule,sanply'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const DAYS = Number(process.argv.find((a) => a.startsWith('--days='))?.split('=')[1] ?? 14)
/** 설정을 덮어써 가며 비교한다. `--set hot=5,warm=10` */
const OVERRIDES = process.argv.find((a) => a.startsWith('--set='))?.split('=').slice(1).join('=') ?? ''

const MIRROR = '3rd.supply'
const CYCLE_LABEL = (c: SupplyPollingConfig) =>
  `hot ${c.intervalMinutes.hot}/warm ${c.intervalMinutes.warm}/` +
  `cold ${c.intervalMinutes.cold}/dormant ${c.intervalMinutes.dormant}분 · ` +
  `경계 ${c.hotWithinHours}/${c.warmWithinHours}/${c.coldWithinHours}시간`

interface LeagueData {
  /** 등록 클랜 slug → 그 클랜이 뛴 경기 시각(오름차순) */
  byClan: Map<string, number[]>
  /** 경기 — 발견 지연의 단위. 등록 클랜이 하나도 없는 경기는 뺀다 */
  matches: { at: number; clans: string[] }[]
}

async function loadLeague(slug: string): Promise<LeagueData> {
  const empty: LeagueData = { byClan: new Map(), matches: [] }
  const league = await prisma.league.findUnique({ where: { slug }, select: { id: true } })
  if (!league) return empty

  /* **등록 클랜만** 본다. 수집이 훑는 모집단은 클랜랭킹 응답(= `placement:false`)이고
     (D-157), 상대로만 등장한 클랜(`placement:true`)은 체크포인트 `clans` 에 없다.
     이 조건을 빼면 모집단이 480개로 부풀어 요청량을 2.5배 과대평가한다 */
  const clans = await prisma.leagueClan.findMany({
    where: { leagueId: league.id, placement: false },
    select: { id: true, clan: { select: { slug: true } } },
  })
  const slugOf = new Map(clans.map((row) => [row.id, row.clan.slug]))
  const byClan = new Map<string, number[]>(clans.map((row) => [row.clan.slug, []]))

  /* 창보다 30일 더 과거까지 읽는다 — 창 시작 시점의 티어를 알려면 그 이전 경기가 필요하다 */
  const since = new Date(Date.now() - (DAYS + 30) * 86_400_000)
  const rows = await prisma.match.findMany({
    where: { leagueId: league.id, origin: MIRROR, startAt: { gte: since } },
    select: { startAt: true, redLeagueClanId: true, blueLeagueClanId: true },
  })

  const matches: { at: number; clans: string[] }[] = []
  for (const row of rows) {
    const at = row.startAt.getTime()
    const involved: string[] = []
    for (const id of [row.redLeagueClanId, row.blueLeagueClanId]) {
      const clanSlug = slugOf.get(id)
      if (clanSlug === undefined) continue
      involved.push(clanSlug)
      byClan.get(clanSlug)?.push(at)
    }
    /* 양쪽 다 미등록이면 우리가 훑는 목록에 없다 — 애초에 발견 대상이 아니다 */
    if (involved.length > 0) matches.push({ at, clans: involved })
  }
  for (const list of byClan.values()) list.sort((a, b) => a - b)
  matches.sort((a, b) => a.at - b.at)
  return { byClan, matches }
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))] as number
}

interface LeagueSim {
  slug: string
  clans: number
  perCycle: number[]
  /** 클랜별 최장 미조회 간격(ms) */
  worstGaps: number[]
  /** 경기별 발견 지연(분) */
  latencies: number[]
  deferred: number
  matches: number
  tiers: Record<string, number>
}

function simulate(slug: string, data: LeagueData, config: SupplyPollingConfig): LeagueSim {
  const slugs = [...data.byClan.keys()].sort()
  const cycleMs = config.cycleMinutes * 60_000
  const end = Date.now()
  const start = end - DAYS * 86_400_000
  const cycles = Math.floor((end - start) / cycleMs)

  const perCycle: number[] = []
  const lastSeen = new Map<string, number>(slugs.map((s) => [s, start]))
  const worstGap = new Map<string, number>(slugs.map((s) => [s, 0]))
  let deferred = 0

  /* 창 안에 시작된 경기만 지연을 잰다. 아직 발견되지 않았으면 창 끝까지 기다린 것으로 본다 */
  const pending = data.matches.filter((m) => m.at >= start && m.at < end)
  const found = new Array<number>(pending.length).fill(-1)
  /** 경기 인덱스를 시각순으로 훑기 위한 커서 */
  let firstUnfound = 0

  /**
   * 클랜별 "그 시점까지 우리가 **발견한** 마지막 경기".
   *
   * 티어를 실제 경기 시각으로 매기면 **순환 낙관**이 된다 — 아직 못 찾은 경기가
   * 그 클랜을 `hot` 으로 만들어 주는 셈이라, 조용하던 클랜이 다시 뛰기 시작한
   * 바로 그 경기를 즉시 찾는 것으로 나온다. 실제로는 그 경기를 **찾은 뒤에야**
   * `hot` 이 된다. 그래서 여기서는 발견된 경기만 반영한다.
   *
   * 창 시작 이전 경기는 이미 DB 에 있으므로 발견된 것으로 본다.
   */
  const lastKnown = new Map<string, number | null>(slugs.map((s) => [s, null]))
  for (const [clanSlug, times] of data.byClan) {
    let known: number | null = null
    for (const t of times) {
      if (t < start) known = t
      else break
    }
    lastKnown.set(clanSlug, known)
  }

  for (let index = 0; index < cycles; index += 1) {
    const nowMs = start + index * cycleMs
    const now = new Date(nowMs)

    const activity: SupplyClanActivity[] = slugs.map((clanSlug) => {
      const last = lastKnown.get(clanSlug) ?? null
      return { slug: clanSlug, lastMatchAt: last === null ? null : new Date(last) }
    })

    const selection = selectSupplyClansToScan({ clans: activity, now, config })
    perCycle.push(selection.scan.length)
    deferred += selection.deferred

    const scanned = new Set(selection.scan)
    for (const clanSlug of selection.scan) {
      const gap = nowMs - (lastSeen.get(clanSlug) ?? start)
      if (gap > (worstGap.get(clanSlug) ?? 0)) worstGap.set(clanSlug, gap)
      lastSeen.set(clanSlug, nowMs)
    }

    /* 이번 사이클에 훑은 클랜이 낀 경기 중, 아직 못 찾았고 이미 끝난 것을 발견한다.
       발견한 경기는 **양쪽 클랜 모두**의 활동량이 된다 — 적재된 `Match` 행 하나가
       red·blue 두 진영을 다 들고 있어서, 어느 쪽을 훑어 찾았든 둘 다 최신이 된다 */
    if (scanned.size > 0) {
      for (let i = firstUnfound; i < pending.length; i += 1) {
        const match = pending[i] as { at: number; clans: string[] }
        if (match.at > nowMs) break
        if (found[i] !== -1) continue
        if (!match.clans.some((c) => scanned.has(c))) continue
        found[i] = nowMs
        for (const clanSlug of match.clans) {
          if ((lastKnown.get(clanSlug) ?? -1) < match.at) lastKnown.set(clanSlug, match.at)
        }
      }
      while (firstUnfound < pending.length && found[firstUnfound] !== -1) firstUnfound += 1
    }
  }

  for (const clanSlug of slugs) {
    const gap = end - (lastSeen.get(clanSlug) ?? start)
    if (gap > (worstGap.get(clanSlug) ?? 0)) worstGap.set(clanSlug, gap)
  }

  const latencies: number[] = []
  for (let i = 0; i < pending.length; i += 1) {
    const at = (pending[i] as { at: number }).at
    const foundAt = found[i] as number
    latencies.push(((foundAt === -1 ? end : foundAt) - at) / 60_000)
  }

  const tiers: Record<string, number> = { hot: 0, warm: 0, cold: 0, dormant: 0 }
  for (const clanSlug of slugs) {
    const times = data.byClan.get(clanSlug) as number[]
    const last = times.length > 0 ? new Date(times[times.length - 1] as number) : null
    const tier = supplyClanTier(last, new Date(end), config)
    tiers[tier] = (tiers[tier] ?? 0) + 1
  }

  return {
    slug,
    clans: slugs.length,
    perCycle,
    worstGaps: [...worstGap.values()].sort((a, b) => a - b),
    latencies: latencies.sort((a, b) => a - b),
    deferred,
    matches: pending.length,
    tiers,
  }
}

function report(config: SupplyPollingConfig, sims: LeagueSim[]): void {
  console.log(`\n===== 설정: 사이클 ${config.cycleMinutes}분 · ${CYCLE_LABEL(config)} =====`)

  const perCycleTotal: number[] = []
  const allLatencies: number[] = []
  let clans = 0
  let worstGapH = 0
  let matches = 0

  for (const sim of sims) {
    const avg = sim.perCycle.reduce((a, b) => a + b, 0) / sim.perCycle.length
    const sorted = [...sim.perCycle].sort((a, b) => a - b)
    const worst = (sim.worstGaps[sim.worstGaps.length - 1] ?? 0) / 3_600_000
    console.log(
      `[${sim.slug}] 등록 클랜 ${sim.clans} · 경기 ${sim.matches}\n` +
        `  훑은 클랜/사이클 평균 ${avg.toFixed(1)} · p95 ${percentile(sorted, 0.95)} · 최대 ${sorted[sorted.length - 1]}\n` +
        `  최장 미조회 ${worst.toFixed(1)}시간 · 상한으로 미룬 누적 ${sim.deferred}\n` +
        `  발견 지연(분) 중앙 ${percentile(sim.latencies, 0.5).toFixed(1)} · ` +
        `p90 ${percentile(sim.latencies, 0.9).toFixed(1)} · p99 ${percentile(sim.latencies, 0.99).toFixed(1)} · ` +
        `최대 ${(sim.latencies[sim.latencies.length - 1] ?? 0).toFixed(1)}\n` +
        `  티어 hot ${sim.tiers['hot']} · warm ${sim.tiers['warm']} · cold ${sim.tiers['cold']} · dormant ${sim.tiers['dormant']}`,
    )
    for (let i = 0; i < sim.perCycle.length; i += 1) {
      perCycleTotal[i] = (perCycleTotal[i] ?? 0) + (sim.perCycle[i] as number)
    }
    allLatencies.push(...sim.latencies)
    clans += sim.clans
    matches += sim.matches
    if (worst > worstGapH) worstGapH = worst
  }
  if (perCycleTotal.length === 0) return

  allLatencies.sort((a, b) => a - b)
  const avgAll = perCycleTotal.reduce((a, b) => a + b, 0) / perCycleTotal.length
  const sortedAll = [...perCycleTotal].sort((a, b) => a - b)
  const cyclesPerHour = 60 / config.cycleMinutes
  const newPerCycle = matches / perCycleTotal.length

  const req = (clansScanned: number) =>
    estimateSupplyCycleRequests({
      leagueLookups: 0, // 리그 숫자 id 는 DB 에서 읽는다 (요청 0)
      rankPages: 14, // 리그 3개 × 부리그 × 페이지
      clansScanned,
      pagesPerClan: 1, // knownPagesToStop=1 — 목록이 최신순이라 한 장이면 따라잡는다
      newMatchDetails: newPerCycle,
    })

  const within5 = allLatencies.filter((v) => v <= 5).length / allLatencies.length
  const within10 = allLatencies.filter((v) => v <= 10).length / allLatencies.length
  const within30 = allLatencies.filter((v) => v <= 30).length / allLatencies.length

  console.log(
    `─── 세 리그 합계 ───\n` +
      `등록 클랜 ${clans} · 경기 ${matches}건 (${DAYS}일) = ${(matches / DAYS).toFixed(1)}건/일\n` +
      `훑은 클랜/사이클 평균 ${avgAll.toFixed(1)} · p95 ${percentile(sortedAll, 0.95)} · 최대 ${sortedAll[sortedAll.length - 1]}\n` +
      `최장 미조회 ${worstGapH.toFixed(1)}시간\n` +
      `요청/사이클 평균 ${req(avgAll).toFixed(1)} · p95 ${req(percentile(sortedAll, 0.95)).toFixed(1)}\n` +
      `**요청/시간 평균 ${(req(avgAll) * cyclesPerHour).toFixed(0)} · p95 ${(req(percentile(sortedAll, 0.95)) * cyclesPerHour).toFixed(0)}**\n` +
      `발견 지연(분) 중앙 ${percentile(allLatencies, 0.5).toFixed(1)} · p90 ${percentile(allLatencies, 0.9).toFixed(1)} · ` +
      `p99 ${percentile(allLatencies, 0.99).toFixed(1)} · 최대 ${(allLatencies[allLatencies.length - 1] ?? 0).toFixed(1)}\n` +
      `**5분 이내 ${(within5 * 100).toFixed(1)}% · 10분 이내 ${(within10 * 100).toFixed(1)}% · 30분 이내 ${(within30 * 100).toFixed(1)}%**`,
  )
}

async function main(): Promise<void> {
  const base = readSupplyPollingConfig()
  const data = new Map<string, LeagueData>()
  for (const slug of LEAGUES) data.set(slug, await loadLeague(slug))

  /** 비교할 설정들 — 기본 + `--set` 으로 준 변형 */
  const configs: SupplyPollingConfig[] = [base]
  if (OVERRIDES !== '') {
    for (const spec of OVERRIDES.split(';')) {
      const next: SupplyPollingConfig = {
        ...base,
        intervalMinutes: { ...base.intervalMinutes },
      }
      for (const pair of spec.split(',')) {
        const [key, raw] = pair.split('=')
        const value = Number(raw)
        if (!Number.isFinite(value)) continue
        if (key === 'hot' || key === 'warm' || key === 'cold' || key === 'dormant') {
          next.intervalMinutes[key] = value
        } else if (key === 'hotH') next.hotWithinHours = value
        else if (key === 'warmH') next.warmWithinHours = value
        else if (key === 'coldH') next.coldWithinHours = value
        else if (key === 'cycle') next.cycleMinutes = value
        else if (key === 'max') next.maxClansPerCycle = value
      }
      configs.push(next)
    }
  }

  for (const config of configs) {
    const sims: LeagueSim[] = []
    for (const slug of LEAGUES) {
      const league = data.get(slug)
      if (!league || league.byClan.size === 0) continue
      sims.push(simulate(slug, league, config))
    }
    report(config, sims)
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error)
    await prisma.$disconnect()
    process.exit(1)
  })
