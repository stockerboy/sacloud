/**
 * `side_clan_mismatch` 원인 조사 — **읽기만 한다. 한 줄도 쓰지 않는다** (D-179).
 *
 * ── 무엇을 재나
 *
 * `runRate` 가 래더에서 빼는 `side_clan_mismatch` 경기를 **같은 판정 규칙으로** 다시 골라내
 * 왜 어긋났는지 유형별로 센다. 판정 규칙을 여기서 새로 만들지 않는다 —
 * `@sacloud/rating` 의 `evaluateEligibility` 를 그대로 부르고, 입력도 `rate.ts` 와 똑같이 만든다.
 * (다르게 만들면 여기서 센 숫자가 replay 와 갈라져 조사 자체가 무의미해진다.)
 *
 * ── 어디서 어긋나나 (코드 경로)
 *
 *   `rate.ts` 는 `rateMatch` 에 저장된 진영 클랜을 `sideEvidence` 로 넘긴다.
 *   그런데 `evaluateEligibility` 는 **참가자 원소속(`rosterLeagueClanId`) 다수결이
 *   양쪽에서 서로 다른 클랜을 뽑아내면 그쪽을 우선한다** (`nexonDecided` · D-133).
 *   그렇게 뽑힌 두 클랜이 `Match.redLeagueClanId` / `blueLeagueClanId` 와 다르면
 *   `rate.ts` 가 `rated.clans` 에서 red/blue 를 못 찾아 `side_clan_mismatch` 로 뺀다.
 *
 * ── 유형
 *
 *   dup_league_clan       판정 클랜과 기록 클랜이 **같은 Clan** 인데 LeagueClan 행이 다르다
 *   opponent_clan         판정 클랜이 **상대 진영의 기록 클랜**이다 (같은 클랜이 양 팀에 다수)
 *   mercenary_plurality   기록 클랜 소속이 라인업에 있는데 **다른 클랜이 더 많다** (용병 다수)
 *   home_absent           기록 클랜 소속이 라인업에 **0명**이다
 *
 * ```bash
 * pnpm --filter @sacloud/worker exec tsx src/dev/sideClanMismatchAudit.ts --leagues supply,sanply
 * pnpm --filter @sacloud/worker exec tsx src/dev/sideClanMismatchAudit.ts --leagues supply --samples 8
 * ```
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { prisma } from '@sacloud/db'
import { evaluateEligibility, type ConfirmedParticipant } from '@sacloud/rating'
import { REPO_ROOT } from '../lib/env.js'
import {
  SEASON0_ORIGINS,
  season0MatchWhere,
  season0WindowLabel,
} from '../lib/season0Window.js'
import { storedSideEvidence } from '../lib/sideEvidencePolicy.js'

type MismatchType =
  | 'dup_league_clan'
  | 'opponent_clan'
  | 'mercenary_plurality'
  | 'home_absent'

interface SideDetail {
  /** 저장된(기록된) 진영 클랜 */
  storedLeagueClanId: string
  /** 다수결로 판정된 클랜 */
  decidedLeagueClanId: string
  ok: boolean
  /** 라인업 5명의 원소속 분포 */
  rosterCounts: { leagueClanId: string | null; n: number }[]
  homeMembers: number
  nullRoster: number
  /** 원소속이 비었는데 **경기 당시 클랜명은 있는** 인원 = 이 리그에 등록되지 않은 클랜 */
  outOfLeagueClan: number
  /** 경기 당시 클랜명조차 없는 인원 = 진짜 무소속 */
  trulyClanless: number
  /** 판정 클랜을 뒷받침한 인원 수 (1이면 **한 명이 팀 이름을 정한 것**이다) */
  pluralityCount: number
}

interface MismatchRow {
  matchId: string
  sourceMatchId: string | null
  startAt: string
  origin: string
  type: MismatchType
  bothSides: boolean
  winner: SideDetail
  loser: SideDetail
}

interface StatRow {
  rosterLeagueClanId: string | null
  matchTimeClanName: string | null
}

