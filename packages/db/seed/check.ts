/**
 * 시드 결과 자가 점검.
 *
 * "적재 완료" 로그가 아니라 **숫자 대조**로 판정한다 (CLAUDE.md 3-A 6번).
 * 마이그레이션 검증(`MigrationCheck`)과 같은 사고방식을 개발 시드에도 적용한다.
 */
import { dataset } from '@sacloud/mock/dataset'
import { prisma } from '../src/index.js'

let failed = 0

function check(name: string, expected: number | string, actual: number | string) {
  const ok = expected === actual
  if (!ok) failed += 1
  console.info(`${ok ? 'PASS' : 'FAIL'}  ${name}  기대=${expected}  실제=${actual}`)
}

async function main() {
  /* 1. 건수 대조 — 픽스처와 DB가 같아야 한다 */
  check('클랜', dataset.clans.length, await prisma.clan.count())
  check('플레이어', dataset.players.length, await prisma.player.count())
  check('사용자', dataset.users.length, await prisma.user.count())
  check('리그', dataset.leagues.length, await prisma.league.count())
  check('리그클랜', dataset.leagueClans.length, await prisma.leagueClan.count())
  check('리그플레이어', dataset.leaguePlayers.length, await prisma.leaguePlayer.count())
  check('매치', dataset.matches.length, await prisma.match.count())
  check(
    '참가기록',
    dataset.matches.reduce((sum, match) => sum + match.players.length, 0),
    await prisma.matchPlayerStat.count(),
  )
  check('게시글', dataset.boards.length, await prisma.board.count())
  check('댓글', dataset.comments.length, await prisma.comment.count())

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

  console.info(failed === 0 ? '\n전부 통과.' : `\n${failed}건 실패.`)
  if (failed > 0) process.exitCode = 1
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
