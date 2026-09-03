/**
 * **설박튀 — 「설치하고 박고 튀는」 경기가 기록에 남는가** (2026-09-03 · 읽기 전용).
 *
 * ══ 사장님 말씀 ══
 *
 * > «레드팀이 폭탄을 설치하고 블루팀이 해체를 다 하기전에 아이템을 쓰고 5명이 전부 나가면
 * >  **「설박튀」가 된다. 기록이 안 찍힌다.** 이건 서플라이의 고질적이고 치명적인 문제점이며
 * >  항상 유저들끼리 이거때문에 싸운다. **반드시 해결해야한다**»
 * > «**인게임에서는 블루 승리가 맞다**» · «탈주해도 병영수첩에 기록이 남지 않고 패널티가 없다»
 *
 * ★목표 — 「설박튀 경기를 블루 승리로 기록에 남긴다」★
 *
 * ══ 이 파일이 보는 것 ══
 *
 * **우리 DB 에 그 흔적이 있는가.** 넥슨·병영수첩을 부르지 않는다.
 * ```
 * ① 그 406 경기의 클랜이 어디인가 (목록을 다시 부를 때 쓸 slug)
 * ② ★참가자가 5명뿐인 경기★ — 한쪽이 통째로 빠진 모양
 * ③ ★승패가 안 정해진 경기★
 * ④ 배틀로그 원문을 우리가 갖고 있나 (`BarracksBattleLogRaw`)
 * ```
 * ⚠ **읽기만 한다.**
 */
import { prisma } from '@sacloud/db'

const FAILED_MATCH = '260828231452124001'
const FAILED_CLAN_NO = '250304000068'

async function main(): Promise<void> {
  console.info('══ 1 · 406 난 경기의 클랜 ══\n')
  const num = await prisma.barracksClanNumber.findUnique({
    where: { clanNo: FAILED_CLAN_NO },
    select: { clanNo: true, source: true, votes: true, clan: { select: { name: true, slug: true } } },
  })
  console.info(
    num
      ? `  clan_no ${num.clanNo} → ★${num.clan.name} (${num.clan.slug})★ · 근거 ${num.source}/${num.votes}`
      : `  clan_no ${FAILED_CLAN_NO} → ★우리 DB 에 매핑이 없다★`,
  )

  const m = await prisma.match.findFirst({
    where: { sourceMatchId: FAILED_MATCH },
    select: {
      startAt: true,
      origin: true,
      winnerSide: true,
      firstHalfAttackSide: true,
      league: { select: { slug: true } },
      _count: { select: { stats: true } },
    },
  })
  console.info(
    m
      ? `  그 경기: ${m.league.slug} · ${m.startAt.toISOString()} · 승자 ${m.winnerSide} · 전반공수 ${m.firstHalfAttackSide ?? '모름'} · 라인업 ${m._count.stats}명`
      : '  그 경기가 우리 DB 에 없다',
  )

  console.info('\n══ 2 · ★설박튀 후보 — 우리 DB 에 몇 건인가★ ══\n')
  /*
   * ★우리 스키마는 「결과 없는 경기」를 담을 수 없다★
   *
   * `Match.winnerSide` 는 **String(널 불가)** 이고 점수 칸이 아예 없다.
   * 그래서 설박튀처럼 「결과가 안 난 경기」는 ★우리 DB 에 들어올 자리가 없다.★
   * 원본이 안 주면 우리도 못 만든다 — ★그 사실 자체가 이 조사의 답 하나다.★
   */
  console.info('  `Match.winnerSide` 는 널 불가 · 점수 칸 없음')
  console.info('  → ★「무승부·미결」을 표현할 수 없다. 결과 없는 경기는 애초에 못 들어온다★')

  console.info('\n══ 3 · ★한쪽만 5명인 경기★ (한 팀이 통째로 빠진 모양) ══\n')
  const sides = await prisma.$queryRaw<{ league: string; n: bigint; games: bigint }[]>`
    SELECT l."slug" AS league, cnt AS n, count(*) AS games FROM (
      SELECT m."id", m."leagueId", count(s."id") AS cnt
        FROM "Match" m
        JOIN "MatchPlayerStat" s ON s."matchId" = m."id"
       GROUP BY m."id", m."leagueId"
    ) t
    JOIN "League" l ON l."id" = t."leagueId"
    WHERE cnt < 10
    GROUP BY 1, 2 ORDER BY 1, 2
  `
  if (sides.length === 0) console.info('  ★10명 미만인 경기가 없다★ (라인업이 있는 경기 기준)')
  for (const r of sides) {
    console.info(`  ${r.league.padEnd(9)} ${Number(r.n)}명  ${Number(r.games).toLocaleString()}건`)
  }

  console.info('\n══ 4 · 배틀로그 원문을 우리가 갖고 있나 ══\n')
  const raw = await prisma.barracksBattleLogRaw.groupBy({
    by: ['status'],
    _count: { _all: true },
  })
  if (raw.length === 0) console.info('  ★운영에 배틀로그 원문이 0행이다★')
  for (const r of raw) console.info(`  ${r.status.padEnd(8)} ${r._count._all.toLocaleString()}행`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