function countRoster(rows: StatRow[]): {
  rosterCounts: { leagueClanId: string | null; n: number }[]
  nullRoster: number
  outOfLeagueClan: number
  trulyClanless: number
} {
  const counts = new Map<string, number>()
  let nullRoster = 0
  let outOfLeagueClan = 0
  let trulyClanless = 0
  for (const row of rows) {
    if (!row.rosterLeagueClanId) {
      nullRoster += 1
      /* 클랜명은 있는데 이 리그 `LeagueClan` 으로 이어지지 않은 것 —
         "무소속" 이 아니라 **이 리그에 등록되지 않은 클랜**이다 */
      if (row.matchTimeClanName) outOfLeagueClan += 1
      else trulyClanless += 1
      continue
    }
    counts.set(row.rosterLeagueClanId, (counts.get(row.rosterLeagueClanId) ?? 0) + 1)
  }
  return {
    rosterCounts: [...counts.entries()]
      .map(([leagueClanId, n]) => ({ leagueClanId: leagueClanId as string | null, n }))
      .sort((a, b) => b.n - a.n),
    nullRoster,
    outOfLeagueClan,
    trulyClanless,
  }
}

/** 다수결을 **n명 이상일 때만** 인정한다 — 규칙 변형 A 의 영향 추정용 */
function pluralityAtLeast(values: readonly (string | null)[], min: number): string | null {
  const counts = new Map<string, number>()
  for (const value of values) {
    if (!value) continue
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  if (counts.size === 0) return null
  const sorted = [...counts.entries()].sort((left, right) => right[1] - left[1])
  if (sorted.length > 1 && sorted[0]![1] === sorted[1]![1]) return null
  return sorted[0]![1] >= min ? sorted[0]![0] : null
}

export async function auditLeague(
  leagueSlug: string,
  samples: number,
): Promise<{
  league: string
  considered: number
  ratingEligible: number
  mismatch: number
  byType: Record<MismatchType, number>
  bothSides: number
  otherSkips: Record<string, number>
  /** 정상 5v5 경기 전체의 참가행 원소속 실태 */
  rosterHealth: {
    participants: number
    withRoster: number
    outOfLeagueClan: number
    trulyClanless: number
  }
  /** 어긋난 쪽에서 판정 클랜을 뒷받침한 인원 수 분포 (1~5) */
  pluralityStrength: Record<number, number>
  /** 규칙 변형별 남는 어긋남 (영향 추정) */
  variants: {
    /** 지금 그대로 */
    current: number
    /** A: 다수결을 **3명 이상**일 때만 인정하고, 아니면 저장된 진영을 쓴다 */
    minPlurality3: number
    /** A': 2명 이상 */
    minPlurality2: number
    /** B: 판정 클랜이 기록된 두 클랜 밖이면 저장된 진영을 쓴다 */
    restrictToStoredPair: number
  }
  /** 어긋난 경기가 가장 많은 (기록) 클랜 */
  topClans: { leagueClanId: string; name: string; matches: number; inWindowMatches: number }[]
  /** 표본에 나오는 LeagueClan id → 클랜명 */
  clanNames: Record<string, string>
  sampleRows: MismatchRow[]
} | null> {
  const league = await prisma.league.findUnique({
    where: { slug: leagueSlug },
    select: { id: true },
  })
  if (!league) return null

  const matches = await prisma.match.findMany({
    where: { leagueId: league.id, ...season0MatchWhere() },
    orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      startAt: true,
      origin: true,
      sourceMatchId: true,
      redLeagueClanId: true,
      blueLeagueClanId: true,
      winnerSide: true,
      stats: {
        select: {
          playerId: true,
          side: true,
          kill: true,
          death: true,
          assist: true,
          rosterLeagueClanId: true,
          matchTimeClanName: true,
        },
      },
    },
  })

  /* `rate.ts` 와 같은 중복 제거 — `origins` 앞쪽이 이긴다 (D-175) */
  const originRank = new Map(SEASON0_ORIGINS.map((origin, index) => [origin as string, index]))
  const bestOf = new Map<string, (typeof matches)[number]>()
  const noKey: typeof matches = []
  for (const match of matches) {
    if (!match.sourceMatchId) {
      noKey.push(match)
      continue
    }
    const previous = bestOf.get(match.sourceMatchId)
    if (!previous) {
      bestOf.set(match.sourceMatchId, match)
      continue
    }
    const rankOf = (m: (typeof matches)[number]): number =>
      originRank.get(m.origin) ?? Number.MAX_SAFE_INTEGER
    if (rankOf(match) < rankOf(previous)) bestOf.set(match.sourceMatchId, match)
  }
  const deduped = [...bestOf.values(), ...noKey]

  /* LeagueClan → Clan 매핑. 같은 Clan 에 LeagueClan 행이 둘인지 확인하기 위한 것이다 */
  const leagueClans = await prisma.leagueClan.findMany({
    where: { leagueId: league.id },
    select: { id: true, clanId: true, clan: { select: { name: true } } },
  })
  const clanIdOf = new Map(leagueClans.map((lc) => [lc.id, lc.clanId]))
  const nameOf = new Map(leagueClans.map((lc) => [lc.id, lc.clan?.name ?? '(이름 없음)']))

  const byType: Record<MismatchType, number> = {
    dup_league_clan: 0,
    opponent_clan: 0,
    mercenary_plurality: 0,
    home_absent: 0,
  }
  const otherSkips: Record<string, number> = {}
  const perClan = new Map<string, number>()
  const inWindowPerClan = new Map<string, number>()
  const rows: MismatchRow[] = []
  let ratingEligible = 0
  let bothSides = 0
  let mismatch = 0
  const rosterHealth = { participants: 0, withRoster: 0, outOfLeagueClan: 0, trulyClanless: 0 }
  const pluralityStrength: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  const variants = { current: 0, minPlurality3: 0, minPlurality2: 0, restrictToStoredPair: 0 }

  for (const match of deduped) {
    for (const clanId of [match.redLeagueClanId, match.blueLeagueClanId]) {
      inWindowPerClan.set(clanId, (inWindowPerClan.get(clanId) ?? 0) + 1)
    }

    const participants: ConfirmedParticipant[] = match.stats.map((stat) => ({
      playerId: stat.playerId,
      rosterLeagueClanId: stat.rosterLeagueClanId,
      outcome: match.winnerSide === stat.side ? ('win' as const) : ('lose' as const),
      kill: stat.kill,
      death: stat.death,
      assist: stat.assist,
      sources: ['player_match_list' as const],
    }))
    const storedWinner =
      match.winnerSide === 'red' ? match.redLeagueClanId : match.blueLeagueClanId
    const storedLoser =
      match.winnerSide === 'red' ? match.blueLeagueClanId : match.redLeagueClanId

    /* 판정 규칙을 여기서 복제하지 않는다 — `rate.ts` 와 **같은 정책 함수**를 부른다.
       그래야 이 도구가 세는 어긋남이 replay 의 `side_clan_mismatch` 와 계속 일치한다 (D-180) */
    const eligibility = evaluateEligibility({
      participants,
      sideEvidence: storedSideEvidence(match),
    })
    if (!eligibility.ratingEligible) {
      const code = eligibility.recordable
        ? `incomplete_squad_${eligibility.completeness}`
        : eligibility.status
      otherSkips[code] = (otherSkips[code] ?? 0) + 1
      continue
    }
    ratingEligible += 1

    const winnerRows = match.stats.filter((s) => match.winnerSide === s.side)
    const loserRows = match.stats.filter((s) => match.winnerSide !== s.side)

    /* 정상 5v5 참가행의 원소속 실태 — 어긋남의 뿌리가 여기에 있다 */
    for (const side of [winnerRows, loserRows]) {
      const c = countRoster(side)
      rosterHealth.participants += side.length
      rosterHealth.withRoster += side.length - c.nullRoster
      rosterHealth.outOfLeagueClan += c.outOfLeagueClan
      rosterHealth.trulyClanless += c.trulyClanless
    }

    /* ---- 규칙 변형별 결과 (읽기만 · 실제 계산은 바꾸지 않는다) ---- */
    const rosterOf = (side: typeof winnerRows): (string | null)[] =>
      side.map((s) => s.rosterLeagueClanId)
    const storedPair = new Set([match.redLeagueClanId, match.blueLeagueClanId])
    const covers = (a: string, b: string): boolean =>
      storedPair.has(a) && storedPair.has(b) && a !== b
    const variantResult = (min: number): boolean => {
      const w = pluralityAtLeast(rosterOf(winnerRows), min)
      const l = pluralityAtLeast(rosterOf(loserRows), min)
      const decidedByRoster = w !== null && l !== null && w !== l
      const fw = decidedByRoster ? w : storedWinner
      const fl = decidedByRoster ? l : storedLoser
      return !covers(fw, fl)
    }
    if (variantResult(2)) variants.minPlurality2 += 1
    if (variantResult(3)) variants.minPlurality3 += 1

    const decidedWinner = eligibility.winnerSide!.leagueClanId
    const decidedLoser = eligibility.loserSide!.leagueClanId
    /* B 는 판정 클랜이 기록된 두 클랜을 덮지 못하면 저장된 진영으로 되돌린다 —
       되돌린 값은 정의상 red/blue 다. 그래서 남는 어긋남은 항상 0 이다 */
    if (!covers(decidedWinner, decidedLoser)) variants.restrictToStoredPair += 0
    if (covers(decidedWinner, decidedLoser)) continue

    mismatch += 1
    variants.current += 1

    const detail = (stored: string, dec: string, side: StatRow[]): SideDetail => {
      const { rosterCounts, nullRoster, outOfLeagueClan, trulyClanless } = countRoster(side)
      return {
        storedLeagueClanId: stored,
        decidedLeagueClanId: dec,
        ok: stored === dec,
        rosterCounts,
        homeMembers: rosterCounts.find((r) => r.leagueClanId === stored)?.n ?? 0,
        nullRoster,
        outOfLeagueClan,
        trulyClanless,
        pluralityCount: rosterCounts.find((r) => r.leagueClanId === dec)?.n ?? 0,
      }
    }
    const winner = detail(storedWinner, decidedWinner, winnerRows)
    const loser = detail(storedLoser, decidedLoser, loserRows)
    const bad = [winner, loser].filter((s) => !s.ok)
    if (bad.length === 2) bothSides += 1
    for (const s of bad) {
      if (s.pluralityCount >= 1 && s.pluralityCount <= 5) {
        pluralityStrength[s.pluralityCount] = (pluralityStrength[s.pluralityCount] ?? 0) + 1
      }
    }

    /* 유형 판정 — 어긋난 쪽(둘이면 승자 쪽)을 대표로 본다 */
    const target = bad[0]!
    let type: MismatchType
    if (
      clanIdOf.get(target.decidedLeagueClanId) !== undefined &&
      clanIdOf.get(target.decidedLeagueClanId) === clanIdOf.get(target.storedLeagueClanId)
    ) {
      type = 'dup_league_clan'
    } else if (
      target.decidedLeagueClanId === match.redLeagueClanId ||
      target.decidedLeagueClanId === match.blueLeagueClanId
    ) {
      type = 'opponent_clan'
    } else if (target.homeMembers > 0) {
      type = 'mercenary_plurality'
    } else {
      type = 'home_absent'
    }
    byType[type] += 1

    for (const s of bad) perClan.set(s.storedLeagueClanId, (perClan.get(s.storedLeagueClanId) ?? 0) + 1)

    if (rows.length < samples * 4) {
      rows.push({
        matchId: match.id,
        sourceMatchId: match.sourceMatchId,
        startAt: match.startAt.toISOString(),
        origin: match.origin,
        type,
        bothSides: bad.length === 2,
        winner,
        loser,
      })
    }
  }

  const topClans = [...perClan.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([leagueClanId, n]) => ({
      leagueClanId,
      name: nameOf.get(leagueClanId) ?? '(리그 밖)',
      matches: n,
      inWindowMatches: inWindowPerClan.get(leagueClanId) ?? 0,
    }))

  return {
    league: leagueSlug,
    considered: deduped.length,
    ratingEligible,
    mismatch,
    byType,
    bothSides,
    otherSkips,
    rosterHealth,
    pluralityStrength,
    variants,
    topClans,
    clanNames: Object.fromEntries(nameOf),
    sampleRows: rows,
  }
}

