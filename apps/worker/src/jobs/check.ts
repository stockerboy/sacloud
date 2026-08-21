/**
 * 검증 — **숫자 대조**로 판정한다.
 *
 * "수집 완료" 로그는 판정 근거가 아니다 (`CLAUDE.md` 3-A 6번).
 * 결과는 `MigrationCheck`에 남겨 나중에 다시 볼 수 있게 한다.
 */
import { prisma } from '@sacloud/db'
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
    select: { participantCount: true },
  })
  const expectedStats = projectedMatches.reduce(
    (sum, match) => sum + (match.participantCount ?? 0),
    0,
  )
  const actualStats = await prisma.matchPlayerStat.count({
    where: { match: { origin: NEXON_SOURCE } },
  })
  await push({
    name: 'domain_stat_count',
    expected: expectedStats,
    actual: actualStats,
    note: '투영된 매치의 참가자 수 합계',
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

  /* 6) Phase 8은 래더를 만들지 않는다 */
  const ratingTouched = await prisma.matchPlayerStat.count({
    where: {
      match: { origin: NEXON_SOURCE },
      OR: [
        { ratingBefore: { not: null } },
        { ratingUpdate: { not: null } },
        { ratingAfter: { not: null } },
        { formulaVersion: { not: null } },
      ],
    },
  })
  await push({
    name: 'nexon_rating_untouched',
    expected: 0,
    actual: ratingTouched,
    note: '래더 계산은 Phase 9다. Phase 8이 값을 넣으면 안 된다',
  })

  /* 7) 신선도 정책을 넘긴 데이터 */
  const stale = await prisma.nexonMatch.count({ where: { refreshDueAt: { lte: now } } })
  await push({
    name: 'stale_beyond_policy',
    expected: 0,
    actual: stale,
    note: '갱신 기한이 지난 스테이징 매치 (nexon:refresh 대상)',
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
