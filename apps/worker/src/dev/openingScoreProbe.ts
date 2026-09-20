/**
 * ★선짤 점수를 실제 경기로 재 본다★ (2026-09-20 사장님 규칙)
 *
 * ```
 * pnpm --filter @sacloud/worker exec tsx src/dev/openingScoreProbe.ts [경기수]
 * ```
 *
 * ── 왜 먼저 재나
 *   규칙을 바로 점수에 넣으면 ★순위가 뒤집힌 뒤에야★ 이상한 걸 안다.
 *   그래서 ① 몇 판이나 판정되나 ② 점수가 얼마나 움직이나 ③ 누가 제일 많이 깎이나
 *   를 먼저 본다. ★숫자를 보고 넣는다.★
 *
 * 아무것도 저장하지 않는다 — 읽기만 한다.
 */
import { prisma } from '@sacloud/db'
import {
  clanByTeamNo,
  openingPointsOf,
  openingTalliesOf,
  roundResultsOf,
  roundSidesOf,
  rosterOf,
  type OpeningEvent,
  type OpeningTally,
  type RoundSideEvent,
} from '@sacloud/nexon'

const LIMIT = Number(process.argv[2] ?? '2000')

interface RawShape {
  battleLog?: OpeningEvent[]
  teamList?: { team_no?: number | string | null; clan_no?: number | string | null }[]
}

/** 원문은 `{ raw: {...} }` 로 감싼 것과 그대로 저장한 것이 섞여 있다 */
const rawOf = (payload: unknown): RawShape => {
  if (typeof payload !== 'object' || payload === null) return {}
  const holder = payload as { raw?: unknown }
  const raw = typeof holder.raw === 'object' && holder.raw !== null ? holder.raw : payload
  return raw as RawShape
}

/*
 * ⚠ ★원문은 한 줄이 수 MB 다★ — 한 번에 읽으면 연결이 끊긴다
 *   (실측: 3,000건에서 `P1017 Server has closed the connection`).
 *   `matchFirstSideBuild` 와 같은 규칙으로 ★가벼운 목록을 먼저, payload 는 나눠★ 읽는다.
 */
const PAYLOAD_CHUNK = 100

const index = await prisma.barracksBattleLogRaw.findMany({
  where: { subjectKind: 'clan', status: 'ok' },
  select: { id: true },
  take: LIMIT,
})

async function* payloads() {
  for (let i = 0; i < index.length; i += PAYLOAD_CHUNK) {
    const part = await prisma.barracksBattleLogRaw.findMany({
      where: { id: { in: index.slice(i, i + PAYLOAD_CHUNK).map((r) => r.id) } },
      select: { matchKey: true, subject: true, payload: true },
    })
    for (const row of part) yield row
  }
}

let matches = 0
let judged = 0
let noSide = 0
let notFull = 0

const totals: OpeningTally = {
  redOpeningKills: 0,
  redOpeningDeaths: 0,
  redOpeningDeathsRevenged: 0,
  blueSniperKills: 0,
  blueSniperDeaths: 0,
  blueRifleDeaths: 0,
}
/** usn → 누적 점수 */
const pointsOf = new Map<string, number>()
/** usn → 블루에서 선짤당한 수 (사장님: 「블루때 선짤 3번 이상 당한 사람」) */
const blueDeathsOf = new Map<string, number>()

