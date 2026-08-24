/**
 * 경기 당시 소속 복원 — `MatchPlayerStat.matchTimeClan*` (D-131).
 *
 * ── 왜 스냅샷인가
 *   현재 소속을 join 해서 과거 화면을 그리면, 선수가 이적하는 순간 **과거 기록이 통째로
 *   바뀐다.** 8/20 경기에 UlsaN_CIaN 으로 찍혀 있던 사람이 오늘 Iatency- 로 옮기면
 *   8/20 기록실이 Iatency- 로 바뀌어 버린다. 역사는 역사대로 남아야 한다.
 *   그래서 값을 경기 참가 기록에 **박아 둔다.**
 *
 * ── 근거의 우선순위 (실측으로 정했다)
 *   1. **넥슨 `/match-detail` 의 `guild_name`** — 경기 기록 안에 들어 있는 값이다.
 *      실측: 제3보급창고 참가 4,889행 · 닉네임 1,341명 중 69명이 서로 다른 클랜으로
 *      나오고, 그중 65명은 **기간이 겹치지 않는다**(앞 기간 A클랜 · 뒤 기간 B클랜).
 *      이적의 모양이다. 즉 이 값은 **경기 당시** 소속이다.
 *   2. 로스터 이력 — 그 시각에 열려 있던 `LeagueRosterMembership`
 *
 * ── 3rd.supply 라인업의 클랜은 **쓰지 않는다**
 *   같은 스냅샷에서 선수 1,091명 중 **단 한 명도** 경기별로 다른 클랜으로 나오지 않았다
 *   (2025-09-30 ~ 2026-08-24, 11개월). 11개월 동안 아무도 이적하지 않았을 리 없다.
 *   그 값은 렌더 시점의 **현재 소속**을 붙인 것이다. 경기 당시 소속으로 쓰면 안 된다.
 *   (선수 목록 자체는 경기 당시 사실이라 참가자 복원 근거로는 유효하다 — D-129)
 *
 * ── 지어내지 않는다
 *   근거가 없으면 전부 null 로 둔다. 현재 소속으로 메우지 않는다.
 */
import { prisma } from '../src/index'

export type AffiliationSource = 'nexon-detail' | 'roster'

export interface MatchTimeAffiliationResult {
  matchesScanned: number
  statsScanned: number
  filledFromNexon: number
  filledFromRoster: number
  linkedToLeagueClan: number
  unknown: number
  unchanged: number
}

interface ClanRef {
  leagueClanId: string | null
  slug: string | null
  markBgUrl: string | null
  markFrontUrl: string | null
}

/**
 * 클랜명 → 우리 리그 클랜. **정확히 같은 이름만** 잇는다.
 * 유사 매칭은 하지 않는다 (D-036). 외부 클랜이면 이름만 남고 연결은 null 이다.
 */
async function buildClanIndex(leagueId: string): Promise<Map<string, ClanRef>> {
  const rows = await prisma.leagueClan.findMany({
    where: { leagueId },
    select: {
      id: true,
      clan: { select: { name: true, slug: true, markBgUrl: true, markFrontUrl: true } },
    },
  })
  const index = new Map<string, ClanRef>()
  for (const row of rows) {
    index.set(row.clan.name, {
      leagueClanId: row.id,
      slug: row.clan.slug,
      markBgUrl: row.clan.markBgUrl,
      markFrontUrl: row.clan.markFrontUrl,
    })
  }
  return index
}

