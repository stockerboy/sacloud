/**
 * 매치 전파 (Phase 8.2 · D-055).
 *
 * 한 선수의 목록에서 **새 클랜전**이 나오면, 같은 경기를 봤을 사람들의 조회를 앞당긴다.
 *
 * 왜 필요한가
 *   경기의 완전성은 참가자 전원의 목록 관측에 달려 있다(D-048). 각자의 티어대로만 돌면
 *   한 경기가 다 모이기까지 며칠이 걸리고, 그동안 그 경기는 `missing_observation`으로 남는다.
 *
 * 무엇을 하지 않는가
 *   - **호출을 새로 만들지 않는다.** 어차피 조회할 사람의 `nextPollAt`을 당길 뿐이다
 *   - 상대 클랜을 **추측하지 않는다.** 이미 증거(관측·상세)로 확인된 클랜만 전파 대상이다
 *   - 닉네임으로 사람을 찾지 않는다. 로스터에 등록된 playerId만 쓴다 (D-036)
 */
import { prisma } from '@sacloud/db'
import { propagationTargets, type PollingConfig } from '../lib/pollingPolicy.js'

export interface PropagationPeers {
  /** 발견자와 같은 클랜에 등록된 동료 */
  rosterPeers: string[]
  /** 증거로 확인된 상대 클랜의 등록 선수 */
  opponentPeers: string[]
}

/** 그 시각에 유효한 소속의 leagueClanId 목록 */
async function clanIdsAt(playerIds: readonly string[], at: Date): Promise<Map<string, string[]>> {
  if (playerIds.length === 0) return new Map()
  const rows = await prisma.leagueRosterMembership.findMany({
    where: {
      playerId: { in: [...playerIds] },
      joinedAt: { lte: at },
      OR: [{ leftAt: null }, { leftAt: { gt: at } }],
    },
    select: { playerId: true, leagueClanId: true },
  })

  const result = new Map<string, string[]>()
  for (const row of rows) {
    const bucket = result.get(row.playerId)
    if (bucket) bucket.push(row.leagueClanId)
    else result.set(row.playerId, [row.leagueClanId])
  }
  return result
}

/** 로스터에 등록된 선수 → 폴링 가능한 ouid (신원이 확정된 사람만) */
async function ouidsForClans(leagueClanIds: readonly string[], at: Date): Promise<string[]> {
  if (leagueClanIds.length === 0) return []
  const memberships = await prisma.leagueRosterMembership.findMany({
    where: {
      leagueClanId: { in: [...leagueClanIds] },
      joinedAt: { lte: at },
      OR: [{ leftAt: null }, { leftAt: { gt: at } }],
    },
    select: { playerId: true },
    distinct: ['playerId'],
  })
  if (memberships.length === 0) return []

  const identities = await prisma.nexonIdentity.findMany({
    where: { playerId: { in: memberships.map((row) => row.playerId) }, status: 'active' },
    select: { ouid: true },
  })
  return identities.map((row) => row.ouid)
}

/**
 * 이 경기를 함께 봤을 사람들을 찾는다.
 *
 * 상대 클랜은 **이미 관측·상세로 확인된 경우에만** 넘긴다.
 * 확인되지 않았다면 빈 배열이다. 추측해서 남의 클랜을 조회하지 않는다.
 */
export async function collectPropagationPeers(input: {
  nexonMatchId: string
  discoveredByOuid: string
  at: Date
}): Promise<PropagationPeers> {
  const empty: PropagationPeers = { rosterPeers: [], opponentPeers: [] }

  const discoverer = await prisma.nexonIdentity.findUnique({
    where: { ouid: input.discoveredByOuid },
    select: { playerId: true, status: true },
  })
  // 발견자가 누구인지 확정되지 않았으면 소속을 알 수 없다 → 전파하지 않는다
  if (!discoverer?.playerId || discoverer.status !== 'active') return empty

  const ownClans = (await clanIdsAt([discoverer.playerId], input.at)).get(discoverer.playerId) ?? []
  if (ownClans.length === 0) return empty

  const rosterPeers = (await ouidsForClans(ownClans, input.at)).filter(
    (ouid) => ouid !== input.discoveredByOuid,
  )

  /* --- 상대 클랜: 이미 증거가 있는 경우에만 --- */
  const observations = await prisma.nexonMatchObservation.findMany({
    where: { nexonMatchId: input.nexonMatchId },
    select: { ouid: true },
  })
  const observedIdentities = await prisma.nexonIdentity.findMany({
    where: { ouid: { in: observations.map((row) => row.ouid) }, status: 'active' },
    select: { playerId: true },
  })
  const detailParticipants = await prisma.nexonMatchParticipant.findMany({
    where: { nexonMatchId: input.nexonMatchId, resolvedPlayerId: { not: null } },
    select: { resolvedPlayerId: true },
  })

  const evidencedPlayerIds = [
    ...new Set(
      [
        ...observedIdentities.map((row) => row.playerId),
        ...detailParticipants.map((row) => row.resolvedPlayerId),
      ].filter((value): value is string => value !== null && value !== discoverer.playerId),
    ),
  ]

  const ownClanSet = new Set(ownClans)
  const evidencedClans = new Set<string>()
  for (const clans of (await clanIdsAt(evidencedPlayerIds, input.at)).values()) {
    for (const clanId of clans) if (!ownClanSet.has(clanId)) evidencedClans.add(clanId)
  }

  const opponentPeers = (await ouidsForClans([...evidencedClans], input.at)).filter(
    (ouid) => ouid !== input.discoveredByOuid && !rosterPeers.includes(ouid),
  )

  return { rosterPeers, opponentPeers }
}

export interface PropagationResult {
  candidates: number
  pulledForward: number
}

/**
 * 앞당기기 — `nextPollAt`만 당긴다.
 *
 * 티어·주기·수동 갱신 표시는 건드리지 않는다. 이미 예정 시각이 지난 대상은 그대로 둔다
 * (당길 것이 없다). 앞당긴 사실은 `propagatedAt`/`propagationReason`에 남는다.
 */
export async function applyPropagation(input: {
  peers: PropagationPeers
  discoveredByOuid: string
  reason: string
  now: Date
  config?: PollingConfig
}): Promise<PropagationResult> {
  const targets = propagationTargets({
    discoveredBy: input.discoveredByOuid,
    rosterPeers: input.peers.rosterPeers,
    opponentPeers: input.peers.opponentPeers,
    config: input.config,
  })
  if (targets.length === 0) return { candidates: 0, pulledForward: 0 }

  const updated = await prisma.nexonPollState.updateMany({
    where: { ouid: { in: targets }, nextPollAt: { gt: input.now } },
    data: {
      nextPollAt: input.now,
      propagatedAt: input.now,
      propagationReason: input.reason,
    },
  })

  return { candidates: targets.length, pulledForward: updated.count }
}
