/**
 * ★한 선수의 배틀로그를 병영수첩에서 직접 긁는다★ (2026-09-17 사장님).
 *
 * > «긁어서 해 따로 ㅇㅇ근데 저거 IPL VS IPL임 5경기 다»
 *
 * 우리 파이프는 ★리그 클랜전만★ 모은다. 용병매치는 리그·클랜을 못 붙여 안 담는다.
 * 그래서 이 스크립트는 ★사이트에 아무것도 안 쓴다★ — 파일로만 뱉는다.
 *
 * ⚠ API 키는 `NEXON_API_KEY` 환경변수에서만 읽고 ★어디에도 안 찍는다★ (`CLAUDE.md` 2장 6번).
 *
 * 쓰는 법:  node scrape.mjs <닉네임> <몇 경기> <나갈파일.json>
 */
import { writeFileSync } from 'node:fs'

const NICK = process.argv[2] ?? '현물'
const TAKE = Number(process.argv[3] ?? 5)
const OUT = process.argv[4] ?? '/root/scraped.json'

const KEY = process.env.NEXON_API_KEY?.trim()
if (!KEY) { console.error('NEXON_API_KEY 가 없다'); process.exit(1) }
const BASE = 'https://open.api.nexon.com'

let calls = 0
async function get(path, params) {
  const url = new URL(BASE + path)
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, String(v))
  /* 초당 요청을 스스로 묶는다 — 429 를 맞으면 그때부터 느려진다 */
  if (calls > 0) await new Promise((r) => setTimeout(r, 120))
  calls += 1
  const res = await fetch(url, { headers: { 'x-nxopen-api-key': KEY } })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`${path} ${res.status} ${body.slice(0, 200)}`)
  }
  return res.json()
}

const { ouid } = await get('/suddenattack/v1/id', { user_name: NICK })
console.log(`${NICK} ouid 확인`)

/* 제3보급창고는 ★폭파미션★ 이다. 모드는 필수 인자다 */
const list = await get('/suddenattack/v1/match', { ouid, match_mode: '폭파미션' })
const ids = list.match ?? list.match_list ?? []
console.log(`매치 목록 ${ids.length}건`)

const out = []
for (const id of ids.slice(0, TAKE)) {
  const matchId = typeof id === 'string' ? id : (id.match_id ?? id.matchId)
  try {
    const detail = await get('/suddenattack/v1/match-detail', { match_id: matchId })
    out.push({ matchId, detail })
    const t = detail.match_type ?? detail.matchType ?? '?'
    const m = detail.map_name ?? detail.mapName ?? '?'
    const log = detail.match_detail?.[0]?.battle_log ?? detail.battleLog ?? detail.battle_log ?? null
    console.log(`  ${matchId}  ${t}  ${m}  배틀로그 ${Array.isArray(log) ? log.length + '줄' : '없음'}`)
  } catch (e) {
    console.log(`  ${matchId}  ★실패★ ${String(e.message).slice(0, 80)}`)
  }
}
writeFileSync(OUT, JSON.stringify({ nick: NICK, ouid, matches: out }, null, 1), 'utf-8')
console.log(`saved ${OUT} · ${out.length}경기`)
