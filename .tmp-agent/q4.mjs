import { PrismaClient } from '../packages/db/generated/client/index.js'
const p = new PrismaClient({ datasources: { db: { url: 'postgresql://sacloud:sacloud@127.0.0.1:5433/sacloud?schema=public' } } })
const v3 = await p.clanRoundProfile.findMany({ where: { builderVersion: 'clan-round-v3' } })
const sd=(a)=>{const m=a.reduce((s,x)=>s+x,0)/a.length;return Math.sqrt(a.reduce((s,x)=>s+(x-m)*(x-m),0)/(a.length-1))}
console.log('축        신호SD(클랜간)  |  표본n별 잡음SD 와 신뢰도 rel=s2/(s2+n2)')
for (const [num,den,label] of [['defenseConceded','defenseRounds','블루방어율'],['attackWon','attackRounds','어택성공률'],['organizedHeld','organizedRounds','조직력'],['bursts','burstRounds','폭발력'],['plantRounds','attackSideRounds','폭탄설치'],['outnumberedWon','outnumberedRounds','소수싸움']]) {
  const thick=v3.filter(r=>r[den]>=200)
  if(thick.length<8){console.log(label,'두꺼운 클랜',thick.length,'— 생략');continue}
  const rates=thick.map(r=>r[num]/r[den])
  const pbar=thick.reduce((s,r)=>s+r[num],0)/thick.reduce((s,r)=>s+r[den],0)
  // 관측 SD 에서 잔여 잡음을 뺀 참 신호 SD
  const meanN=thick.reduce((s,r)=>s+r[den],0)/thick.length
  const obs=sd(rates), noiseAtMean=Math.sqrt(pbar*(1-pbar)/meanN)
  const sig=Math.sqrt(Math.max(0,obs*obs-noiseAtMean*noiseAtMean))
  const parts=[20,40,60,100,150].map(n=>{const nz=Math.sqrt(pbar*(1-pbar)/n);return `n=${n}:rel=${(sig*sig/(sig*sig+nz*nz)).toFixed(2)}`})
  console.log(label.padEnd(7),'p='+pbar.toFixed(3),'신호SD='+sig.toFixed(4),'(두꺼운클랜 '+thick.length+'팀)', parts.join(' '))
}
await p.$disconnect()
