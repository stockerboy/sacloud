/**
 * ★한 선수의 경기를 병영수첩에서 직접 긁는다★ (2026-09-17 사장님).
 *
 * > «긁어서 해 따로 ㅇㅇ근데 저거 IPL VS IPL임 5경기 다»
 *
 * 우리 파이프는 ★리그 클랜전만★ 모은다 — 용병매치는 리그·클랜을 못 붙여 안 담는다.
 * 그래서 이 스크립트는 ★DB 에 한 줄도 안 쓴다.★ 파일로만 뱉는다.
 *
 * ⚠ 병영수첩은 서버에서 그냥 부르면 ★403★ 이다 (AWS WAF). 그래서 수집 잡과 ★같은 길★ 로 간다 —
 *   `callBarracks` 가 `SACLOUD_FETCH=chrome` 이면 크롬 안에서 부른다.
 *
 * 쓰는 법:  pnpm --filter @sacloud/worker exec tsx src/scrapeMercenary.ts <닉> <몇경기> <나갈파일>
 */
import { writeFileSync } from 'node:fs'
import { barracksBrowser, closeBarracksBrowser, useChromeFetch } from './nexon/browserFetch'

const NICK = process.argv[2] ?? '현물'
const TAKE = Number(process.argv[3] ?? 5)
const OUT = process.argv[4] ?? '/root/scraped.json'

async function call(method: 'GET' | 'POST', path: string, body: string | null) {
  if (!useChromeFetch()) throw new Error('SACLOUD_FETCH=chrome 이 아니면 403 이다')
  return barracksBrowser().call(method, path, body)
}

/**
 * ★닉 → `str_usn`★. 병영수첩의 통합검색이 준다 (2026-09-18 실측).
 *
 * ```
 * POST /api/Search/GetSearchAll/<encodeURIComponent(닉)>/1
 *   → { result: { characterInfo: [{ user_nexon_sn, str_usn, user_nick }], clanInfo: [...] } }
 * ```
 *
 * ⚠ `GetSearchUserAll` · `GetSearchUser` 는 ★404★ 다. 클랜 전용(`GetSearchClanAll`)과 달리
 *   사람 전용 길은 없고 ★통합검색 하나★ 뿐이다.
 * ⚠ ★같은 닉이 여럿 온다.★ 위장닉이 섞이므로 ★정확히 일치하는 첫 줄★ 만 쓴다.
 */
async function usnOf(nick: string): Promise<string> {
  const r = await call('POST', `/api/Search/GetSearchAll/${encodeURIComponent(nick)}/1`, '{}')
  if (r.status !== 200) throw new Error(`검색 HTTP ${r.status}`)
  const body = JSON.parse(r.body) as {
    result?: { characterInfo?: { user_nexon_sn: number; str_usn: string; user_nick: string }[] }
  }
  const hits = body.result?.characterInfo ?? []
  const hit = hits.find((h) => h.user_nick === nick)
  if (!hit) throw new Error(`${nick} 을 못 찾았다 (검색결과 ${hits.length}건)`)
  console.log(`  ${nick} → ${hit.str_usn} (nexon_sn ${hit.user_nexon_sn}) · 동명 ${hits.length}건`)
  return hit.str_usn
}

const usn = await usnOf(NICK)
console.log(`${NICK} usn 확인 (길이 ${usn.length})`)

/* ── ① 사람 경기 목록. `mode_flag:"ALL"` · 빈 문자열을 보내면 -999 다 */
const listRes = await call('POST', '/api/Match/GetMatchList/', JSON.stringify({ user_nexon_sn: usn, mode_flag: 'ALL' }))
console.log(`목록 HTTP ${listRes.status} · ${listRes.body.length}바이트`)
const list = JSON.parse(listRes.body) as {
  rtnCode?: number
  message?: string
  result?: Record<string, unknown>[]
}
const matches = list.result ?? []
console.log(`rtnCode ${list.rtnCode} · ${matches.length}경기`)
for (const m of matches.slice(0, 12)) {
  console.log(`  ${m.match_key}  ${m.match_type}  ${m.match_name}  ${m.map_name}  ${m.match_time_date}`)
}

/* ── ② 경기마다 배틀로그. ★클랜 단위★ 가 열 명을 다 담는다 — 선수 단위는 본인 것만 온다 */
const picked = matches.slice(0, TAKE)
const out: Record<string, unknown>[] = []
for (const m of picked) {
  const key = String(m.match_key)
  const clanNo = String(m.clan_no ?? m.clan_id ?? m.my_clan_no ?? '')
  const rec: Record<string, unknown> = { head: m }
  /* 클랜 단위를 먼저 시도한다. 용병매치에 클랜 번호가 없으면 선수 단위로 떨어진다 */
  if (clanNo !== '' && clanNo !== 'undefined') {
    const r = await call('POST', `/api/BattleLog/GetBattleLogClan/${key}/${clanNo}`, '{}')
    rec.clanLog = { status: r.status, body: r.body }
    console.log(`  ${key} 클랜로그 HTTP ${r.status} · ${r.body.length}바이트`)
  }
  const p = await call('POST', `/api/BattleLog/GetBattleLog/${key}/${usn}`, '{}')
  rec.playerLog = { status: p.status, body: p.body }
  console.log(`  ${key} 선수로그 HTTP ${p.status} · ${p.body.length}바이트`)
  out.push(rec)
}

writeFileSync(OUT, JSON.stringify({ nick: NICK, usn, matches: out }, null, 1), 'utf-8')
console.log(`saved ${OUT} · ${out.length}경기`)
closeBarracksBrowser()
