/** 용병매치에 ★클랜 단위 로그★ 가 있나. clan_no 가 null 이라 몇 값을 찔러 본다 */
import { barracksBrowser, closeBarracksBrowser } from './nexon/browserFetch'
const KEY = process.argv[2] ?? '260907211107124001'
const cands = ['0', '', '124001', 'null', '1']
for (const c of cands) {
  const r = await barracksBrowser().call('POST', `/api/BattleLog/GetBattleLogClan/${KEY}/${c}`, '{}')
  console.log(`clanNo="${c}"  HTTP ${r.status}  ${r.body.length}바이트  ${r.body.slice(0, 200).replace(/\s+/g, ' ')}`)
}
closeBarracksBrowser()
