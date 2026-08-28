/**
 * 열산(픽업) 탐지 2차 — **한 세션 안에서 편을 넘나든 선수**로 잡는다. 읽기만 한다.
 *
 * ── 1차가 왜 약했나
 *
 * "가까운 경기끼리 팀 구성이 바뀌었나" 로 봤더니 **용병 교란**에 걸렸다.
 * 용병은 날마다 다른 클랜으로 가므로 편이 바뀌는 게 당연하다.
 *
 * ── 2차의 자국
 *
 * 세션 = **같은 두 클랜**이 짧은 간격으로 연달아 치른 경기 묶음.
 *
 * ```
 * 진짜 클랜전   용병으로 불려 왔어도 그 세션 내내 한쪽 편이다
 * 열산          매 판 가위바위보로 다시 뽑으므로 같은 사람이 양쪽에 다 나온다
 * ```
 *
 * 그래서 **한 세션 안에서 두 클랜 모두를 위해 뛴 선수 수**를 센다.
 * 이 값은 진짜 클랜전에서는 0 이어야 한다.
 *
 * 열산리그(`sanply`)가 정답지다 — 거기서 많이 울리고 공식리그에서 조용해야 쓸 수 있다.
 */
import { prisma } from '@sacloud/db'

const MIRROR_ORIGIN = '3rd.supply'
const FROM = new Date('2026-01-01T00:00:00.000Z')
const TO = new Date('2026-07-01T00:00:00.000Z')
/** 같은 세션으로 묶는 최대 간격 (분) */
const SESSION_GAP_MIN = 60

interface Row {
  id: string
  startAt: Date
  redLeagueClanId: string
  blueLeagueClanId: string
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
      redLeagueClanId: true,
      blueLeagueClanId: true,
      stats: { select: { playerId: true, side: true, participantRole: true } },
    },
  })) as Row[]

  console.log(`\n=== ${slug} (${league.name}) — ${matches.length}경기`)
  if (matches.length === 0) return

  /* ---- 세션으로 묶는다 (같은 두 클랜 · 60분 이내) ---- */
  interface Session {
    key: string
    matches: Row[]
    lastAt: number
  }
  const open = new Map<string, Session>()
  const sessions: Session[] = []
  for (const m of matches) {
    const key = [m.redLeagueClanId, m.blueLeagueClanId].sort().join('|')
    const at = m.startAt.getTime()
    const current = open.get(key)
    if (current && at - current.lastAt <= SESSION_GAP_MIN * 60_000) {
      current.matches.push(m)
      current.lastAt = at
    } else {
      const created: Session = { key, matches: [m], lastAt: at }
      open.set(key, created)
      sessions.push(created)
    }
  }

  const multi = sessions.filter((s) => s.matches.length >= 2)
  let flaggedMatches = 0
  let flaggedSessions = 0
  const crossHist = new Map<number, number>()

  for (const session of multi) {
    const clansOf = new Map<string, Set<string>>()
    for (const m of session.matches) {
      for (const s of m.stats) {
        const clanId = s.side === 'red' ? m.redLeagueClanId : m.blueLeagueClanId
        const set = clansOf.get(s.playerId) ?? new Set<string>()
        set.add(clanId)
        clansOf.set(s.playerId, set)
      }
    }
    const crossed = [...clansOf.values()].filter((set) => set.size >= 2).length
    crossHist.set(crossed, (crossHist.get(crossed) ?? 0) + 1)
    if (crossed >= 2) {
      flaggedSessions++
      flaggedMatches += session.matches.length
    }
  }

  const inMulti = multi.reduce((sum, s) => sum + s.matches.length, 0)
  console.log(
    `세션 ${sessions.length} · 2경기 이상 세션 ${multi.length} (그 안의 경기 ${inMulti})`,
  )
  console.log('세션당 "양쪽 다 뛴 선수" 수 분포')
  console.table(
    [...crossHist.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([crossed, n]) => ({
        '양쪽 다 뛴 선수': crossed,
        세션: n,
        비율: `${((n / Math.max(1, multi.length)) * 100).toFixed(1)}%`,
      })),
  )
  console.log(
    `2명 이상 넘나든 세션 ${flaggedSessions}/${multi.length} · ` +
      `그 세션의 경기 ${flaggedMatches}/${matches.length} ` +
      `(전체의 ${((flaggedMatches / matches.length) * 100).toFixed(1)}%)`,
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
