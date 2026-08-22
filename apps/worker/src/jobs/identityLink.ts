/**
 * 신원 연결 — **근거가 있을 때만** (Phase 12 · D-036 유지).
 *
 * ── 왜 닉네임만으로는 안 되는가
 *   실제로 틀린 사례가 있었다. 상세에 있던 닉네임으로 `/id`를 불러 얻은 계정의 매치 목록에
 *   그 경기가 **없었다**(D-051). 닉네임은 바뀌고, 같은 닉을 쓰는 사람도 있다.
 *
 * ── 그래서 이 도구가 요구하는 근거
 *   1. 닉네임이 **정확히** 같다 (비슷한 것은 안 된다 — fuzzy 금지)
 *   2. 그 계정의 **실제 경기 이력에 찍힌 `guild_name`** 이, 운영자가 등록한 로스터의
 *      클랜과 같다
 *   3. 그 일치가 `minEvidence`건 이상이고, 다른 클랜으로 찍힌 비율이 기준 이하다
 *
 *   즉 "이름이 같다"가 아니라 **"이 계정이 실제로 그 클랜으로 뛰었다"** 를 본다.
 *   조건을 못 채우면 연결하지 않고 사유를 남긴다. 추측해서 잇지 않는다.
 *
 * ── 되돌릴 수 있다
 *   연결 근거를 `linkReason`에 문장으로 남긴다. 나중에 사람이 보고 끊을 수 있어야 한다.
 */
import { prisma } from '@sacloud/db'
import { log, warn } from '../lib/log.js'

export interface IdentityLinkCandidate {
  ouid: string
  userName: string
  /** 이 계정이 실제 경기에서 달고 나온 클랜 이름과 횟수 */
  guildCounts: [string, number][]
  /** 로스터가 말하는 클랜 */
  rosterClanName: string | null
  rosterPlayerId: string | null
  verdict: 'link' | 'already' | 'no_roster' | 'no_evidence' | 'conflict'
  reason: string
}

export interface IdentityLinkResult {
  considered: number
  linked: number
  skipped: number
  candidates: IdentityLinkCandidate[]
}

/**
 * 로스터에 등록된 선수 이름과 **정확히** 같은 닉네임의 신원을 찾아,
 * 경기 이력의 클랜이 로스터와 맞으면 연결한다.
 */
