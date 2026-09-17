/** 병영수첩에서 ★닉 → str_usn★ 을 어떻게 찾나. 이름을 모르니 몇 개를 찔러 본다 */
import { barracksBrowser, closeBarracksBrowser, useChromeFetch } from './nexon/browserFetch'
const NICK = process.argv[2] ?? '현물'
const enc = encodeURIComponent(NICK)
const paths: [string, string, string | null][] = [
  ['POST', `/api/Search/GetSearchUserAll/${enc}/1`, '{}'],
  ['POST', `/api/Search/GetSearchUser/${enc}/1`, '{}'],
  ['POST', `/api/Search/GetSearchAll/${enc}/1`, '{}'],
  ['POST', `/api/Search/GetSearchClanAll/${enc}/1`, '{}'],
  ['POST', '/api/Search/GetSearchUser/', JSON.stringify({ user_nick: NICK, page: '1' })],
]
if (!useChromeFetch()) throw new Error('chrome 아님')
for (const [m, p, b] of paths) {
  try {
    const r = await barracksBrowser().call(m as 'POST', p, b)
    console.log(`${r.status}  ${p}  ${r.body.length}바이트  ${r.body.slice(0, 260).replace(/\s+/g, ' ')}`)
  } catch (e) {
    console.log(`실패  ${p}  ${String((e as Error).message).slice(0, 80)}`)
  }
}
closeBarracksBrowser()