async function main(): Promise<void> {
  const argOf = (name: string): string | null => {
    const index = process.argv.indexOf(`--${name}`)
    if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1]!
    return process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? null
  }
  const leagues = (argOf('leagues') ?? 'supply,sanply').split(',').map((s) => s.trim()).filter(Boolean)
  const samples = Number(argOf('samples') ?? 6)

  console.log(`시즌0 창 — ${season0WindowLabel()}`)
  const out: unknown[] = []
  for (const slug of leagues) {
    const result = await auditLeague(slug, samples)
    if (!result) {
      console.log(`리그를 찾을 수 없다: ${slug}`)
      continue
    }
    out.push(result)
    console.log(`\n================ ${slug} ================`)
    console.log(
      `창 안(중복 제거) ${result.considered} · 정상 5v5 ${result.ratingEligible} · ` +
        `어긋남 ${result.mismatch} (${((result.mismatch / result.ratingEligible) * 100).toFixed(1)}%) · ` +
        `양 팀 다 어긋남 ${result.bothSides}`,
    )
    console.table([result.byType])
    console.log('그 밖의 제외 사유', result.otherSkips)

    const rh = result.rosterHealth
    console.log('\n## 정상 5v5 참가행의 원소속 실태 (어긋남의 뿌리)')
    console.table([
      {
        참가행: rh.participants,
        '원소속 있음': `${rh.withRoster} (${((rh.withRoster / rh.participants) * 100).toFixed(1)}%)`,
        '리그 밖 클랜': `${rh.outOfLeagueClan} (${((rh.outOfLeagueClan / rh.participants) * 100).toFixed(1)}%)`,
        '클랜명조차 없음': `${rh.trulyClanless} (${((rh.trulyClanless / rh.participants) * 100).toFixed(1)}%)`,
      },
    ])

    console.log('\n## 어긋난 쪽에서 판정 클랜을 뒷받침한 인원 수')
    console.table([result.pluralityStrength])

    console.log('\n## 규칙 변형별 남는 어긋남 (영향 추정)')
    console.table([
      {
        '지금 그대로': result.variants.current,
        'A 2명 이상일 때만 다수결': result.variants.minPlurality2,
        'A 3명 이상일 때만 다수결': result.variants.minPlurality3,
        'B 기록된 두 클랜 밖이면 기록 우선': result.variants.restrictToStoredPair,
      },
    ])
    console.log('\n## 어긋난 경기가 많은 (기록) 클랜')
    console.table(
      result.topClans.map((c) => ({
        클랜: c.name,
        '어긋난 경기': c.matches,
        '창 안 총 경기': c.inWindowMatches,
        비율: `${((c.matches / Math.max(1, c.inWindowMatches)) * 100).toFixed(1)}%`,
      })),
    )

    console.log('\n## 표본')
    for (const row of result.sampleRows.slice(0, samples)) {
      const show = (label: string, s: SideDetail): string =>
        `    ${label} 기록=${nameOf(result, s.storedLeagueClanId)} 판정=${nameOf(result, s.decidedLeagueClanId)} ` +
        `${s.ok ? '(일치)' : '(어긋남)'} 원소속분포=[${s.rosterCounts
          .map((r) => `${nameOf(result, r.leagueClanId)}×${r.n}`)
          .join(', ')}]` +
        `${s.outOfLeagueClan ? ` 리그밖클랜×${s.outOfLeagueClan}` : ''}` +
        `${s.trulyClanless ? ` 클랜없음×${s.trulyClanless}` : ''}` +
        `${s.ok ? '' : ` ← 판정 근거 ${s.pluralityCount}명`}`
      console.log(
        `\n  · ${row.matchId} (${row.origin} · source=${row.sourceMatchId ?? '-'}) ${row.startAt} — ${row.type}`,
      )
      console.log(show('승', row.winner))
      console.log(show('패', row.loser))
    }
  }

  const outDir = path.join(REPO_ROOT, 'apps', 'worker', 'reports', 'season0')
  mkdirSync(outDir, { recursive: true })
  const file = path.join(outDir, 'side-clan-mismatch.json')
  writeFileSync(file, JSON.stringify(out, null, 2), 'utf8')
  console.log(`\n결과 파일: ${file}`)
  await prisma.$disconnect()
}

/** 표본 출력용 이름 찾기 — 리그 밖 클랜이면 id 를 그대로 보여 준다 */
function nameOf(result: { clanNames: Record<string, string> }, id: string | null): string {
  if (!id) return '무소속'
  return result.clanNames[id] ?? `(리그 밖) ${id}`
}

const invokedDirectly = process.argv[1]?.replace(/\\/g, '/').endsWith('sideClanMismatchAudit.ts')
if (invokedDirectly) {
  main().catch(async (e: unknown) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
}