export async function linkIdentitiesByEvidence(input: {
  leagueSlug: string
  /** 같은 클랜으로 찍힌 최소 경기 수 */
  minEvidence?: number
  /** 다른 클랜으로 찍힌 비율이 이 값을 넘으면 연결하지 않는다 */
  maxConflictRatio?: number
  confirm?: boolean
}): Promise<IdentityLinkResult> {
  const minEvidence = input.minEvidence ?? 3
  const maxConflictRatio = input.maxConflictRatio ?? 0.2
  const result: IdentityLinkResult = { considered: 0, linked: 0, skipped: 0, candidates: [] }

  const league = await prisma.league.findUnique({
    where: { slug: input.leagueSlug },
    select: { id: true },
  })
  if (!league) {
    warn(`리그를 찾을 수 없다: ${input.leagueSlug}`)
    return result
  }

  /* 운영자가 등록한 로스터 = "누가 어느 클랜인가"에 대한 우리 쪽 진술 */
  const roster = await prisma.leagueRosterMembership.findMany({
    where: { leagueId: league.id, leftAt: null },
    select: {
      playerId: true,
      player: { select: { id: true, name: true } },
      leagueClan: { select: { clan: { select: { name: true } } } },
    },
  })
  const rosterByName = new Map(
    roster.map((row) => [row.player.name, { playerId: row.playerId, clanName: row.leagueClan.clan.name }]),
  )

  /* 아직 사람이 정해지지 않은 실제 신원만 본다 (E2E 자리표시자는 건드리지 않는다) */
  const identities = await prisma.nexonIdentity.findMany({
    where: { playerId: null, status: 'unresolved', NOT: { ouid: { startsWith: 'E2E-' } } },
    select: { ouid: true, userName: true },
  })

  for (const identity of identities) {
    result.considered += 1
    const userName = identity.userName
    if (!userName) {
      result.skipped += 1
      continue
    }

    const rosterEntry = rosterByName.get(userName) ?? null
    const counts = new Map<string, number>()
    const parts = await prisma.nexonMatchParticipant.findMany({
      where: { userName },
      select: { clanName: true },
    })
    for (const part of parts) {
      if (!part.clanName) continue
      counts.set(part.clanName, (counts.get(part.clanName) ?? 0) + 1)
    }
    const guildCounts = [...counts].sort((left, right) => right[1] - left[1])

    const base: IdentityLinkCandidate = {
      ouid: identity.ouid,
      userName,
      guildCounts,
      rosterClanName: rosterEntry?.clanName ?? null,
      rosterPlayerId: rosterEntry?.playerId ?? null,
      verdict: 'no_roster',
      reason: '',
    }

    if (!rosterEntry) {
      base.reason = '로스터에 같은 이름이 없다. 사람을 정하지 않는다'
      result.candidates.push(base)
      result.skipped += 1
      continue
    }

    const matching = counts.get(rosterEntry.clanName) ?? 0
    const total = [...counts.values()].reduce((sum, value) => sum + value, 0)
    const conflictRatio = total === 0 ? 1 : (total - matching) / total

    if (matching < minEvidence) {
      base.verdict = 'no_evidence'
      base.reason = `로스터 클랜(${rosterEntry.clanName})으로 찍힌 경기가 ${matching}건뿐이다 (최소 ${minEvidence})`
      result.candidates.push(base)
      result.skipped += 1
      continue
    }
    if (conflictRatio > maxConflictRatio) {
      base.verdict = 'conflict'
      base.reason = `다른 클랜으로 찍힌 비율이 ${Math.round(conflictRatio * 100)}%다. 사람이 판단해야 한다`
      result.candidates.push(base)
      result.skipped += 1
      continue
    }

    base.verdict = 'link'
    base.reason =
      `닉네임 정확 일치 + 실제 경기 ${matching}/${total}건이 로스터 클랜(${rosterEntry.clanName})으로 찍혔다`

    if (input.confirm) {
      await prisma.nexonIdentity.update({
        where: { ouid: identity.ouid },
        data: {
          playerId: rosterEntry.playerId,
          status: 'active',
          linkReason: `근거 기반 연결 — ${base.reason}`,
        },
      })
      await prisma.player.update({
        where: { id: rosterEntry.playerId },
        data: { nexonOuid: identity.ouid },
      })
      result.linked += 1
      log(`연결: ${userName} → ${rosterEntry.playerId} (${base.reason})`)
    }
    result.candidates.push(base)
  }

  return result
}

/**
 * 실제 관측된 맵을 리그 기록 대상에 넣는다.
 *
 * 리그가 인정하는 맵 목록이 비어 있으면 그 리그는 **아무 경기도 기록하지 못한다**.
 * 없는 맵을 만들어내는 것이 아니라, **실제 경기에서 관측된 맵**만 등록한다.
 */
export async function registerObservedMaps(input: {
  leagueSlug: string
  from: Date
  to: Date
  confirm?: boolean
}): Promise<{ observed: string[]; added: string[] }> {
  const league = await prisma.league.findUnique({
    where: { slug: input.leagueSlug },
    select: { id: true, maps: { select: { map: { select: { id: true, name: true } } } } },
  })
  if (!league) return { observed: [], added: [] }

  const rows = await prisma.nexonMatch.findMany({
    where: {
      dateMatch: { gte: input.from, lt: input.to },
      matchType: { in: ['클랜전', '퀵매치 클랜전', '클랜 랭크전'] },
      matchMap: { not: null },
    },
    select: { matchMap: true },
  })
  const observed = [...new Set(rows.map((row) => row.matchMap!))].sort()
  const existing = new Set(league.maps.map((entry) => entry.map.name))
  const added: string[] = []

  for (const name of observed) {
    if (existing.has(name)) continue
    if (!input.confirm) {
      added.push(name)
      continue
    }
    const map =
      (await prisma.gameMap.findUnique({ where: { name }, select: { id: true } })) ??
      (await prisma.gameMap.create({ data: { name }, select: { id: true } }))
    await prisma.leagueMap.create({ data: { leagueId: league.id, mapId: map.id } })
    added.push(name)
  }

  return { observed, added }
}
