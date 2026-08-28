/**
 * 열산(픽업) 경기 탐지 실측 — 읽기만 한다.
 *
 * ── 무엇을 재나
 *
 * 열산은 고용주 2명이 나머지 8명을 뽑아 4:4 로 나눠 돌린다.
 * 그래서 **같은 선수들이 다음 경기에 팀을 바꿔 다시 나온다.**
 * 진짜 클랜전(퀵매치)은 A클랜 5명과 B클랜 5명이 섞이지 않는다.
 *
 * 두 가지 자국을 잰다
 *   1) 본클랜원 수      한 팀에 `participantRole='member'` 가 몇 명인가
 *   2) 팀 재편성        가까운 시간 안의 다른 경기와 선수가 많이 겹치면서
 *                       그 겹친 선수들이 **편을 바꿨는가**
 *
 * ── 왜 믿을 수 있나
 *
 * 열산리그(`sanply`)가 이미 따로 있다. **정답지가 있는 셈**이다.
 * 탐지기가 열산리그에서 많이 울리고 공식리그에서 조용하면 제대로 잡는 것이다.
 */
import { prisma } from '@sacloud/db'

const MIRROR_ORIGIN = '3rd.supply'
const FROM = new Date('2026-01-01T00:00:00.000Z')
const TO = new Date('2026-07-01T00:00:00.000Z')
/** 이 시간 안에 붙어 있는 경기끼리만 비교한다 */
const WINDOW_MIN = 90
/** 이만큼 겹쳐야 "같은 사람들이 또 한 판" 으로 본다 */
const MIN_SHARED = 6

interface Row {
  id: string
  startAt: Date
  stats: { playerId: string; side: string; participantRole: string }[]
}

async function analyse(slug: string): Promise<void> {
  const league = await prisma.league.findUnique({ where: { slug }, select: { id: true, name: true } })
  if (!league) return

  const matches = (await prisma.match.findMany({
    where: { leagueId: league.id, origin: MIRROR_ORIGIN, startAt: { gte: FROM, lt: TO } },
    orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      startAt: true,
      stats: { select: { playerId: true, side: true, participantRole: true } },
    },
  })) as Row[]

  console.log(`\n=== ${slug} (${league.name}) — ${matches.length}경기`)
  if (matches.length === 0) return

  /* ---- 1) 팀당 본클랜원 수 분포 ---- */
  const memberHist = new Map<number, number>()
  for (const m of matches) {
    for (const side of ['red', 'blue']) {
      const rows = m.stats.filter((s) => s.side === side)
      if (rows.length === 0) continue
      const members = rows.filter((s) => s.participantRole === 'member').length
      memberHist.set(members, (memberHist.get(members) ?? 0) + 1)
    }
  }
  const sideTotal = [...memberHist.values()].reduce((a, b) => a + b, 0)
  console.log('팀당 본클랜원 수 분포')
  console.table(
    [...memberHist.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([members, n]) => ({
        '본클랜원 수': members,
        팀수: n,
        비율: `${((n / sideTotal) * 100).toFixed(1)}%`,
      })),
  )

  /* ---- 2) 팀 재편성 탐지 ---- */
  const sideOf = matches.map((m) => {
    const map = new Map<string, string>()
    for (const s of m.stats) map.set(s.playerId, s.side)
    return map
  })

  let compared = 0
  let sharedPairs = 0
  let swapPairs = 0
  const flagged = new Set<string>()
  let start = 0

  for (let i = 0; i < matches.length; i++) {
    const now = matches[i]!.startAt.getTime()
    while (start < i && now - matches[start]!.startAt.getTime() > WINDOW_MIN * 60_000) start++
    for (let j = start; j < i; j++) {
      compared++
      const a = sideOf[j]!
      const b = sideOf[i]!
      const shared: string[] = []
      for (const playerId of b.keys()) if (a.has(playerId)) shared.push(playerId)
      if (shared.length < MIN_SHARED) continue
      sharedPairs++

      /* **색(red/blue)을 비교하면 안 된다.** 선레드·선블루가 경기마다 바뀌므로
         같은 두 클랜이 연달아 붙어도 색은 뒤집힌다.

         대신 "누구와 같은 편이었나" 를 본다 — 겹친 선수를 둘씩 짝지어,
         지난 경기에 같은 편이던 둘이 이번에도 같은 편인지 센다.
         색이 통째로 뒤집혀도 이 값은 변하지 않는다.

         진짜 클랜전   편 구성이 그대로다             → 어긋난 짝 0
         열산          매 판 다시 뽑으므로 섞인다     → 어긋난 짝이 많다 */
      let pairs = 0
      let broken = 0
      for (let x = 0; x < shared.length; x++) {
        for (let y = x + 1; y < shared.length; y++) {
          const p = shared[x]!
          const q = shared[y]!
          pairs++
          if ((a.get(p) === a.get(q)) !== (b.get(p) === b.get(q))) broken++
        }
      }
      if (pairs > 0 && broken / pairs >= 0.2) {
        swapPairs++
        flagged.add(matches[i]!.id)
        flagged.add(matches[j]!.id)
      }
    }
  }

  console.log(
    `가까운 경기 비교 ${compared}쌍 · 선수 ${MIN_SHARED}명 이상 겹침 ${sharedPairs}쌍 · ` +
      `그중 편이 바뀜 ${swapPairs}쌍`,
  )
  console.log(
    `재편성으로 표시된 경기 ${flagged.size} / ${matches.length} ` +
      `(${((flagged.size / matches.length) * 100).toFixed(1)}%)`,
  )
}

async function main(): Promise<void> {
  for (const slug of ['supply', 'sanply', 'daerule']) await analyse(slug)
  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
