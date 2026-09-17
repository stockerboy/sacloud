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

/* ── ② 경기마다 배틀로그.
 *
 * ⚠ ★용병매치에는 클랜 단위 로그가 없다★ (2026-09-18 실측) —
 *   `clan_no` 가 `null` 이고 `GetBattleLogClan/<키>/<아무값>` 은 ★406★ 이다.
 *   클랜전에서 쓰던 「한 번에 열 명」 길이 막힌다.
 *
 * ★그래서 열 명 각자의 선수 로그를 받아 합친다.★
 *   ① 현물의 로그에서 `target_str_usn` 을 모으면 ★상대·동료 명단★ 이 나온다
 *   ② 그 명단을 다시 받아 ★새 이름이 더 나오면★ 또 받는다 (한 바퀴면 보통 끝난다)
 *   ③ 같은 죽음이 ★죽인 쪽·죽은 쪽 두 로그에 다 들어 있다★ — 겹치는 것은 지운다
 */
interface Ev {
  round: string
  event_type: string
  event_time: string
  event_key: number
  weapon: string
  str_usn: string
  user_nick: string
  target_str_usn: string | null
  target_user_nick: string | null
  kill_x: number
  kill_y: number
  death_x: number
  death_y: number
}

async function logOf(key: string, usn: string): Promise<Ev[]> {
  const r = await call('POST', `/api/BattleLog/GetBattleLog/${key}/${usn}`, '{}')
  if (r.status !== 200) return []
  const body = JSON.parse(r.body) as { battleLog?: Ev[] }
  return body.battleLog ?? []
}

const picked = matches.slice(0, TAKE)
const out: Record<string, unknown>[] = []

for (const m of picked) {
  const key = String(m.match_key)
  const seen = new Set<string>([usn])
  let frontier = [usn]
  const all: Ev[] = []

  /* 두 바퀴면 충분하다 — 세 바퀴째에 새 이름이 나오면 그때 늘린다 */
  for (let depth = 0; depth < 3 && frontier.length > 0; depth += 1) {
    const next: string[] = []
    for (const u of frontier) {
      const rows = await logOf(key, u)
      all.push(...rows)
      for (const e of rows) {
        const t = e.target_str_usn
        if (t && !seen.has(t)) {
          seen.add(t)
          next.push(t)
        }
      }
    }
    frontier = next
  }

  /*
   * ★같은 사건을 한 줄로 접는다.★ `event_key` 는 로그 주인마다 다르니 못 쓴다 —
   * ★라운드 · 시각 · 죽은 사람★ 이 같으면 같은 죽음이다.
   * ⚠ 줄 주인이 «죽인 쪽» 인지 «죽은 쪽» 인지에 따라 앞뒤 칸이 뒤집힌다 —
   *   ★언제나 「죽인 사람 → 죽은 사람」 으로 세워 놓고★ 접는다.
   */
  const byId = new Map<string, Record<string, unknown>>()
  for (const e of all) {
    const isDeath = e.event_type === 'death'
    const killer = isDeath ? e.target_str_usn : e.str_usn
    const victim = isDeath ? e.str_usn : e.target_str_usn
    const killerNick = isDeath ? e.target_user_nick : e.user_nick
    const victimNick = isDeath ? e.user_nick : e.target_user_nick
    const id = `${e.round}|${e.event_time}|${victim ?? '?'}|${e.event_type === 'bomb' ? 'bomb' : 'k'}`
    if (byId.has(id)) continue
    byId.set(id, {
      round: Number(e.round),
      time: e.event_time,
      type: e.event_type,
      weapon: e.weapon,
      killer,
      killerNick,
      victim,
      victimNick,
      /* 좌표는 ★죽은 사람 자리★ 가 구역이다 (`zone-means-victim-position`) */
      deathX: e.death_x,
      deathY: e.death_y,
      killX: e.kill_x,
      killY: e.kill_y,
    })
  }
  const events = [...byId.values()].sort(
    (a, b) => (a.round as number) - (b.round as number) || String(a.time).localeCompare(String(b.time)),
  )
  console.log(`  ${key}  ${m.match_name}  사람 ${seen.size}명 · 원본 ${all.length}줄 → 접어서 ${events.length}줄`)
  out.push({ head: m, roster: [...seen], events })
}

writeFileSync(OUT, JSON.stringify({ nick: NICK, usn, matches: out }, null, 1), 'utf-8')
console.log(`saved ${OUT} · ${out.length}경기`)
closeBarracksBrowser()
