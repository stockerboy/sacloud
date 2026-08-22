/**
 * 비공식 경기 재검증 (Phase 10 final cleanup · 정책 12).
 *
 *   pnpm --filter @sacloud/worker exec tsx src/dev/verifyUnofficialMatch.ts
 *
 * 확인하는 것
 *   경기 **이력은 남고**, 공식 통계에는 **하나도** 들어가지 않는가.
 *   "반영 안 했다"를 로그로 주장하지 않고 저장된 숫자로 대조한다.
 *
 * 읽기만 한다.
 */
import { prisma } from '@sacloud/db'

let failed = 0
function check(name: string, expected: number | string | boolean, actual: number | string | boolean) {
  const ok = expected === actual
  if (!ok) failed += 1
  console.info(`${ok ? 'PASS' : 'FAIL'}  ${name}  기대=${expected}  실제=${actual}`)
}

async function main(): Promise<void> {
  const match = await prisma.match.findFirst({
    where: { origin: 'nexon', official: false },
    select: {
      id: true,
      sourceMatchId: true,
      startAt: true,
      official: true,
      participantCompleteness: true,
      evidenceConfidence: true,
      redRatingUpdate: true,
      blueRatingUpdate: true,
      redRatingBefore: true,
      blueRatingBefore: true,
      league: { select: { slug: true, id: true } },
      map: { select: { name: true } },
      redClan: { select: { id: true, rating: true, clan: { select: { name: true } } } },
      blueClan: { select: { id: true, rating: true, clan: { select: { name: true } } } },
      stats: {
        select: {
          playerId: true,
          side: true,
          kill: true,
          death: true,
          assist: true,
          participantRole: true,
          ratingBefore: true,
          ratingUpdate: true,
          ratingAfter: true,
          formulaVersion: true,
          player: { select: { name: true } },
        },
      },
    },
  })

  if (!match) {
    console.error('비공식 경기가 없다. 먼저 e2eSetup + nexon:reconstruct 가 필요하다')
    process.exitCode = 1
    return
  }

  console.info(
    `대상  내부 id ${match.id} · sourceMatchId ${match.sourceMatchId} · ` +
      `${match.league.slug} · ${match.map.name} · ${match.startAt.toISOString()}\n`,
  )

  /* --- 남아 있어야 하는 것 --- */
  check('경기가 저장돼 있다', true, Boolean(match.id))
  check('원본 식별자가 남아 있다', '260716180538124001', match.sourceMatchId ?? '(없음)')
  check('참가 기록이 있다', 7, match.stats.length)
  check(
    'K/D/A가 경기 단위로 남아 있다',
    true,
    match.stats.every((stat) => stat.kill >= 0 && stat.death >= 0 && stat.assist >= 0),
  )
  check(
    '클랜원/용병 구분이 남아 있다',
    true,
    match.stats.every((stat) => ['member', 'mercenary'].includes(stat.participantRole)),
  )
  check('확인 수준이 기록돼 있다', true, match.participantCompleteness !== null)

  /* --- 절대 반영되면 안 되는 것 --- */
  check('공식 아님', false, match.official)
  check('개인 래더 증감이 붙은 참가 기록', 0, match.stats.filter((s) => s.ratingUpdate !== null).length)
  check('개인 래더 결과가 붙은 참가 기록', 0, match.stats.filter((s) => s.ratingAfter !== null).length)
  check('래더 공식 버전이 찍힌 참가 기록', 0, match.stats.filter((s) => s.formulaVersion !== null).length)
  check('클랜 래더 증감(레드)', '없음', match.redRatingUpdate === null ? '없음' : String(match.redRatingUpdate))
  check('클랜 래더 증감(블루)', '없음', match.blueRatingUpdate === null ? '없음' : String(match.blueRatingUpdate))

  /* 시즌 누적 — 이 경기에 나온 선수·클랜의 누적이 0인가 */
  const playerIds = match.stats.map((stat) => stat.playerId)
  const leaguePlayers = await prisma.leaguePlayer.findMany({
    where: { playerId: { in: playerIds }, leagueId: match.league.id },
    select: { win: true, lose: true, kill: true, death: true, rating: true, playerId: true },
  })
  check(
    '시즌 승 합계',
    0,
    leaguePlayers.reduce((sum, entry) => sum + entry.win, 0),
  )
  check(
    '시즌 패 합계',
    0,
    leaguePlayers.reduce((sum, entry) => sum + entry.lose, 0),
  )
  check(
    '시즌 킬 합계',
    0,
    leaguePlayers.reduce((sum, entry) => sum + entry.kill, 0),
  )
  check(
    '시즌 데스 합계',
    0,
    leaguePlayers.reduce((sum, entry) => sum + entry.death, 0),
  )
  check(
    '기본값(1500)에서 벗어난 개인 래더',
    0,
    leaguePlayers.filter((entry) => entry.rating !== 1500).length,
  )

  const clans = await prisma.leagueClan.findMany({
    where: { id: { in: [match.redClan.id, match.blueClan.id] } },
    select: { rating: true, win: true, lose: true, clan: { select: { name: true } } },
  })
  check('기본값에서 벗어난 클랜 래더', 0, clans.filter((entry) => entry.rating !== 1500).length)
  check(
    '클랜 시즌 전적',
    0,
    clans.reduce((sum, entry) => sum + entry.win + entry.lose, 0),
  )

  /* 랭킹 스냅샷에 올라가면 안 된다 (payload는 정렬 완료된 랭킹 행 배열이다) */
  const snapshots = await prisma.rankSnapshot.findMany({
    where: { leagueId: match.league.id },
    select: { payload: true },
  })
  const rankedIds = new Set(playerIds)
  const listed = snapshots.filter((snapshot) => {
    const rows = Array.isArray(snapshot.payload) ? snapshot.payload : []
    return rows.some((row) => {
      const id = (row as { player_id?: unknown; playerId?: unknown } | null)?.player_id
      const alt = (row as { playerId?: unknown } | null)?.playerId
      return rankedIds.has(String(id ?? alt))
    })
  })
  check('랭킹 스냅샷에 올라간 건수', 0, listed.length)

  console.info(`\n참가자 ${match.stats.length}명`)
  for (const stat of match.stats) {
    console.info(
      `  ${stat.side.padEnd(4)} ${stat.player.name}  ${stat.kill}/${stat.death}/${stat.assist}` +
        `  ${stat.participantRole === 'member' ? '클랜원' : '용병'}` +
        `  래더 ${stat.ratingUpdate === null ? '미반영' : stat.ratingUpdate}`,
    )
  }

  console.info(failed === 0 ? '\n전부 통과.' : `\n${failed}건 실패.`)
  if (failed > 0) process.exitCode = 1
}

main()
  .catch((error: unknown) => console.error(error))
  .finally(() => prisma.$disconnect())
