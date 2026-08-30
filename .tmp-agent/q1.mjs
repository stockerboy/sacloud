import { PrismaClient } from '../packages/db/generated/client/index.js'
const p = new PrismaClient({ datasources: { db: { url: 'postgresql://sacloud:sacloud@127.0.0.1:5433/sacloud?schema=public' } } })

const vers = await p.clanRoundProfile.groupBy({ by: ['builderVersion'], _count: { _all: true } })
console.log('versions:', JSON.stringify(vers))

for (const v of vers.map(x => x.builderVersion).sort()) {
  const rows = await p.clanRoundProfile.findMany({ where: { builderVersion: v } })
  const MIN = 20
  const c = {
    profiles: rows.length,
    defense: rows.filter(r => r.defenseRounds >= MIN).length,
    attack: rows.filter(r => r.attackRounds >= MIN).length,
    plant: rows.filter(r => r.attackSideRounds >= MIN).length,
    organized: rows.filter(r => r.organizedRounds >= MIN).length,
    burst: rows.filter(r => r.burstRounds >= MIN).length,
    tempoSpan: rows.filter(r => r.tempoSpanRounds >= MIN && r.tempoSpanMedian !== null).length,
    tempoGap: rows.filter(r => r.tempoGapRounds >= MIN && r.tempoGapMedian !== null).length,
    cleanSheet: rows.filter(r => r.cleanSheetMatches >= 5).length,
    outnumbered: rows.filter(r => r.outnumberedRounds >= MIN).length,
    sumMatches: rows.reduce((a,r)=>a+r.matches,0),
    sumSided: rows.reduce((a,r)=>a+r.sidedMatches,0),
    sumRoundsTotal: rows.reduce((a,r)=>a+r.roundsTotal,0),
    sumRoundsKnown: rows.reduce((a,r)=>a+r.roundsKnown,0),
  }
  console.log(v, JSON.stringify(c))
}
await p.$disconnect()
