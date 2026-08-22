/**
 * 클랜 운영 (Phase 9 — 정책 19).
 *
 * 운영자가 **DB를 직접 고치지 않고** 클랜을 다룰 수 있어야 한다.
 *
 * 절대 하지 않는 것
 *   이름이 비슷하다는 이유로 클랜을 **자동 병합하지 않는다** (정책 20).
 *   `Veritas` · `VERITAS` · `베리타스`는 운영자가 같다고 말하기 전까지 서로 다른 클랜이다.
 *   그래서 병합 명령은 **정확한 slug 두 개를 명시**해야만 동작한다.
 */
import { prisma } from '@sacloud/db'
import { log, warn } from '../lib/log.js'
import type { JobContext } from './context.js'

export interface ClanRow extends Record<string, unknown> {
  slug: string
  name: string
  리그: string
  부리그: number | string
  래더: number | string
  로스터: number
}

export async function clanList(leagueSlug?: string | null): Promise<ClanRow[]> {
  const clans = await prisma.clan.findMany({
    orderBy: { name: 'asc' },
    select: {
      slug: true,
      name: true,
      leagueClans: {
        where: leagueSlug ? { league: { slug: leagueSlug } } : undefined,
        select: {
          division: true,
          rating: true,
          league: { select: { slug: true } },
          _count: { select: { rosterMemberships: true } },
        },
      },
    },
  })

  const rows: ClanRow[] = []
  for (const clan of clans) {
    if (clan.leagueClans.length === 0) {
      if (leagueSlug) continue
      rows.push({ slug: clan.slug, name: clan.name, 리그: '-', 부리그: '-', 래더: '-', 로스터: 0 })
      continue
    }
    for (const entry of clan.leagueClans) {
      rows.push({
        slug: clan.slug,
        name: clan.name,
        리그: entry.league.slug,
        부리그: entry.division,
        래더: entry.rating,
        로스터: entry._count.rosterMemberships,
      })
    }
  }
  return rows
}

/** 클랜 등록. 같은 slug가 있으면 만들지 않는다 (조용히 덮어쓰지 않는다) */
export async function registerClan(
  ctx: JobContext,
  input: { slug: string; name: string },
): Promise<{ created: boolean }> {
  const existing = await prisma.clan.findUnique({ where: { slug: input.slug } })
  if (existing) {
    warn(`이미 있는 클랜이다: ${input.slug} (${existing.name})`)
    return { created: false }
  }
  if (ctx.dryRun) {
    log(`[dry-run] 클랜 등록: ${input.slug} / ${input.name}`)
    return { created: false }
  }
  await prisma.clan.create({ data: { slug: input.slug, name: input.name } })
  log(`클랜 등록: ${input.slug} / ${input.name}`)
  return { created: true }
}

/** 클랜명 변경. slug는 그대로 둔다 — 식별자를 바꾸면 기록 연결이 끊긴다 */
export async function renameClan(
  ctx: JobContext,
  input: { slug: string; name: string },
): Promise<boolean> {
  const clan = await prisma.clan.findUnique({ where: { slug: input.slug } })
  if (!clan) {
    warn(`클랜을 찾을 수 없다: ${input.slug}`)
    return false
  }
  if (ctx.dryRun) {
    log(`[dry-run] 이름 변경: ${clan.name} → ${input.name}`)
    return false
  }
  await prisma.clan.update({ where: { slug: input.slug }, data: { name: input.name } })
  log(`이름 변경: ${clan.name} → ${input.name}`)
  return true
}

/** 리그 참여 설정 (부리그 지정 포함). 이미 참여 중이면 부리그만 바꾼다 */
export async function joinLeague(
  ctx: JobContext,
  input: { leagueSlug: string; clanSlug: string; division: number },
): Promise<boolean> {
  const league = await prisma.league.findUnique({
    where: { slug: input.leagueSlug },
    select: { id: true, divisionCount: true },
  })
  const clan = await prisma.clan.findUnique({ where: { slug: input.clanSlug }, select: { id: true } })
  if (!league || !clan) {
    warn(`리그 또는 클랜을 찾을 수 없다 (${input.leagueSlug} / ${input.clanSlug})`)
    return false
  }
  if (input.division < 1 || input.division > Math.max(1, league.divisionCount)) {
    warn(`이 리그의 부리그 범위가 아니다: ${input.division} (1~${league.divisionCount})`)
    return false
  }
  if (ctx.dryRun) {
    log(`[dry-run] ${input.clanSlug} → ${input.leagueSlug} ${input.division}부`)
    return false
  }

  await prisma.leagueClan.upsert({
    where: { leagueId_clanId: { leagueId: league.id, clanId: clan.id } },
    create: { leagueId: league.id, clanId: clan.id, division: input.division },
    update: { division: input.division },
  })
  log(`${input.clanSlug} → ${input.leagueSlug} ${input.division}부`)
  return true
}

/**
 * 클랜 병합 — **운영자가 두 slug를 정확히 지정할 때만** 한다 (정책 20).
 *
 * 이름 유사도로 자동 판단하지 않는다. 남는 쪽(`into`)으로 소속·로스터를 옮기고
 * 사라지는 쪽(`from`)은 **삭제하지 않고** 이름에 표시만 남긴다 — 되돌릴 수 있어야 한다.
 */
export async function mergeClans(
  ctx: JobContext,
  input: { fromSlug: string; intoSlug: string },
): Promise<{ movedPlayers: number; movedMemberships: number }> {
  const result = { movedPlayers: 0, movedMemberships: 0 }
  const from = await prisma.clan.findUnique({ where: { slug: input.fromSlug } })
  const into = await prisma.clan.findUnique({ where: { slug: input.intoSlug } })
  if (!from || !into) {
    warn('두 클랜 모두 정확한 slug로 존재해야 한다')
    return result
  }
  if (from.id === into.id) {
    warn('같은 클랜이다')
    return result
  }

  if (ctx.dryRun) {
    log(`[dry-run] ${from.name}(${from.slug}) → ${into.name}(${into.slug}) 병합`)
    return result
  }

  const players = await prisma.player.updateMany({
    where: { clanId: from.id },
    data: { clanId: into.id },
  })
  result.movedPlayers = players.count

  const leagueClans = await prisma.leagueClan.findMany({
    where: { clanId: from.id },
    select: { id: true, leagueId: true },
  })
  for (const leagueClan of leagueClans) {
    const target = await prisma.leagueClan.findUnique({
      where: { leagueId_clanId: { leagueId: leagueClan.leagueId, clanId: into.id } },
      select: { id: true },
    })
    if (!target) continue
    const moved = await prisma.leagueRosterMembership.updateMany({
      where: { leagueClanId: leagueClan.id },
      data: { leagueClanId: target.id },
    })
    result.movedMemberships += moved.count
  }

  await prisma.clan.update({
    where: { id: from.id },
    data: { name: `${from.name} (병합됨 → ${into.slug})` },
  })

  log(
    `병합 완료 — 선수 ${result.movedPlayers}명 · 로스터 ${result.movedMemberships}건이 ` +
      `${into.slug}로 옮겨졌다. ${from.slug}는 표시만 바꾸고 남겨 둔다`,
  )
  return result
}
