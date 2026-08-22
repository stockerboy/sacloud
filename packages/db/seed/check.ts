/**
 * 시드 결과 자가 점검.
 *
 * "적재 완료" 로그가 아니라 **숫자 대조**로 판정한다 (CLAUDE.md 3-A 6번).
 * 마이그레이션 검증(`MigrationCheck`)과 같은 사고방식을 개발 시드에도 적용한다.
 */
import { dataset } from '@sacloud/mock/dataset'
import { prisma } from '../src/index.js'

/** 시드가 함께 만드는 검수용 계정 수 (`admin-test` / `user-test`) */
const TEST_ACCOUNT_COUNT = 2

let failed = 0

function check(name: string, expected: number | string, actual: number | string) {
  const ok = expected === actual
  if (!ok) failed += 1
  console.info(`${ok ? 'PASS' : 'FAIL'}  ${name}  기대=${expected}  실제=${actual}`)
}

async function main() {
  /* 1. 건수 대조 — **픽스처가 만든 행**이 DB에 그대로 있는가.
        전체 개수를 세면 안 된다. 실운영 데이터(실제 클랜·리그·선수)가 들어오는 순간
        시드 검사가 무너져서, 진짜 문제와 정상적인 운영 데이터를 구분할 수 없게 된다. */
  const idsIn = <T extends { id: string }>(rows: readonly T[]) => ({
    id: { in: rows.map((row) => row.id) },
  })
  check('클랜', dataset.clans.length, await prisma.clan.count({ where: idsIn(dataset.clans) }))
  check(
    '플레이어',
    dataset.players.length,
    await prisma.player.count({ where: idsIn(dataset.players) }),
  )
  // 픽스처 사용자 + 검수용 계정 2개(admin-test / user-test). seed.ts의 `seedTestAccounts` 참조.
  check('사용자', dataset.users.length + TEST_ACCOUNT_COUNT, await prisma.user.count())
  check('리그', dataset.leagues.length, await prisma.league.count({ where: idsIn(dataset.leagues) }))
  check(
    '리그클랜',
    dataset.leagueClans.length,
    await prisma.leagueClan.count({ where: idsIn(dataset.leagueClans) }),
  )
  check(
    '리그플레이어',
    dataset.leaguePlayers.length,
    await prisma.leaguePlayer.count({ where: idsIn(dataset.leaguePlayers) }),
  )
  // 시드는 mock 출처만 만든다. 실제 수집분(origin=nexon)이 들어와도 이 검사가 흔들리면 안 된다
  check('매치(mock)', dataset.matches.length, await prisma.match.count({ where: { origin: 'mock' } }))
  check(
    '참가기록(mock)',
    dataset.matches.reduce((sum, match) => sum + match.players.length, 0),
    await prisma.matchPlayerStat.count({ where: { match: { origin: 'mock' } } }),
  )
  check('게시글', dataset.boards.length, await prisma.board.count({ where: idsIn(dataset.boards) }))
  check('댓글', dataset.comments.length, await prisma.comment.count({ where: idsIn(dataset.comments) }))

  /* 2. 한글이 깨지지 않고 저장됐는가 (DB 인코딩 확인) */
  const firstClan = dataset.clans[0]
  if (!firstClan) throw new Error('픽스처에 클랜이 없다')
  const storedClan = await prisma.clan.findUnique({
    where: { id: firstClan.id },
    select: { name: true },
  })
  check('한글 클랜명 왕복', firstClan.name, storedClan?.name ?? '(없음)')

  const encodingRows = await prisma.$queryRawUnsafe<{ enc: string }[]>(
    'SELECT pg_encoding_to_char(encoding) AS enc FROM pg_database WHERE datname = current_database()',
  )
  check('DB 인코딩', 'UTF8', encodingRows[0]?.enc ?? '(없음)')

  /* 3. 래더 정합성 — 통합 래더 = baseRating + 무기별 delta 합
       (LADDER_IMPLEMENTATION_SPEC 6장: 무기 분리가 통합 래더를 바꾸면 안 된다) */
  const leaguePlayers = await prisma.leaguePlayer.findMany({
    select: {
      rating: true,
      baseRating: true,
      weaponStats: { select: { ratingDelta: true } },
    },
  })
  const mismatched = leaguePlayers.filter(
    (entry) =>
      entry.baseRating + entry.weaponStats.reduce((sum, w) => sum + w.ratingDelta, 0) !==
      entry.rating,
  )
  check('래더 정합성 위반 건수', 0, mismatched.length)

  /* 4. 경기 시점 division 스냅샷이 비어 있지 않은가 (재현성 필수 필드) */
  const missingDivision = await prisma.matchPlayerStat.count({
    where: { OR: [{ playerDivisionAtMatch: 0 }, { opponentDivisionAtMatch: 0 }] },
  })
  check('division 스냅샷 누락', 0, missingDivision)

  /* 5. 대댓글은 1단계까지만 (원본 관측) */
  const deepReplies = await prisma.comment.count({
    where: { parent: { parentId: { not: null } } },
  })
  check('2단계 이상 대댓글', 0, deepReplies)

  /* 6. mock 시드와 실제 수집이 섞이지 않았는가 (Phase 8) */
  const mockLeagueIds = new Set(
    (await prisma.match.groupBy({ by: ['leagueId'], where: { origin: 'mock' } })).map(
      (row) => row.leagueId,
    ),
  )
  const realLeagues = await prisma.match.groupBy({
    by: ['leagueId'],
    where: { origin: { not: 'mock' } },
  })
  check(
    'mock·실수집 혼재 리그',
    0,
    realLeagues.filter((row) => mockLeagueIds.has(row.leagueId)).length,
  )

  // 시드는 넥슨 스테이징을 만들지 않는다
  check(
    'mock 시드가 만든 넥슨 스테이징',
    0,
    await prisma.nexonMatch.count({ where: { source: { not: 'nexon' } } }),
  )

  // 실제 수집분에 mock 공식 표기가 섞이면 안 된다
  check(
    '실수집에 mock 공식 표기',
    0,
    await prisma.matchPlayerStat.count({
      where: { match: { origin: { not: 'mock' } }, formulaVersion: 'mock-fixture' },
    }),
  )

  /* 7. 폴링 상태가 mock 데이터와 섞이지 않았는가 (Phase 8.1) */
  const pollStates = await prisma.nexonPollState.findMany({ select: { ouid: true, playerId: true } })
  const knownOuids = new Set(
    (await prisma.nexonIdentity.findMany({ select: { ouid: true } })).map((row) => row.ouid),
  )
  check(
    '신원 없는 폴링 상태',
    0,
    pollStates.filter((state) => !knownOuids.has(state.ouid)).length,
  )

  // 시드는 폴링 상태를 만들지 않는다. mock 플레이어가 폴링 대상이 되면 안 된다
  const mockPlayerIds = new Set(
    (
      await prisma.matchPlayerStat.findMany({
        where: { match: { origin: 'mock' } },
        select: { playerId: true },
        distinct: ['playerId'],
      })
    ).map((row) => row.playerId),
  )
  check(
    'mock 플레이어에 걸린 폴링 상태',
    0,
    pollStates.filter((state) => state.playerId !== null && mockPlayerIds.has(state.playerId)).length,
  )

  /* 8. 로스터는 시드가 만들지 않는다 (Phase 8.2) */
  const rosterRows = await prisma.leagueRosterMembership.findMany({
    select: { playerId: true, joinedAt: true, leftAt: true, source: true, verified: true },
  })
  // 시드는 운영자 등록 기록을 만들지 않는다. mock 플레이어가 로스터에 들어가면
  // 가짜 데이터가 재구성 판정의 근거가 된다
  check(
    'mock 플레이어가 들어간 로스터',
    0,
    rosterRows.filter((row) => mockPlayerIds.has(row.playerId)).length,
  )
  check('seed가 만든 로스터', 0, rosterRows.filter((row) => row.source === 'seed').length)
  // 기간이 뒤집힌 소속은 "그 시각에 이 클랜이었는가"를 판정할 수 없게 만든다
  check(
    '기간이 뒤집힌 로스터',
    0,
    rosterRows.filter((row) => row.leftAt !== null && row.leftAt <= row.joinedAt).length,
  )

  console.info(failed === 0 ? '\n전부 통과.' : `\n${failed}건 실패.`)
  if (failed > 0) process.exitCode = 1
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
