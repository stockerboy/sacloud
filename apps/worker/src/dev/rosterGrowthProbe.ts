/**
 * **명부가 정말 늘고 있나, 아니면 이관한 날짜인가** (2026-09-03 · 읽기 전용).
 *
 * `joinedAt` 이 대부분 2026-08-20~31 에 몰려 있다. 그건 ★리그에 새로 들어온 날★ 이 아니라
 * ★우리가 이관한 날★ 일 수 있다. ★그 둘은 뜻이 정반대다★ —
 *   이관한 날이면 → ★명부는 한 번 받으면 끝★
 *   진짜 가입일이면 → ★계속 받아야 한다★
 * ★날짜별로 갈라 보면 안다★ — 이관이면 며칠에 뭉쳐 있고, 진짜면 고르게 퍼진다.
 */
import { prisma } from '@sacloud/db'
async function main() {
  for (const t of ['LeagueClan', 'LeaguePlayer'] as const) {
    console.info(`\n══ ${t} · joinedAt 날짜별 ══\n`)
    const rows = t === 'LeagueClan'
      ? await prisma.$queryRaw<{ d: string; n: bigint }[]>`
          SELECT to_char(lc."joinedAt" AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD') AS d, count(*) AS n
            FROM "LeagueClan" lc GROUP BY 1 ORDER BY 1 DESC LIMIT 14`
      : await prisma.$queryRaw<{ d: string; n: bigint }[]>`
          SELECT to_char(lp."joinedAt" AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD') AS d, count(*) AS n
            FROM "LeaguePlayer" lp GROUP BY 1 ORDER BY 1 DESC LIMIT 14`
    const max = Math.max(...rows.map(r => Number(r.n)), 1)
    for (const r of rows) {
      const n = Number(r.n)
      console.info(`  ${r.d}  ${n.toLocaleString().padStart(7)}  ${'#'.repeat(Math.round(n/max*40))}`)
    }
  }
  console.info('\n★읽는 법★ — 며칠에 뭉쳐 있으면 ★이관한 날★ 이고 명부는 한 번 받으면 된다.')
  console.info('           날마다 조금씩이면 ★진짜 가입★ 이고 계속 받아야 한다.')
}
main().catch(console.error).finally(() => prisma.$disconnect())
