import { PrismaClient } from '../packages/db/generated/client/index.js'
const p = new PrismaClient({ datasources: { db: { url: 'postgresql://sacloud:sacloud@127.0.0.1:5433/sacloud?schema=public' } } })
const rows = await p.clanRoundProfile.findMany({ where: { builderVersion: 'clan-round-v3' } })
const q = (arr) => { const s=[...arr].sort((a,b)=>a-b); const at=(f)=>s[Math.min(s.length-1,Math.floor(f*(s.length-1)))]; return {n:s.length,min:s[0],p10:at(.10),p25:at(.25),med:at(.50),p75:at(.75),p90:at(.90),max:s[s.length-1]} }
for (const k of ['roundsTotal','roundsKnown','defenseRounds','attackRounds','organizedRounds','burstRounds','tempoSpanRounds','tempoGapRounds','outnumberedRounds','cleanSheetMatches','matches','sidedMatches']) {
  console.log(k.padEnd(20), JSON.stringify(q(rows.map(r=>r[k]))))
}
for (const T of [20,40,60,80,100,150,200]) {
  console.log('thr',String(T).padStart(4), 'def',rows.filter(r=>r.defenseRounds>=T).length, 'atk',rows.filter(r=>r.attackRounds>=T).length, 'org',rows.filter(r=>r.organizedRounds>=T).length, 'burst',rows.filter(r=>r.burstRounds>=T).length, 'tempo',rows.filter(r=>r.tempoSpanRounds>=T).length)
}
await p.$disconnect()
