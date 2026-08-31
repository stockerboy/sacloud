/**
 * **열산에 남은 IPL끼리의 경기 — 한 건씩 정체를 밝힌다** (D-210 후속).
 *
 * D-210 으로 두 겹을 쳤는데(유입 차단 + 사후 청소) 운영에 계속 남는다.
 * 추측으로 원인을 적지 않기 위해, 남은 경기를 **한 줄씩** 찍는다.
 *
 * ```
 *   경기 id · sourceMatchId · origin · ingestedAt(가드 배포 전/후) ·
 *   양 클랜 slug/sourceClanId · IPL 등록행(joinedAt·expelledAt) · 열산 등록행
 * ```
 *
 * **읽기만 한다.** `select` 는 운영에 확실히 있는 열만 고른다 (D-210 의 이유와 같다).
 *
 * 반대 방향(IPL 리그에 열산 경기가 들어갔는가)도 같은 실행에서 센다.
 */
import { prisma } from '@sacloud/db'
import { IPL_ROSTER } from './iplRoster'

/** 눈으로 같아 보이는 글자를 접어 비교한다 (`iplRegister.ts` 와 같은 규칙) */
function fold(value: string): string {
  return value
    .replace(/Р/g, 'P')
    .replace(/Β/g, 'B')
    .replace(/[^0-9A-Za-z가-힣]/g, '')
    .toLowerCase()
}

/** 가드가 운영에 나간 시각 — 이 앞뒤로 갈라 본다. 커밋 89ca17e (2026-08-31) */
const GUARD_DEPLOYED_AT = new Date(process.env.GUARD_AT ?? '2026-08-31T00:00:00.000Z')

interface ClanRow {
  id: string
  slug: string
  name: string
  sourceClanId: string | null
}

