import { Rng } from './scripts/rating-simulation/rng.js'
import { makePlayers, makeClans, makeArchetypePlayers } from './scripts/rating-simulation/population.js'
import { scheduleSeason, replay, personalLeaderboard, clanLeaderboard } from './scripts/rating-simulation/season.js'
import { CANDIDATE1_PERSONAL, CANDIDATE1_CLAN, setCompositionParams } from './scripts/rating-simulation/engine.js'
import { CANDIDATE2_DISPLAY } from './scripts/rating-simulation/candidate2.js'
import { skillCorrelation, rankDrivers } from './scripts/rating-simulation/analysis.js'

const bands=[4000,4100,4300,4500,4700,4800,4900,5000]
function run(seed:number,pop:number,clanN:number,cutoff:number|undefined,perf:number,cap:number){
  setCompositionParams({cap,window:20})
  const rng=new Rng(seed)
  const players=[...makePlayers(rng,pop),...makeArchetypePlayers(rng)]
  const clans=makeClans(rng,players,clanN)
  const matches=scheduleSeason(rng,players,clans,90)
  const personal={...CANDIDATE1_PERSONAL,performanceWeight:perf,displayScale:1,winGainCutoff:cutoff}
  const season=replay(matches,personal,CANDIDATE1_CLAN,{mode:'none',floor:3000},90*24*60,true)
  const board=personalLeaderboard(season,players,CANDIDATE2_DISPLAY,90*24*60,true)
  const cboard=clanLeaderboard(season,clans,true,true)
  return {board,cboard,matches:matches.length}
}
console.log('== cutoff 비교 (seed1 pop220) ==')
for (const c of [undefined,0.92,0.90]){
  const {board}=run(1,220,100,c,0.02,50)
  const d=rankDrivers(board)
  console.log('cutoff',String(c??'none').padStart(4),'| 실력상관',skillCorrelation(board).toFixed(3),'| 승률',d.winRate.toFixed(3),'| KD',d.kd.toFixed(3),'| 판수',d.games.toFixed(3),'| 일정승리질',(d as any).winsAboveExpected?.toFixed(3)??'-','| 최고',Math.round(board[0]!.displayed),'|',bands.map(b=>b+':'+board.filter(r=>r.displayed>=b).length).join(' '))
}
console.log('\n== 모집단 안정성 (cutoff 0.90, perf 2%, cap50) ==')
for (const pop of [150,220,500,1000]) for (const seed of [1,2,3]){
  const {board}=run(seed,pop,pop<300?100:150,0.90,0.02,50)
  console.log('pop',String(pop).padStart(4),'seed',seed,'| n',String(board.length).padStart(4),'| 최고',String(Math.round(board[0]!.displayed)).padStart(5),'| 실력상관',skillCorrelation(board).toFixed(3),'|',bands.map(b=>b+':'+board.filter(r=>r.displayed>=b).length).join(' '))
}
