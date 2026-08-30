import { prisma } from '@sacloud/db'
import { clanRoundTallyOf, clanByTeamNo, roundResultsOf, tempoOf, type ClanRoundEvent } from '@sacloud/nexon'
import { SEASON0_FROM, SEASON0_ORIGINS, SEASON0_TO } from '../lib/season0Window.js'

const TEAM_SIZE = 5

interface Raw { battleLog?: ClanRoundEvent[]; teamList?: { team_no?: string | null; clan_no?: string | null }[] }
const rawOf = (payload: unknown): Raw => {
  if (typeof payload !== 'object' || payload === null) return {}
  const holder = payload as { raw?: unknown }
  return (typeof holder.raw === 'object' && holder.raw !== null ? holder.raw : payload) as Raw
}

async function main() {
  const rows = await prisma.barracksBattleLogRaw.findMany({
    where: { subjectKind: 'clan', status: 'ok' },
    select: { matchKey: true, subject: true, payload: true },
  })
  const links = new Map<string, string>()
  for (const l of await prisma.barracksClanNumber.findMany({ select: { clanNo: true, clanId: true } })) links.set(l.clanNo, l.clanId)

  const keys = [...new Set(rows.map((r) => r.matchKey))]
  const matches = await prisma.match.findMany({
    where: {
      AND: [
        { OR: [{ redRatingUpdate: { not: null } }, { origin: { in: [...SEASON0_ORIGINS] } }] },
        { startAt: { gte: SEASON0_FROM, ...(SEASON0_TO ? { lt: SEASON0_TO } : {}) } },
        { sourceMatchId: { in: keys } },
      ],
    },
    select: {
      id: true, sourceMatchId: true, leagueId: true,
      redLeagueClanId: true, blueLeagueClanId: true,
      redClan: { select: { clanId: true } }, blueClan: { select: { clanId: true } },
    },
  })
  const byKey = new Map<string, typeof matches>()
  for (const m of matches) {
    if (!m.sourceMatchId) continue
    const list = byKey.get(m.sourceMatchId)
    if (list) list.push(m); else byKey.set(m.sourceMatchId, [m])
  }

  let seen = 0, noLink = 0, noMatch = 0, noTeamNo = 0, tallied = 0, withSwitch = 0, conflict = 0
  let roundsTotal = 0, roundsKnown = 0
  let defR = 0, defC = 0, atkR = 0, atkW = 0, atkSide = 0, plant = 0
  let orgR = 0, orgH = 0, burstR = 0, bursts = 0
  const spans: number[] = []; const gaps: number[] = []
  let csDen = 0, csNum = 0
  let resultKnownRounds = 0

  for (const row of rows) {
    seen += 1
    const clanId = links.get(row.subject)
    if (!clanId) { noLink += 1; continue }
    const group = byKey.get(row.matchKey)
    if (!group) { noMatch += 1; continue }
    const raw = rawOf(row.payload)
    const events = raw.battleLog ?? []
    if (events.length === 0) continue
    const teamOfClan = clanByTeamNo(raw.teamList ?? [])
    const teamNo = [...teamOfClan.entries()].find(([, c]) => c === row.subject)?.[0]
    if (teamNo === undefined) { noTeamNo += 1; continue }

    const results = roundResultsOf(events as never)
    for (const [, v] of results) if (v !== null) resultKnownRounds += 1

    const tally = clanRoundTallyOf({
      events, teamNo, teamSize: TEAM_SIZE,
      wonRound: (r) => results.get(r) ?? null,
    })
    if (!tally) continue
    tallied += 1
    if (tally.sideConflict) conflict += 1
    roundsTotal += tally.rounds
    roundsKnown += tally.sidedRounds
    if (tally.switchRound === null) continue
    withSwitch += 1
    defR += tally.defenseRounds; defC += tally.defenseConceded
    atkR += tally.attackRounds; atkW += tally.attackWon
    atkSide += tally.attackSideRounds; plant += tally.plantRounds
    orgR += tally.organizedRounds; orgH += tally.organizedHeld
    burstR += tally.burstRounds; bursts += tally.bursts
    spans.push(...tally.roundSpans); gaps.push(...tally.roundGaps)

    // clean sheet — 반코트
    const sw = tally.switchRound
    const halves = [[1, sw - 1], [sw, sw + 4]] as const
    let countable = false, swept = false
    for (const [from, to] of halves) {
      if (to - from + 1 !== 5) continue
      let known = 0, won = 0
      for (let r = from; r <= to; r += 1) {
        const v = results.get(r)
        if (v === undefined || v === null) continue
        known += 1
        if (v) won += 1
      }
      if (known !== 5) continue
      countable = true
      if (won === 5) swept = true
    }
    if (countable) { csDen += 1; if (swept) csNum += 1 }
  }

  console.log({ seen, noLink, noMatch, noTeamNo, tallied, withSwitch, conflict })
  console.log({ roundsTotal, roundsKnown, knownPct: (roundsKnown / roundsTotal * 100).toFixed(1), resultKnownRounds })
  console.log('블루방어 per5:', defR ? (defC / defR * 5).toFixed(2) : null, { defR, defC })
  console.log('어택성공 per5:', atkR ? (atkW / atkR * 5).toFixed(2) : null, { atkR, atkW })
  console.log('설치 per5:', atkSide ? (plant / atkSide * 5).toFixed(2) : null, { atkSide, plant })
  console.log('조직력:', { orgR, orgH, rate: orgR ? (orgH / orgR * 100).toFixed(1) : null })
  console.log('폭발력:', { burstR, bursts, perRound: burstR ? (bursts / burstR).toFixed(3) : null })
  console.log('템포 spans:', tempoOf(spans), 'gaps:', tempoOf(gaps))
  console.log('클린시트:', { csDen, csNum, pct: csDen ? (csNum / csDen * 100).toFixed(1) : null })
  await prisma.$disconnect()
}
void main()