async function main(): Promise<void> {
  const [san, ipl] = await Promise.all([
    prisma.league.findUnique({ where: { slug: 'sanply' }, select: { id: true } }),
    prisma.league.findUnique({ where: { slug: 'nolink' }, select: { id: true } }),
  ])
  if (!san || !ipl) {
    console.error('리그를 찾지 못했다')
    return
  }

  /* ── IPL 등록행 (추방 포함해서 전부 본다 — 가드는 추방된 것을 빼고 본다) ── */
  const iplRows = await prisma.leagueClan.findMany({
    where: { leagueId: ipl.id },
    select: {
      id: true,
      clanId: true,
      joinedAt: true,
      expelledAt: true,
      clan: { select: { id: true, slug: true, name: true, sourceClanId: true } },
    },
  })
  const iplByClan = new Map(iplRows.map((r) => [r.clanId, r]))
  const iplActive = iplRows.filter((r) => r.expelledAt === null)
  console.info(
    `IPL(nolink) 등록행 ${iplRows.length} · 살아있음 ${iplActive.length} · 추방 ${iplRows.length - iplActive.length}`,
  )
  const noSource = iplRows.filter((r) => !r.clan.sourceClanId)
  console.info(`  그중 Clan.sourceClanId 가 비어 있는 곳 ${noSource.length}곳`)
  for (const r of noSource) console.info(`    - ${r.clan.name} (${r.clan.slug})`)

  /* ── 열산 등록행 중 IPL 클랜인 것 ─────────────────────────────────── */
  const sanRows = await prisma.leagueClan.findMany({
    where: { leagueId: san.id, clanId: { in: iplRows.map((r) => r.clanId) } },
    select: {
      id: true,
      clanId: true,
      joinedAt: true,
      expelledAt: true,
      clan: { select: { id: true, slug: true, name: true, sourceClanId: true } },
    },
  })
  console.info(`\n열산(sanply)에도 등록행이 있는 IPL 클랜 ${sanRows.length}곳`)
  for (const r of sanRows) {
    console.info(
      `  ${r.clan.name.padEnd(16)} slug=${r.clan.slug.padEnd(16)} ` +
        `srcClanId=${r.clan.sourceClanId ?? '(없음)'} ` +
        `열산가입=${r.joinedAt.toISOString().slice(0, 19)} ` +
        `열산추방=${r.expelledAt ? r.expelledAt.toISOString().slice(0, 19) : '(없음)'} ` +
        `IPL추방=${iplByClan.get(r.clanId)?.expelledAt ? 'O' : 'X'}`,
    )
  }

  const sanLcIds = sanRows.map((r) => r.id)
  const lcById = new Map(sanRows.map((r) => [r.id, r]))
  if (sanLcIds.length === 0) return

  /* ── 남은 경기 한 건씩 ────────────────────────────────────────────── */
  const matches = await prisma.match.findMany({
    where: {
      leagueId: san.id,
      redLeagueClanId: { in: sanLcIds },
      blueLeagueClanId: { in: sanLcIds },
    },
    select: {
      id: true,
      sourceMatchId: true,
      origin: true,
      startAt: true,
      ingestedAt: true,
      redLeagueClanId: true,
      blueLeagueClanId: true,
    },
    orderBy: { ingestedAt: 'asc' },
  })

  console.info(`\n남은 IPL끼리의 경기 ${matches.length}건`)
  console.info(
    `${'경기시각'.padEnd(19)} ${'적재시각'.padEnd(19)} 가드 ${'origin'.padEnd(11)} ` +
      `${'레드'.padEnd(16)} ${'블루'.padEnd(16)} sourceMatchId`,
  )
  let beforeGuard = 0
  let afterGuard = 0
  const byPair = new Map<string, number>()
  for (const m of matches) {
    const red = lcById.get(m.redLeagueClanId)
    const blue = lcById.get(m.blueLeagueClanId)
    const after = m.ingestedAt >= GUARD_DEPLOYED_AT
    if (after) afterGuard += 1
    else beforeGuard += 1
    const pair = [red?.clan.name ?? '?', blue?.clan.name ?? '?'].sort().join(' vs ')
    byPair.set(pair, (byPair.get(pair) ?? 0) + 1)
    console.info(
      `${m.startAt.toISOString().slice(0, 19)} ${m.ingestedAt.toISOString().slice(0, 19)} ` +
        `${after ? '후 ' : '전 '} ${m.origin.padEnd(11)} ` +
        `${(red?.clan.name ?? '?').padEnd(16)} ${(blue?.clan.name ?? '?').padEnd(16)} ${m.sourceMatchId ?? '(없음)'}`,
    )
  }
  console.info(`\n가드 배포(${GUARD_DEPLOYED_AT.toISOString().slice(0, 19)}) 전 적재 ${beforeGuard}건 · 후 적재 ${afterGuard}건`)
  console.info('\n대진별')
  for (const [pair, n] of [...byPair].sort((a, b) => b[1] - a[1])) {
    console.info(`  ${String(n).padStart(4)}  ${pair}`)
  }

  /* ── 가드를 지금 그대로 돌리면 이 경기들을 막았을까 ────────────────── */
  const guardSources = new Set<string>()
  const guardSlugs = new Set<string>()
  for (const r of iplActive) {
    if (r.clan.sourceClanId) guardSources.add(r.clan.sourceClanId)
    guardSlugs.add(r.clan.slug)
  }
  const isBlocked = (c: ClanRow | undefined): boolean =>
    Boolean(c && ((c.sourceClanId && guardSources.has(c.sourceClanId)) || guardSlugs.has(c.slug)))
  let wouldBlock = 0
  const leaks = new Map<string, number>()
  for (const m of matches) {
    const red = lcById.get(m.redLeagueClanId)?.clan
    const blue = lcById.get(m.blueLeagueClanId)?.clan
    if (isBlocked(red) && isBlocked(blue)) {
      wouldBlock += 1
    } else {
      const why = [
        isBlocked(red) ? null : `레드 ${red?.name}`,
        isBlocked(blue) ? null : `블루 ${blue?.name}`,
      ]
        .filter(Boolean)
        .join(' · ')
      leaks.set(why, (leaks.get(why) ?? 0) + 1)
    }
  }
  console.info(`\n지금 가드로 다시 판정하면 — 막힘 ${wouldBlock}건 · 새는 것 ${matches.length - wouldBlock}건`)
  for (const [why, n] of [...leaks].sort((a, b) => b[1] - a[1])) {
    console.info(`  ${String(n).padStart(4)}  가드가 IPL 로 못 본 쪽: ${why}`)
  }

  /* ── 사각지대 — **명단(IPL_ROSTER)** 으로 다시 훑는다 ──────────────────
     가드도 대조도 "지금 nolink 에 등록행이 있는가" 로만 본다. 그런데 등록행 43곳 중
     35곳은 `iplRegister` 가 **새로 만든 껍데기**다(`sourceClanId` 가 비어 있다).
     3rd.supply 원본이 주는 그 클랜은 **다른 행**일 수 있고, 그러면 가드도 대조도
     둘 다 못 본다. 얼마나 되는지 숫자로 센다. */
  const rosterNames = new Set<string>()
  for (const e of IPL_ROSTER) {
    rosterNames.add(fold(e.name))
    rosterNames.add(fold(e.given))
  }
  const allClans = await prisma.clan.findMany({
    select: { id: true, slug: true, name: true, sourceClanId: true },
  })
  const rosterClans = allClans.filter((c) => rosterNames.has(fold(c.name)))
  const registeredIds = new Set(iplRows.map((r) => r.clanId))
  const extra = rosterClans.filter((c) => !registeredIds.has(c.id))
  console.info(
    `
[사각지대] 명단 이름과 같은 Clan 행 ${rosterClans.length}개 · ` +
      `그중 nolink 에 등록되지 않은 행 ${extra.length}개`,
  )
  for (const c of extra) {
    console.info(`    ${c.name.padEnd(16)} slug=${c.slug.padEnd(18)} srcClanId=${c.sourceClanId ?? '(없음)'}`)
  }

  const rosterSanRows = await prisma.leagueClan.findMany({
    where: { leagueId: san.id, clanId: { in: rosterClans.map((c) => c.id) } },
    select: { id: true, clanId: true },
  })
  const rosterClanById = new Map(rosterClans.map((c) => [c.id, c]))
  const rosterLcById = new Map(rosterSanRows.map((r) => [r.id, r]))
  const rosterLcIds = rosterSanRows.map((r) => r.id)
  const rosterMatches =
    rosterLcIds.length === 0
      ? []
      : await prisma.match.findMany({
          where: {
            leagueId: san.id,
            redLeagueClanId: { in: rosterLcIds },
            blueLeagueClanId: { in: rosterLcIds },
          },
          select: { id: true, redLeagueClanId: true, blueLeagueClanId: true, ingestedAt: true },
        })
  const known = new Set(matches.map((m) => m.id))
  const missed = rosterMatches.filter((m) => !known.has(m.id))
  console.info(
    `[사각지대] 명단 기준 열산 등록행 ${rosterLcIds.length}개 · 그 사이의 경기 ${rosterMatches.length}건 · ` +
      `**지금 대조가 못 세는 것 ${missed.length}건**`,
  )
  const missedPairs = new Map<string, number>()
  for (const m of missed) {
    const r = rosterClanById.get(rosterLcById.get(m.redLeagueClanId)?.clanId ?? '')
    const b = rosterClanById.get(rosterLcById.get(m.blueLeagueClanId)?.clanId ?? '')
    const key = `${r?.name}(${r?.slug}) vs ${b?.name}(${b?.slug})`
    missedPairs.set(key, (missedPairs.get(key) ?? 0) + 1)
  }
  for (const [k, n] of [...missedPairs].sort((a, b) => b[1] - a[1]).slice(0, 40)) {
    console.info(`  ${String(n).padStart(4)}  ${k}`)
  }

  /* ── 반대 방향 — IPL 리그에 열산 경기가 들어갔는가 ─────────────────── */
  const iplMatchTotal = await prisma.match.count({ where: { leagueId: ipl.id } })
  const sanAllRows = await prisma.leagueClan.findMany({
    where: { leagueId: san.id },
    select: { clanId: true },
  })
  const sanClanIds = new Set(sanAllRows.map((r) => r.clanId))
  const iplLcOfSanplyClan = iplRows.filter((r) => sanClanIds.has(r.clanId)).map((r) => r.id)
  const iplMatchesWithSanplyClan =
    iplLcOfSanplyClan.length === 0
      ? 0
      : await prisma.match.count({
          where: {
            leagueId: ipl.id,
            OR: [
              { redLeagueClanId: { in: iplLcOfSanplyClan } },
              { blueLeagueClanId: { in: iplLcOfSanplyClan } },
            ],
          },
        })
  console.info(
    `\n[역방향] IPL(nolink) 리그 경기 총 ${iplMatchTotal}건 · ` +
      `그중 열산 등록 클랜이 낀 경기 ${iplMatchesWithSanplyClan}건 (0 이어야 한다)`,
  )
}

main()
  .catch((e) => {
    console.error(String(e).slice(0, 600))
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
