import { Rng } from './scripts/rating-simulation/rng.js'
import { makePlayers, makeClans, makeArchetypePlayers } from './scripts/rating-simulation/population.js'
import { scheduleSeason, replay, personalLeaderboard, clanLeaderboard } from './scripts/rating-simulation/season.js'
import { CANDIDATE1_PERSONAL, CANDIDATE1_CLAN, setCompositionParams } from './scripts/rating-simulation/engine.js'
import { CANDIDATE2_DISPLAY } from './scripts/rating-simulation/candidate2.js'
import { skillCorrelation, rankDrivers, roleBias } from './scripts/rating-simulation/analysis.js'
const bands=[4000,4100,4300,4500,4700,4800,4900,5000]
function run(seed:number,pop:number,clanN:number,cutoff:number|undefined,perf:number,cap:number){
  setCompositionParams({cap,window:20})
  const rng=new Rng(seed)
  const players=[...makePlayers(rng,pop),...makeArchetypePlayers(rng)]
  const clans=makeClans(rng,players,clanN)
  const matches=scheduleSeason(rng,players,clans,90)
  const personal={...CANDIDATE1_PERSONAL,performanceWeight:perf,displayScale:1,winGainCutoff:cutoff}
  const season=replay(matches,personal,CANDIDATE1_CLAN,{mode:'none',floor:3000},90*24*60,true)
  return {board:personalLeaderboard(season,players,CANDIDATE2_DISPLAY,90*24*60,true),
          cboard:clanLeaderboard(season,clans,true,true),players,clans}
}
console.log('===== 1. 모집단 안정성 (cutoff .90 perf2% cap50) =====')
for (const pop of [150,220,500]) for (const seed of [1,2,3]){
  const {board}=run(seed,pop,pop<300?100:140,0.90,0.02,50)
  console.log('pop',String(pop).padStart(4),'seed',seed,'| n',String(board.length).padStart(4),'| 최고',String(Math.round(board[0]!.displayed)).padStart(5),'| 상관',skillCorrelation(board).toFixed(3),'|',bands.map(b=>b+':'+board.filter(r=>r.displayed>=b).length).join(' '))
}
console.log('\n===== 2. 퍼포먼스 0 / 2 / 5% (seed1 pop220) =====')
for (const perf of [0,0.02,0.05]){
  const {board}=run(1,220,100,0.90,perf,50)
  const d=rankDrivers(board); const rb=roleBias(board)
  console.log('perf',String(perf*100).padStart(3)+'%','| 상관',skillCorrelation(board).toFixed(4),'| 승률',d.winRate.toFixed(3),'| KD',d.kd.toFixed(3),'| MVP',d.mvp.toFixed(3),'| 역할편향',rb.map(r=>r.role[0]+':'+Math.round(r.avgDisplayed)).join(' '))
}
console.log('\n===== 3. 구성 상한 30/50/70/100 (seed1 pop220) =====')
for (const cap of [30,50,70,100]){
  const {cboard,clans}=run(1,220,100,0.90,0.02,cap)
  const byLatent=[...cboard].sort((a,b)=>b.latentStrength-a.latentStrength)
  const rank=new Map(cboard.map(r=>[r.clanId,r.rank]))
  const n=cboard.length
  let d=0; for(let i=0;i<n;i++){const r=rank.get(byLatent[i]!.clanId)!; d+=(r-(i+1))**2}
  const rho=1-(6*d)/(n*(n*n-1))
  const flipped=cboard.filter(r=>r.compositionScore>0&&Math.abs(r.rating-cboard[Math.max(0,r.rank-2)]!.rating)<r.compositionScore).length
  console.log('cap',String(cap).padStart(4),'| 클랜상관',rho.toFixed(3),'| 1위',cboard[0]!.name,Math.round(cboard[0]!.finalScore),'구성',Math.round(cboard[0]!.compositionScore),'| 구성이순위뒤집은수',flipped)
}