export async function backfillMatchTimeAffiliation(input: {
  leagueSlug: string
  confirm?: boolean
  /** 이미 채워진 행도 다시 본다 */
  redo?: boolean
  limit?: number | null
}): Promise<MatchTimeAffiliationResult> {
  const confirm = Boolean(input.confirm)
  const result: MatchTimeAffiliationResult = {
    matchesScanned: 0,
    statsScanned: 0,
    filledFromNexon: 0,
    filledFromRoster: 0,
    linkedToLeagueClan: 0,
    unknown: 0,
    unchanged: 0,
  }

  const league = await prisma.league.findUnique({
    where: { slug: input.leagueSlug },
    select: { id: true },
  })
  if (!league) throw new Error(`리그를 찾을 수 없다: ${input.leagueSlug}`)

  const clanIndex = await buildClanIndex(league.id)

  const matches = await prisma.match.findMany({
    where: { leagueId: league.id, sourceMatchId: { not: null } },
    orderBy: { startAt: 'asc' },
    take: input.limit ?? undefined,
    select: { id: true, startAt: true, sourceMatchId: true },
  })

  for (const match of matches) {
    result.matchesScanned += 1

    /* --- 근거 1: 넥슨 상세의 참가자별 guild_name --- */
    const staging = await prisma.nexonMatch.findFirst({
      where: { sourceMatchId: match.sourceMatchId! },
      select: {
        detailFetchedAt: true,
        participants: { select: { userName: true, clanName: true } },
      },
    })
    const nexonClanByName = new Map<string, string>()
    for (const participant of staging?.participants ?? []) {
      if (participant.userName && participant.clanName) {
        nexonClanByName.set(participant.userName, participant.clanName)
      }
    }
    const nexonObservedAt = staging?.detailFetchedAt ?? null

    const stats = await prisma.matchPlayerStat.findMany({
      where: {
        matchId: match.id,
        ...(input.redo ? {} : { matchTimeClanSource: null }),
      },
      select: {
        id: true,
        playerId: true,
        matchTimeClanName: true,
        player: { select: { name: true } },
      },
    })

    for (const stat of stats) {
      result.statsScanned += 1

      let clanName: string | null = nexonClanByName.get(stat.player.name) ?? null
      let source: AffiliationSource | null = clanName ? 'nexon-detail' : null
      let observedAt: Date | null = clanName ? nexonObservedAt : null
      let confidence: string | null = clanName ? 'high' : null

      /* --- 근거 2: 그 시각에 열려 있던 로스터 소속 --- */
      if (!clanName) {
        const membership = await prisma.leagueRosterMembership.findFirst({
          where: {
            leagueId: league.id,
            playerId: stat.playerId,
            joinedAt: { lte: match.startAt },
            OR: [{ leftAt: null }, { leftAt: { gte: match.startAt } }],
          },
          orderBy: { joinedAt: 'desc' },
          select: {
            observedAt: true,
            leagueClan: { select: { clan: { select: { name: true } } } },
          },
        })
        if (membership) {
          clanName = membership.leagueClan.clan.name
          source = 'roster'
          observedAt = membership.observedAt
          // 로스터는 "그 시각에 소속이었다"는 추론이다. 경기 기록 자체보다 약하다
          confidence = 'medium'
        }
      }

      if (!clanName || !source) {
        result.unknown += 1
        continue
      }
      if (stat.matchTimeClanName === clanName) {
        result.unchanged += 1
        continue
      }

      const ref = clanIndex.get(clanName) ?? null
      if (ref?.leagueClanId) result.linkedToLeagueClan += 1
      if (source === 'nexon-detail') result.filledFromNexon += 1
      else result.filledFromRoster += 1

      if (!confirm) continue
      await prisma.matchPlayerStat.update({
        where: { id: stat.id },
        data: {
          matchTimeClanName: clanName,
          matchTimeLeagueClanId: ref?.leagueClanId ?? null,
          matchTimeClanSlug: ref?.slug ?? null,
          matchTimeClanMarkBgUrl: ref?.markBgUrl ?? null,
          matchTimeClanMarkFrontUrl: ref?.markFrontUrl ?? null,
          matchTimeClanSource: source,
          matchTimeClanObservedAt: observedAt,
          matchTimeClanConfidence: confidence,
        },
      })
    }
  }

  return result
}
