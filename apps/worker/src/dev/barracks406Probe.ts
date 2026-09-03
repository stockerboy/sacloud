/**
 * **406 이 「로그 없음」인가** — 넥슨을 한 번도 안 부르고 본다 (2026-09-03 · 읽기 전용).
 *
 * ══ 무엇을 가르나 ══
 *
 * ```
 * 막힘   우리가 못 부르는 것    → ★고칠 수 있다★ (헤더·속도·키)
 * 결손   ★줄 게 원래 없는 것★  → ★고칠 수 없다.★ 그만큼은 영영 빈다
 * ```
 * 사장님 조건이 **「누락없이」** 라서 이 차이가 전부다.
 *
 * ⚠ **DB 만 읽는다. 넥슨·병영수첩을 부르지 않는다.**
 */
import { prisma } from '@sacloud/db'

/** 2026-09-03 에 두 번 다 406 이 난 경기 (clan_no 250304000068) */
const FAILED = '260828231452124001'
/** 같은 clan_no 로 200 이 왔던 경기들 — 대조군 */
const OK = [
  '260828125738125001',
  '260828130504125001',
  '260828222528124001',
  '260828223338124002',
  '260828224242124001',
]

async function main(): Promise<void> {
  console.info('══ 1 · ★그 경기가 우리 DB 에 있나★ ══\n')
  const rows = await prisma.match.findMany({
    where: { sourceMatchId: { in: [FAILED, ...OK] } },
    select: {
      sourceMatchId: true,
      origin: true,
      startAt: true,
      league: { select: { slug: true } },
      _count: { select: { stats: true } },
    },
  })
  const byId = new Map(rows.map((r) => [r.sourceMatchId!, r]))
  const show = (id: string, label: string) => {
    const r = byId.get(id)
    console.info(
      r
        ? `  ${label} ${id}  ${r.league.slug} · ${r.origin} · ${r.startAt.toISOString().slice(0, 10)} · ★라인업 ${r._count.stats}명★`
        : `  ${label} ${id}  ★우리 DB 에 없다★`,
    )
  }
  show(FAILED, '★406★')
  for (const id of OK) show(id, ' 200 ')

  console.info('\n══ 2 · ★IPL 경기의 라인업 인원 분포★ ══\n')
  /*
   * 「10명 아니면 0명」인지, ★중간이 있는지★ 를 본다.
   * 중간(1~9명)이 있으면 ★부분 결손이 이미 일어나고 있다★ 는 뜻이고,
   * 그러면 406 8% 도 같은 성격일 가능성이 높아진다.
   */
  const dist = await prisma.$queryRaw<{ n: bigint; games: bigint }[]>`
    SELECT cnt AS n, count(*) AS games FROM (
      SELECT m."id", count(s."id") AS cnt
        FROM "Match" m
        JOIN "League" l ON l."id" = m."leagueId"
        LEFT JOIN "MatchPlayerStat" s ON s."matchId" = m."id"
       WHERE l."slug" = 'nolink'
       GROUP BY m."id"
    ) t GROUP BY 1 ORDER BY 1
  `
  for (const d of dist) {
    const n = Number(d.n)
    const mark = n === 0 ? '  ← 라인업 없음' : n === 10 ? '  ← 온전' : '  ★← 부분 결손★'
    console.info(`  ${String(n).padStart(2)}명  ${Number(d.games).toLocaleString().padStart(8)}건${mark}`)
  }

  console.info('\n══ 3 · ★그 경기가 특별한가★ ══\n')
  const one = byId.get(FAILED)
  if (!one) {
    console.info('  우리 DB 에 없어서 비교할 것이 없다')
  } else {
    const around = await prisma.match.count({
      where: {
        league: { slug: 'nolink' },
        startAt: {
          gte: new Date(one.startAt.getTime() - 3600_000),
          lte: new Date(one.startAt.getTime() + 3600_000),
        },
      },
    })
    console.info(`  그 시각 앞뒤 1시간의 IPL 경기 ${around}건`)
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
