import { Rng } from './scripts/rating-simulation/rng.js'
import { makePlayers, makeClans, makeArchetypePlayers } from './scripts/rating-simulation/population.js'
import { scheduleSeason, replay, personalLeaderboard } from './scripts/rating-simulation/season.js'
import { CANDIDATE1_PERSONAL, CANDIDATE1_CLAN, setCompositionParams } from './scripts/rating-simulation/engine.js'
import { CANDIDATE2_DISPLAY } from './scripts/rating-simulation/candidate2.js'
import { skillCorrelation } from './scripts/rating-simulation/analysis.js'
import { runSchedule, type ScheduleProfile } from './scripts/rating-simulation/final.js'
const mk=(g:number,w:number,a:number,b:number):ScheduleProfile=>({label:'',games:g,winRate:w,opponentMin:a,opponentMax:b,performance:0,note:''})
const LAB: [string,number,number,number,number][] = [
  ['양학98%600판',600,0.98,3000,3200],['양학100%600판',600,1.0,3000,3200],['양학95%300판',300,0.95,3000,3200],
  ['정직최상위60%',300,0.6,3400,3600],['정직최상위70%',300,0.7,3400,3600],['OUTLIER',700,0.82,3350,3650],
]
function seasonGaps(seed:number,pop:number,clanN:number,cutoff:number){
  setCompositionParams({cap:50,window:20})
  const rng=new Rng(seed)
  const players=[...makePlayers(rng,pop),...makeArchetypePlayers(rng)]
  const clans=makeClans(rng,players,clanN)
  const matches=scheduleSeason(rng,players,clans,90)
  const personal={...CANDIDATE1_PERSONAL,performanceWeight:0.02,displayScale:1,winGainCutoff:cutoff}
  const season=replay(matches,personal,CANDIDATE1_CLAN,{mode:'none',floor:3000},90*24*60,true)
  const board=personalLeaderboard(season,players,CANDIDATE2_DISPLAY,90*24*60,true)
  return {gaps:board.map(r=>(r.internal-3000)*r.confidence),corr:skillCorrelation(board)}
}
const out:any={}
for (const cutoff of [0.88,0.90,0.92]){
  const seasons:number[][]=[]; let corrs:number[]=[]
  for (const pop of [150,220,500]) for (const seed of [1,2,3]){
    const g=seasonGaps(seed,pop,pop<300?100:140,cutoff); seasons.push(g.gaps); corrs.push(g.corr)
  }
  const lab=LAB.map(([l,g,w,a,b])=>{
    const p={...CANDIDATE1_PERSONAL,performanceWeight:0.02,displayScale:1,winGainCutoff:cutoff}
    return [l, runSchedule(mk(g,w,a,b),p,1,30).internal-3000] as [string,number]
  })
  out[cutoff]={seasons,lab,corr:corrs.reduce((a,b)=>a+b,0)/corrs.length}
  console.log('cutoff',cutoff,'평균실력상관',out[cutoff].corr.toFixed(3))
  console.log('  lab gap:',lab.map(([l,v])=>l+'='+Math.round(v)).join(' '))
  console.log('  시즌 최고 gap:',seasons.map(s=>Math.round(s[0]!)).join(' '))
}
console.log('\n===== 배율 스윕 =====')
for (const cutoff of [0.88,0.90,0.92]) for (const scale of [3.3,3.5,3.6,3.8,4.0]){
  const {seasons,lab}=out[cutoff]
  const d=(g:number)=>3000+g*scale
  const counts=(t:number)=>seasons.map((s:number[])=>s.filter(g=>d(g)>=t).length)
  const n=(t:number)=>counts(t).filter((c:number)=>c>0).length
  const labs=Object.fromEntries(lab.map(([l,g]:[string,number])=>[l,Math.round(d(g))]))
  console.log('cut',cutoff,'scale',scale,
    '| 시즌최고',Math.round(Math.max(...seasons.map((s:number[])=>d(s[0]!)))),
    '| 4800+시즌',n(4800)+'/9','4900+',n(4900)+'/9','5000+',n(5000)+'/9',
    '| 양학100%',labs['양학100%600판'],'양학98%',labs['양학98%600판'],'정직70%',labs['정직최상위70%'],'OUT',labs['OUTLIER'])
}
