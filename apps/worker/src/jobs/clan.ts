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
 *
 * ── ★2026-09-25 — `LeaguePlayer.clanId` 를 빠뜨리고 있었다★ (사장님이 grave·
 *   vaIentina 에서 「또 두갈래됐어」 라고 잡아 주신 실측이 이 함수까지 이어졌다)
 *
 *   원래 옮기던 것 — `Player.clanId` · 로스터 멤버십.
 *   ★개인랭킹 화면이 실제로 읽는 것은 `LeaguePlayer.clanId`★ 다(`league.ts`
 *   `RANK_SELECT` 참고). 그걸 안 옮기면 병합해도 화면은 그대로 갈라져 보이고,
 *   `from` 이름에 붙는 「(병합됨→…)」 표시만 선수 소속으로 새어 나간다.
 *
 *   ★리그별 승패도 두 줄에 나뉘어 있었다★ — 같은 리그에 `from`·`into` 가 각자
 *   `LeagueClan` 을 갖고 있으면(실측: grave 가 그랬다) 그 리그의 진짜 승패는
 *   ★둘을 더한 값★ 이다. 두 줄 다 있으면 승패만 `into` 로 더하고 로스터를 옮긴다.
 *   ★래더(rating·internalRating 등)는 더하지 않는다★ — Elo 류 점수는 두 값을
 *   더해서 뜻이 있는 값이 아니다. `into` 의 현재 값을 그대로 둔다(지어내지 않는다).
 *   `into` 쪽에 그 리그가 없으면(둘 중 한쪽만 그 리그에 있었으면) 그 줄 자체를
 *   `into` 로 옮긴다 — 기록이 통째로 안 사라진다.
 */
export async function mergeClans(
  ctx: JobContext,
  input: { fromSlug: string; intoSlug: string },
): Promise<{ movedPlayers: number; movedLeaguePlayers: number; movedMemberships: number; mergedLeagueClans: number; movedLeagueClans: number }> {
  const result = { movedPlayers: 0, movedLeaguePlayers: 0, movedMemberships: 0, mergedLeagueClans: 0, movedLeagueClans: 0 }
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

  /* ★개인랭킹이 실제로 보는 칸★ — 위 `Player.clanId` 와 별개로 반드시 같이 옮긴다 */
  const leaguePlayers = await prisma.leaguePlayer.updateMany({
    where: { clanId: from.id },
    data: { clanId: into.id },
  })
  result.movedLeaguePlayers = leaguePlayers.count

  const leagueClans = await prisma.leagueClan.findMany({
    where: { clanId: from.id },
    select: { id: true, leagueId: true, win: true, lose: true },
  })
  for (const leagueClan of leagueClans) {
    const target = await prisma.leagueClan.findUnique({
      where: { leagueId_clanId: { leagueId: leagueClan.leagueId, clanId: into.id } },
      select: { id: true },
    })
    if (!target) {
      /* into 쪽에 이 리그 줄이 아예 없다 — 승패·로스터 둘 다 통째로 옮긴다 */
      await prisma.leagueClan.update({ where: { id: leagueClan.id }, data: { clanId: into.id } })
      result.movedLeagueClans += 1
      continue
    }
    const moved = await prisma.leagueRosterMembership.updateMany({
      where: { leagueClanId: leagueClan.id },
      data: { leagueClanId: target.id },
    })
    result.movedMemberships += moved.count
    /* 같은 리그에 둘 다 있었다 — 진짜 승패는 둘을 더한 값이다. 래더는 into 것을 그대로 둔다 */
    if (leagueClan.win > 0 || leagueClan.lose > 0) {
      await prisma.leagueClan.update({
        where: { id: target.id },
        data: { win: { increment: leagueClan.win }, lose: { increment: leagueClan.lose } },
      })
      result.mergedLeagueClans += 1
    }
  }

  await prisma.clan.update({
    where: { id: from.id },
    data: { name: `${from.name} (병합됨 → ${into.slug})` },
  })

  log(
    `병합 완료 — 선수(Player) ${result.movedPlayers}명 · 개인랭킹(LeaguePlayer) ${result.movedLeaguePlayers}명 · ` +
      `로스터 ${result.movedMemberships}건이 ${into.slug}로 옮겨졌다. ` +
      `리그 승패 합친 곳 ${result.mergedLeagueClans}곳 · 리그 줄 통째로 옮긴 곳 ${result.movedLeagueClans}곳. ` +
      `${from.slug}는 표시만 바꾸고 남겨 둔다`,
  )
  return result
}
