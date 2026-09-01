/**
 * 클랜 육각형 **V2** 배선 대조 (D-217 · D-235).
 *
 * 읽기 전용 검증 도구다. 질의(`apps/web/lib/server/queries/clanHexV2.ts`)를 **직접 부른다** —
 * 이 컴퓨터에서는 dev 서버를 함부로 띄울 수 없어(D-187 · 다른 작업이 3000번을 쓴다)
 * HTTP 로는 잴 수 없다. `checkClanHexagon.mts`(옛 판)와 같은 성격이다.
 *
 * 재는 것
 *   ① `MatchClanHexV2` 적재 현황 (버전별 · 리그별)
 *   ② 가장 큰 클랜으로 `leagueClanHexV2()` 시간 (찬 캐시 / 빈 캐시)
 *   ③ `matchClanHexV2()` 시간
 *   ④ 축별로 실제 몇 클랜이나 값이 서는지 — 「측정중」이 정상인지 결함인지 가르는 숫자
 *
 * ```
 * pnpm --filter @sacloud/web exec tsx scripts/checkClanHexV2.mts
 * ```
 */
import { prisma } from '@sacloud/db'
import { CLAN_HEX_V2_AXIS_KEYS, CLAN_HEX_V2_CONFIG } from '@sacloud/contract'
import {
  clearClanHexV2DistributionCache,
  leagueClanHexV2,
  matchClanHexV2,
} from '../lib/server/queries/clanHexV2'

const ms = (start: bigint): string => `${Number(process.hrtime.bigint() - start) / 1e6}`.slice(0, 6)

async function main(): Promise<void> {
  /* ① 적재 현황 */
  const byVersion = await prisma.matchClanHexV2.groupBy({
    by: ['formulaVersion'],
    _count: { _all: true },
  })
  console.info('[적재] 버전별')
  for (const row of byVersion) {
    const mark = row.formulaVersion === CLAN_HEX_V2_CONFIG.formulaVersion ? ' ← 읽는 판' : ''
    console.info(`  ${row.formulaVersion}  ${row._count._all}행${mark}`)
  }

  const perLeague = await prisma.$queryRawUnsafe<
    { leagueId: string; slug: string; rows: number; clans: number }[]
  >(`
    select lc."leagueId", l.slug, count(*)::int as rows,
           count(distinct h."leagueClanId")::int as clans
    from "MatchClanHexV2" h
      join "LeagueClan" lc on lc.id = h."leagueClanId"
      join "League" l on l.id = lc."leagueId"
    where h."formulaVersion" = $1
    group by 1, 2 order by rows desc`,
    CLAN_HEX_V2_CONFIG.formulaVersion,
  )
  console.info('[적재] 리그별')
  for (const row of perLeague) console.info(`  ${row.slug}  ${row.rows}행 / 클랜 ${row.clans}곳`)

  const biggest = await prisma.$queryRawUnsafe<
    { leagueClanId: string; leagueId: string; n: number }[]
  >(`
    select h."leagueClanId", lc."leagueId", count(*)::int as n
    from "MatchClanHexV2" h join "LeagueClan" lc on lc.id = h."leagueClanId"
    where h."formulaVersion" = $1
    group by 1, 2 order by n desc limit 1`,
    CLAN_HEX_V2_CONFIG.formulaVersion,
  )
  const target = biggest[0]
  if (!target) {
    console.info('행이 없다. 집계 잡을 먼저 돌린다')
    await prisma.$disconnect()
    return
  }

  /* ② 가장 큰 클랜 — 빈 캐시(리그 전체를 접는다) / 찬 캐시 */
  clearClanHexV2DistributionCache()
  let at = process.hrtime.bigint()
  const cold = await leagueClanHexV2({ leagueClanId: target.leagueClanId, leagueId: target.leagueId })
  const coldMs = ms(at)
  at = process.hrtime.bigint()
  await leagueClanHexV2({ leagueClanId: target.leagueClanId, leagueId: target.leagueId })
  const warmMs = ms(at)
  console.info(
    `\n[클랜] ${target.leagueClanId} (${target.n}경기)  빈 캐시 ${coldMs}ms · 찬 캐시 ${warmMs}ms`,
  )
  if (cold) {
    console.info(`  잰 축 ${cold.measured}/6 · 경기 ${cold.matches} · 레드 ${cold.redRounds}/${cold.rounds}`)
    for (const axis of cold.axes) {
      console.info(
        `  ${axis.label.padEnd(6)} ${axis.text.padStart(8)}  ` +
          `정규화=${axis.value === null ? '—' : axis.value.toFixed(3)} ` +
          `분자/분모=${axis.numerator ?? '—'}/${axis.denominator ?? '—'} ${axis.pending ?? ''}`,
      )
    }
  }

  /* ③ 경기 상세 */
  const one = await prisma.matchClanHexV2.findFirst({
    where: { formulaVersion: CLAN_HEX_V2_CONFIG.formulaVersion },
    select: { matchId: true },
  })
  if (one) {
    at = process.hrtime.bigint()
    const pair = await matchClanHexV2(one.matchId)
    console.info(`\n[경기] ${one.matchId}  ${ms(at)}ms`)
    for (const [side, entry] of [['red', pair?.red], ['blue', pair?.blue]] as const) {
      if (!entry) {
        console.info(`  ${side}: 없음`)
        continue
      }
      console.info(
        `  ${side}: 잰 축 ${entry.hexagon.measured}/6  ` +
          entry.hexagon.axes
            .map((axis) => `${axis.label}=${axis.value === null ? '—' : axis.value.toFixed(2)}`)
            .join(' '),
      )
    }
  }

  /* ④ 축별로 몇 클랜이나 값이 서는가 */
  const clans = await prisma.$queryRawUnsafe<{ leagueClanId: string; leagueId: string }[]>(`
    select distinct h."leagueClanId", lc."leagueId"
    from "MatchClanHexV2" h join "LeagueClan" lc on lc.id = h."leagueClanId"
    where h."formulaVersion" = $1`,
    CLAN_HEX_V2_CONFIG.formulaVersion,
  )
  const standing = new Map<string, number>(CLAN_HEX_V2_AXIS_KEYS.map((key) => [key, 0]))
  let cards = 0
  const measuredHist = new Map<number, number>()
  for (const clan of clans) {
    const hexagon = await leagueClanHexV2({ leagueClanId: clan.leagueClanId, leagueId: clan.leagueId })
    if (!hexagon) continue
    cards += 1
    measuredHist.set(hexagon.measured, (measuredHist.get(hexagon.measured) ?? 0) + 1)
    for (const axis of hexagon.axes) {
      if (axis.value !== null) standing.set(axis.key, (standing.get(axis.key) ?? 0) + 1)
    }
  }
  console.info(`\n[축별] 카드가 뜨는 클랜 ${cards}곳 중 값이 서는 클랜 수`)
  for (const key of CLAN_HEX_V2_AXIS_KEYS) console.info(`  ${key.padEnd(12)} ${standing.get(key)}`)
  console.info('[잰 축 수 분포]')
  for (const [measured, count] of [...measuredHist].sort((a, b) => a[0] - b[0])) {
    console.info(`  ${measured}/6  ${count}곳`)
  }

  await prisma.$disconnect()
}

await main()
