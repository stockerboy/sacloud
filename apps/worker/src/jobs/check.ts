/**
 * 검증 — **숫자 대조**로 판정한다.
 *
 * "수집 완료" 로그는 판정 근거가 아니다 (`CLAUDE.md` 3-A 6번).
 * 결과는 `MigrationCheck`에 남겨 나중에 다시 볼 수 있게 한다.
 */
import { prisma, Prisma } from '@sacloud/db'
import { ENDPOINT, NEXON_SOURCE } from '@sacloud/nexon'
import { log, table } from '../lib/log.js'
import { recordCheck } from '../lib/jobStore.js'

export interface CheckRow {
  name: string
  expected: number
  actual: number
  passed: boolean
  note: string
}

export async function runCheck(input: {
  migrationVersion: string
  persist?: boolean
}): Promise<{ rows: CheckRow[]; allPassed: boolean }> {
  const now = new Date()
  const rows: CheckRow[] = []

  const push = async (row: Omit<CheckRow, 'passed'>) => {
    const passed = row.expected === row.actual
    rows.push({ ...row, passed })
    if (input.persist !== false) {
      await recordCheck({
        name: row.name,
        expected: row.expected,
        actual: row.actual,
        migrationVersion: input.migrationVersion,
        note: row.note,
      })
    }
  }

  /* 1) 상세 원본 수 = 상세를 받은 스테이징 매치 수 */
  const rawDetailIds = await prisma.rawImport.groupBy({
    by: ['sourceId'],
    where: { source: NEXON_SOURCE, endpoint: ENDPOINT.matchDetail },
  })
  const stagingWithDetail = await prisma.nexonMatch.count({
    where: { detailFetchedAt: { not: null } },
  })
  await push({
    name: 'raw_vs_staging_match',
    expected: rawDetailIds.length,
    actual: stagingWithDetail,
    note: '상세 원본을 받은 매치가 전부 스테이징에 있는가',
  })

  /* 2) 참가자가 0명인 스테이징 매치는 없어야 한다 */
  const emptyStaging = await prisma.nexonMatch.count({
    where: { detailFetchedAt: { not: null }, participants: { none: {} } },
  })
  await push({
    name: 'staging_participants_per_match',
    expected: 0,
    actual: emptyStaging,
    note: '상세를 받았는데 참가자가 없는 매치',
  })

  /* 3) 투영된 스테이징 수 = 운영 매치(origin=nexon) 수 */
  const projected = await prisma.nexonMatch.count({ where: { projectionStatus: 'projected' } })
  const domainMatches = await prisma.match.count({ where: { origin: NEXON_SOURCE } })
  await push({
    name: 'staging_vs_domain',
    expected: projected,
    actual: domainMatches,
    note: '투영 표시와 실제 운영 매치 수가 같은가',
  })

  /* 4) 참가자 기록 수 */
  const projectedMatches = await prisma.nexonMatch.findMany({
    where: { projectionStatus: 'projected' },
    select: { participantCount: true, projectedMatchId: true },
  })
  /* 예전에는 "상세 참가자 수 = 참가 기록 수"를 기대했다. 그건 Phase 8의 투영 규칙이었다.
     로스터 기반 재구성은 **확인된 참가자만** 기록한다 (D-056 — 관측되지 않은 사람을 만들지 않는다).
     그래서 두 수는 같지 않은 것이 정상이다. 대신 지켜야 하는 것은 두 가지다.
       1. 투영된 매치는 참가 기록이 **하나라도** 있어야 한다 (빈 경기를 만들지 않는다)
       2. 참가 기록이 상세 참가자 수를 **넘지 않는다** (없는 사람을 만들어내지 않는다) */
  const emptyProjected = await prisma.match.count({
    where: { origin: NEXON_SOURCE, stats: { none: {} } },
  })
  await push({
    name: 'projected_match_has_stats',
    expected: 0,
    actual: emptyProjected,
    note: '투영됐는데 참가 기록이 없는 매치',
  })

  let overCounted = 0
  for (const match of projectedMatches) {
    if (!match.projectedMatchId) continue
    const stats = await prisma.matchPlayerStat.count({ where: { matchId: match.projectedMatchId } })
    if (stats > (match.participantCount ?? 0)) overCounted += 1
  }
  await push({
    name: 'stats_within_detail_participants',
    expected: 0,
    actual: overCounted,
    note: '상세 참가자보다 참가 기록이 많은 매치 (없는 사람을 만들어낸 것)',
  })

  /* 5) mock 시드와 실제 수집이 같은 리그에 섞이지 않았는가 */
  const mockLeagues = new Set(
    (
      await prisma.match.groupBy({ by: ['leagueId'], where: { origin: 'mock' } })
    ).map((row) => row.leagueId),
  )
  const nexonLeagues = await prisma.match.groupBy({
    by: ['leagueId'],
    where: { origin: NEXON_SOURCE },
  })
  const mixed = nexonLeagues.filter((row) => mockLeagues.has(row.leagueId)).length
  await push({
    name: 'mock_nexon_isolation',
    expected: 0,
    actual: mixed,
    note: 'mock 경기와 nexon 경기가 함께 있는 리그 수',
  })

  /* 6) 배치고사 경기의 래더 증감은 0이다 (`CLAUDE.md` 3-B 7번)

     예전 이 자리에는 "Phase 8은 래더를 만들지 않는다"가 있었다. Phase 9의 래더 엔진이
     실제로 값을 넣기 시작한 뒤로는 그 기대 자체가 틀렸다. 지금 지켜야 하는 불변식으로 바꾼다. */
  const placementRated = await prisma.matchPlayerStat.count({
    where: {
      match: { origin: NEXON_SOURCE },
      isPlacement: true,
      NOT: { ratingUpdate: 0 },
    },
  })
  await push({
    name: 'placement_rating_update_zero',
    expected: 0,
    actual: placementRated,
    note: '배치고사 경기인데 래더가 움직인 참가 기록',
  })

  /* 7) 신선도 정책을 넘긴 데이터 */
  const stale = await prisma.nexonMatch.count({ where: { refreshDueAt: { lte: now } } })
  await push({
    name: 'stale_beyond_policy',
    expected: 0,
    actual: stale,
    note: '갱신 기한이 지난 스테이징 매치 (nexon:refresh 대상)',
  })

  /* ----------------------------------------------------------- Phase 8.2 --- */

  /* 8) 재구성 판정에는 반드시 근거가 남아야 한다 */
  const judgedWithoutEvidence = await prisma.nexonMatch.count({
    where: { reconstructedAt: { not: null }, reconstruction: { equals: Prisma.DbNull } },
  })
  await push({
    name: 'reconstruction_evidence_recorded',
    expected: 0,
    actual: judgedWithoutEvidence,
    note: '판정했는데 근거 요약이 없는 매치',
  })

  /* 9) **본클랜원**으로 기록된 참가자는 경기 시점 로스터로 뒷받침돼야 한다 (D-052).
        용병(`participantRole = "mercenary"`)은 그 팀 로스터에 없는 것이 정상이다 (D-073) —
        여기서 세면 정상 데이터를 사고로 오인한다 */
  const reconstructed = await prisma.nexonMatch.findMany({
    where: { reconstructedAt: { not: null }, projectionStatus: 'projected' },
    select: { projectedMatchId: true },
  })
  const reconstructedMatchIds = reconstructed
    .map((row) => row.projectedMatchId)
    .filter((value): value is string => value !== null)

  let unbackedParticipants = 0
  for (const matchId of reconstructedMatchIds) {
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      select: {
        startAt: true,
        redLeagueClanId: true,
        blueLeagueClanId: true,
        stats: { select: { playerId: true, side: true, participantRole: true } },
      },
    })
    if (!match) continue


    for (const stat of match.stats) {
      // 용병은 그 팀 로스터에 없다. 그게 정상이다
      if (stat.participantRole !== 'member') continue
      const covering = await prisma.leagueRosterMembership.count({
        where: {
          playerId: stat.playerId,
          leagueClanId: {
            in: [match.redLeagueClanId, match.blueLeagueClanId].filter(
              (value): value is string => value !== null,
            ),
          },
          joinedAt: { lte: match.startAt },
          OR: [{ leftAt: null }, { leftAt: { gt: match.startAt } }],
        },
      })
      if (covering === 0) unbackedParticipants += 1
    }
  }
  await push({
    name: 'reconstructed_members_roster_backed',
    expected: 0,
    actual: unbackedParticipants,
    note: '본클랜원으로 기록됐는데 경기 시점 로스터 근거가 없는 참가자',
  })

  /* 10) 리그 우선 폴링 대상은 로스터로 뒷받침돼야 한다 (D-053) */
  const leaguePriority = await prisma.nexonPollState.findMany({
    where: { priorityClass: 'league' },
    select: { playerId: true },
  })
  const rosterPlayerIds = new Set(
    (
      await prisma.leagueRosterMembership.findMany({
        where: { leftAt: null },
        select: { playerId: true },
        distinct: ['playerId'],
      })
    ).map((row) => row.playerId),
  )
  await push({
    name: 'league_priority_roster_backed',
    expected: 0,
    actual: leaguePriority.filter(
      (state) => state.playerId === null || !rosterPlayerIds.has(state.playerId),
    ).length,
    note: '로스터 근거 없이 리그 우선순위가 붙은 폴링 대상',
  })

  /* 11) 앞당긴 대상에는 사유가 남아야 한다 (D-055) */
  const propagatedWithoutReason = await prisma.nexonPollState.count({
    where: { propagatedAt: { not: null }, propagationReason: null },
  })
  await push({
    name: 'propagation_reason_recorded',
    expected: 0,
    actual: propagatedWithoutReason,
    note: '사유 없이 조회가 앞당겨진 대상',
  })

  /* ------------------------------------------------------------ Phase 9 --- */

  /* 12) **공식** 경기는 한쪽이라도 본클랜원 3명을 채웠어야 한다 (D-079, OR 조건).
        비공식 경기는 둘 다 미달인 것이 정상이므로 여기서 세지 않는다 (D-080) */
  const officialStagings = await prisma.nexonMatch.findMany({
    where: { projectionStatus: 'projected', official: true },
    select: { winnerMembersConfirmed: true, loserMembersConfirmed: true },
  })
  const officialBelowMinimum = officialStagings.filter(
    (row) => (row.winnerMembersConfirmed ?? 0) < 3 && (row.loserMembersConfirmed ?? 0) < 3,
  ).length
  await push({
    name: 'official_requires_three_members',
    expected: 0,
    actual: officialBelowMinimum,
    note: '양 팀 모두 본클랜원 3명 미만인데 공식으로 인정된 경기',
  })

  /* 13) 비공식 경기에는 래더가 붙으면 안 된다 (D-080) */
  const referenceRated = await prisma.matchPlayerStat.count({
    where: { match: { origin: NEXON_SOURCE, official: false }, ratingUpdate: { not: null } },
  })
  await push({
    name: 'reference_not_rated',
    expected: 0,
    actual: referenceRated,
    note: '비공식 경기인데 개인 래더가 계산된 참가 기록',
  })

  /* 13) 래더 값이 있으면 formulaVersion도 있어야 한다 (재현 가능해야 한다) */
  const ratedWithoutVersion = await prisma.matchPlayerStat.count({
    where: {
      match: { origin: NEXON_SOURCE },
      ratingUpdate: { not: null },
      formulaVersion: null,
    },
  })
  await push({
    name: 'rating_formula_version_recorded',
    expected: 0,
    actual: ratedWithoutVersion,
    note: '공식 버전 없이 계산된 래더 값',
  })

  /* 14) 클랜 래더는 동급 경기에서 제로섬이어야 한다 — 점수가 새로 생기면 안 된다 (D-060) */
  const clanRated = await prisma.match.findMany({
    where: {
      origin: NEXON_SOURCE,
      redRatingUpdate: { not: null },
      blueRatingUpdate: { not: null },
      redRatingBefore: { not: null },
      blueRatingBefore: { not: null },
    },
    select: {
      redRatingBefore: true,
      blueRatingBefore: true,
      redRatingUpdate: true,
      blueRatingUpdate: true,
    },
  })
  const nonZeroSum = clanRated.filter(
    (match) =>
      match.redRatingBefore === match.blueRatingBefore &&
      (match.redRatingUpdate ?? 0) + (match.blueRatingUpdate ?? 0) !== 0,
  ).length
  await push({
    name: 'clan_rating_zero_sum',
    expected: 0,
    actual: nonZeroSum,
    note: '동급 클랜 경기인데 증감 합이 0이 아닌 경기',
  })

  table(
    rows.map((row) => ({
      검사: row.name,
      기대: row.expected,
      실제: row.actual,
      판정: row.passed ? 'PASS' : 'FAIL',
    })),
  )
  const allPassed = rows.every((row) => row.passed)
  log(allPassed ? '전 항목 통과' : `실패 ${rows.filter((row) => !row.passed).length}건`)

  return { rows, allPassed }
}
