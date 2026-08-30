import { PrismaClient } from '../packages/db/generated/client/index.js'
const p = new PrismaClient({ datasources: { db: { url: 'postgresql://sacloud:sacloud@127.0.0.1:5433/sacloud?schema=public' } } })
const v2 = await p.clanRoundProfile.findMany({ where: { builderVersion: 'clan-round-v2' } })
const v3 = await p.clanRoundProfile.findMany({ where: { builderVersion: 'clan-round-v3' } })
const m3 = new Map(v3.map(r=>[r.leagueClanId,r]))

// overall observed rates on v3
const tot=(rows,a,b)=>[rows.reduce((s,r)=>s+r[a],0), rows.reduce((s,r)=>s+r[b],0)]
for (const [num,den,label] of [['defenseConceded','defenseRounds','블루방어(내준비율)'],['attackWon','attackRounds','어택성공'],['organizedHeld','organizedRounds','조직력'],['plantRounds','attackSideRounds','폭탄설치']]) {
  const [n,d]=tot(v3,num,den); console.log(label, n+'/'+d, (100*n/d).toFixed(1)+'%')
}
console.log('---- v2(얇음) 추정 vs v3(두꺼움) 추정 오차 ----')
// bucket by v2 sample size
const buckets=[[20,39],[40,79],[80,159],[160,1e9]]
for (const [num,den,label] of [['defenseConceded','defenseRounds','블루방어율'],['attackWon','attackRounds','어택성공률'],['organizedHeld','organizedRounds','조직력']]) {
  for (const [lo,hi] of buckets) {
    const errs=[]
    for (const a of v2) {
      const b=m3.get(a.leagueClanId); if(!b) continue
      if (a[den]<lo||a[den]>hi) continue
      if (b[den]<200) continue // v3 기준값이 충분히 두꺼운 것만
      errs.push(Math.abs(a[num]/a[den] - b[num]/b[den]))
    }
    if (!errs.length) { continue }
    errs.sort((x,y)=>x-y)
    const mean=errs.reduce((s,x)=>s+x,0)/errs.length
    const med=errs[Math.floor(errs.length/2)]
    console.log(label.padEnd(8), `v2표본 ${lo}~${hi===1e9?'∞':hi}`.padEnd(16), 'n='+String(errs.length).padStart(3),
      '평균오차 '+(100*mean).toFixed(1)+'%p', '중앙 '+(100*med).toFixed(1)+'%p', '최대 '+(100*errs[errs.length-1]).toFixed(1)+'%p')
  }
  console.log()
}
await p.$disconnect()