for await (const row of payloads()) {
  const raw = rawOf(row.payload)
  const events = raw.battleLog ?? []
  if (events.length === 0) continue
  matches += 1

  const roster = rosterOf(events as RoundSideEvent[])
  if (roster.teams.length !== 2) {
    notFull += 1
    continue
  }
  const teamNo = clanByTeamNo(raw.teamList ?? [])
    .entries()
    .next().value?.[0]
  const mine = typeof teamNo === 'string' ? teamNo : roster.teams[0]!
  const other = roster.teams.find((t) => t !== mine) ?? null
  if (other === null) {
    notFull += 1
    continue
  }

  const rounds = new Set<number>()
  for (const e of events) {
    const n = Number(String(e.round ?? '').trim())
    if (Number.isInteger(n) && n >= 1) rounds.add(n)
  }
  if (rounds.size === 0) continue

  const results = roundResultsOf(events as RoundSideEvent[])
  const sides = roundSidesOf(events as RoundSideEvent[], mine, Math.max(...rounds), (round) => {
    const v = results.get(round)
    return v === undefined ? null : v
  })
  if (sides.side.size === 0) {
    noSide += 1
    continue
  }
  judged += 1

  const tallies = openingTalliesOf({
    events,
    sideOf: (round, team) => {
      const side = sides.side.get(round)
      if (side === undefined) return null
      /* `sides` 는 `mine` 기준이다 — 상대 팀이면 뒤집는다 */
      if (team === mine) return side
      if (team === other) return side === 'attack' ? 'defense' : 'attack'
      return null
    },
  })

  for (const [usn, t] of tallies) {
    totals.redOpeningKills += t.redOpeningKills
    totals.redOpeningDeaths += t.redOpeningDeaths
    totals.redOpeningDeathsRevenged += t.redOpeningDeathsRevenged
    totals.blueSniperKills += t.blueSniperKills
    totals.blueSniperDeaths += t.blueSniperDeaths
    totals.blueRifleDeaths += t.blueRifleDeaths
    pointsOf.set(usn, (pointsOf.get(usn) ?? 0) + openingPointsOf(t))
    const blue = t.blueSniperDeaths + t.blueRifleDeaths
    if (blue > 0) blueDeathsOf.set(usn, (blueDeathsOf.get(usn) ?? 0) + blue)
  }
}

const people = [...pointsOf.entries()]
people.sort((a, b) => a[1] - b[1])

console.info('')
console.info('★선짤 점수 실측★')
console.info('─'.repeat(52))
console.info(`원문 ${index.length}건 · 경기 ${matches}건`)
console.info(`  진영을 알아 판정한 경기  ${judged}건 (${Math.round((judged / Math.max(matches, 1)) * 100)}%)`)
console.info(`  진영을 몰라 건너뛴 경기  ${noSide}건`)
console.info(`  팀이 둘이 아닌 경기      ${notFull}건`)
console.info('')
console.info('집계 (사람 × 라운드 합)')
console.info(`  레드 선짤 성공(+1)        ${totals.redOpeningKills}`)
console.info(`  레드 선짤당함(-1)         ${totals.redOpeningDeaths}`)
console.info(`  └ 되잡아 면제된 것        ${totals.redOpeningDeathsRevenged}`)
console.info(`  블루 상대스나 선짤(+1)    ${totals.blueSniperKills}`)
console.info(`  블루 스나 첫사망(-2)      ${totals.blueSniperDeaths}`)
console.info(`  블루 라플 첫사망(-1)      ${totals.blueRifleDeaths}`)
console.info('')
console.info(`점수를 받은 사람 ${people.length}명`)
if (people.length > 0) {
  const sum = people.reduce((s, [, p]) => s + p, 0)
  console.info(`  합계 ${sum} · 평균 ${(sum / people.length).toFixed(2)}`)
  console.info(`  가장 많이 깎인 5명: ${people.slice(0, 5).map(([, p]) => p).join(' ')}`)
  console.info(`  가장 많이 받은 5명: ${people.slice(-5).map(([, p]) => p).reverse().join(' ')}`)
}

const heavy = [...blueDeathsOf.entries()].filter(([, n]) => n >= 3)
heavy.sort((a, b) => b[1] - a[1])
console.info('')
console.info(`★블루에서 선짤 3번 이상 당한 사람★ ${heavy.length}명`)
console.info(`  가장 많이 준 5명: ${heavy.slice(0, 5).map(([, n]) => n + '번').join(' · ')}`)

await prisma.$disconnect()
