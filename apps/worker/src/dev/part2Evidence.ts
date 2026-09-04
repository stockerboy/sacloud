/**
 * ★Part 2 증거★ — 「창 앞 경기가 막혔는가」를 ★운영 DB 실제 행★ 으로 확인한다 (2026-09-04).
 *
 * ── 왜 이게 따로 필요한가
 *   운영 사이트에서 창 앞 경기를 부르면 404 가 온다. 그런데 ★404 만으로는
 *   「창이 막은 것」과 「그런 경기가 원래 없는 것」을 구별할 수 없다.★
 *   특히 ★열산(daerule)★ 은 아직 창 안 경기가 0건이라 비교할 짝이 없다.
 *
 *   그래서 같은 경기 하나를 ★창을 걸고 / 안 걸고★ 두 번 찾는다.
 *   ```
 *   창 안 걸면  →  행이 나온다   (자료는 있다)
 *   창 걸면     →  안 나온다     (★창이 막은 것이다★)
 *   ```
 *
 * ★읽기만 한다.★ 한 줄도 쓰지 않는다.
 */
import { prisma } from '@sacloud/db'
import { SEASON0_FROM, SEASON0_TO } from '../lib/season0Window.js'

const leagues = await prisma.league.findMany({
  select: { id: true, slug: true },
  orderBy: { slug: 'asc' },
})

const windowWhere = {
  startAt: { gte: SEASON0_FROM, ...(SEASON0_TO ? { lt: SEASON0_TO } : {}) },
}

console.info(`창 = ${SEASON0_FROM.toISOString()} ~ ${SEASON0_TO?.toISOString() ?? '(열림)'}`)
console.info('')

for (const lg of leagues) {
  /* 창 앞에서 ★가장 늦은★ 경기 — 경계에 가장 가까운 실제 경기다 */
  const before = await prisma.match.findFirst({
    where: { leagueId: lg.id, startAt: { lt: SEASON0_FROM } },
    orderBy: { startAt: 'desc' },
    select: { id: true, sourceMatchId: true, startAt: true },
  })
  if (!before) {
    console.info(`${lg.slug.padEnd(9)} 창 앞 경기가 없다 — 잴 것이 없다`)
    continue
  }
  const key = before.sourceMatchId ?? before.id

  /* ① 창 없이 찾는다 — 자료가 있는지 */
  const raw = await prisma.match.findFirst({
    where: { leagueId: lg.id, OR: [{ sourceMatchId: key }, { id: key }] },
    select: { id: true },
  })

  /* ② 창을 걸고 찾는다 — 화면이 하는 것과 같은 조건 */
  const gated = await prisma.match.findFirst({
    where: {
      AND: [{ leagueId: lg.id, OR: [{ sourceMatchId: key }, { id: key }] }, windowWhere],
    },
    select: { id: true },
  })

  const verdict = raw && !gated ? '★창이 막았다★' : raw && gated ? '✗ 안 막혔다' : '? 행이 없다'
  console.info(
    `${lg.slug.padEnd(9)} ${key}  ${before.startAt.toISOString()}  ` +
      `창없이=${raw ? '있음' : '없음'}  창걸고=${gated ? '있음' : '없음'}  ${verdict}`,
  )
}

/* 창 안 경기 수 — 「열리는 쪽」이 실제로 있는지 */
console.info('')
const inWindow = await prisma.match.groupBy({
  by: ['leagueId'],
  where: windowWhere,
  _count: { _all: true },
})
console.info('창 안 경기 수 (열리는 쪽)')
for (const lg of leagues) {
  const row = inWindow.find((r) => r.leagueId === lg.id)
  console.info(`  ${lg.slug.padEnd(9)} ${row?._count._all ?? 0}`)
}

await prisma.$disconnect()
