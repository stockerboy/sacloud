/**
 * IPL **클랜원 명단 수집 스니펫**을 만든다 (D-219 후속).
 *
 * ```
 * pnpm --filter @sacloud/worker exec tsx src/dev/iplMemberSnippetBuild.ts
 * → scripts/ipl-clan-members-snippet.js 를 새로 쓴다
 * ```
 *
 * ── 왜 생성하나
 *   클랜 slug 를 손으로 옮겨 적으면 **명단이 바뀔 때 조용히 어긋난다.**
 *   `IPL_ROSTER`(정본)에서 직접 뽑아 넣는다. 명단이 늘면 이 명령을 다시 돌리면 된다.
 *
 * ── 왜 파일 하나로 받나 (배틀로그와 다르게)
 *   클랜이 43곳뿐이라 응답도 43개다. 배틀로그처럼 수백 개가 아니라서
 *   **다운로드 파일 하나**면 충분하고, dev 서버가 꺼져 있어도 된다 (D-203 문제를 피한다).
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { IPL_ROSTER } from '@sacloud/db/ops'
import { REPO_ROOT } from '../lib/env.js'

const clans = IPL_ROSTER.map((c) => ({ barracks: c.barracks, name: c.name, tier: c.tier }))

const snippet = `/**
 * IPL 클랜원 명단 수집 — 병영수첩 콘솔에서 돌리는 스니펫 (D-219).
 *
 * **이 파일은 생성물이다.** 고치지 말고 아래 명령으로 다시 만든다.
 *   pnpm --filter @sacloud/worker exec tsx src/dev/iplMemberSnippetBuild.ts
 *
 * ── 쓰는 법
 *   1. https://barracks.sa.nexon.com 을 열고 **로그인한 채로** 둔다
 *   2. F12 → Console → \`allow pasting\` 을 타이핑하고 엔터
 *   3. 이 파일 전체를 붙여 넣고 엔터
 *   4. 아래 한 줄 실행
 *
 *        await collectIplMembers()
 *
 *   끝나면 \`ipl-clan-members.json\` 이 자동으로 내려받아진다.
 *
 * ── 요청 형식을 **스스로 찾는다**
 *   \`GetClanUserList\` 의 본문 모양을 우리가 모른다. 그래서 첫 클랜에서 후보를
 *   차례로 시도해 보고, 되는 것을 찾으면 나머지 42곳에 그대로 쓴다.
 *   못 찾으면 **멈추고 시도한 것을 전부 보여 준다.** 지어내지 않는다.
 *
 * ── 원본에 대한 예의
 *   순차 호출 · 요청 사이 300ms. 43번뿐이라 20초면 끝난다. 두들기지 않는다.
 */

var IPL_CLANS = ${JSON.stringify(clans, null, 2).replace(/\n/g, '\n')}

var IM_URL = '/api/ClanHome/GetClanUserList'
var IM_DELAY_MS = 300
var imSleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 시도해 볼 본문 모양들. 위에서부터 차례로 해 본다 */
var IM_SHAPES = [
  (slug) => ({ clan_id: slug }),
  (slug) => ({ clan_id: slug, page: 1 }),
  (slug) => ({ clan_id: slug, seq_no: 0 }),
  (slug) => ({ clan_id: slug, page_no: 1, page_size: 100 }),
  (slug) => ({ clan_id: slug, start: 0, count: 100 }),
]

async function imPost(body) {
  const res = await fetch(IM_URL, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* 본문이 JSON 이 아니다 */ }
  return { status: res.status, json, text: text.slice(0, 300) }
}

/**
 * 응답이 «쓸 만한 명단» 인가.
 *
 * ⚠ 2026-08-31 실측으로 고쳤다. 처음에는 \`json.result\` 만 봤는데 **거기엔 숫자 0 이 온다.**
 *    명단은 \`resultClanUserList\` 에 있다:
 *    { rtnCode:0, result:0, resultClanUserList:[ {str_usn, user_nexon_sn, user_nick,
 *      clan_level, clan_exp, conn_flag, punish_flag, profile_img} ] }
 *    그래서 **최상위 어느 칸이든 «원소 있는 배열»이면 통과**시킨다.
 */
function imMemberList(json) {
  if (!json || typeof json !== 'object') return null
  if (Array.isArray(json.resultClanUserList) && json.resultClanUserList.length) {
    return json.resultClanUserList
  }
  for (const v of Object.values(json)) {
    if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'object') return v
  }
  return null
}

function imLooksGood(json) {
  return imMemberList(json) !== null
}

async function imFindShape() {
  const probe = IPL_CLANS[0]
  const tried = []
  for (let i = 0; i < IM_SHAPES.length; i += 1) {
    const body = IM_SHAPES[i](probe.barracks)
    const out = await imPost(body)
    tried.push({ body, status: out.status, rtnCode: out.json && out.json.rtnCode, sample: out.text })
    if (imLooksGood(out.json)) {
      console.log('요청 형식을 찾았다:', JSON.stringify(body))
      return { index: i, first: out.json }
    }
    await imSleep(IM_DELAY_MS)
  }
  console.error('요청 형식을 못 찾았다. 시도한 것들:')
  console.table(tried.map((t) => ({ body: JSON.stringify(t.body), status: t.status, rtnCode: t.rtnCode })))
  console.log('원문 표본:')
  for (const t of tried) console.log(' ', JSON.stringify(t.body), '→', t.sample)
  return null
}

async function collectIplMembers() {
  console.log('IPL 클랜', IPL_CLANS.length, '곳의 클랜원 명단을 받는다')
  const found = await imFindShape()
  if (!found) return null

  const make = IM_SHAPES[found.index]
  const out = { collectedAt: new Date().toISOString(), endpoint: IM_URL, bodyShape: found.index, clans: [] }

  for (let i = 0; i < IPL_CLANS.length; i += 1) {
    const c = IPL_CLANS[i]
    try {
      const res = i === 0 ? { json: found.first, status: 200 } : await imPost(make(c.barracks))
      out.clans.push({ barracks: c.barracks, name: c.name, tier: c.tier, status: res.status, raw: res.json })
      const list = imMemberList(res.json)
      const online = list ? list.filter((m) => Number(m.conn_flag) === 1).length : 0
      console.log(\`  [\${i + 1}/\${IPL_CLANS.length}] \${c.name} (\${c.barracks}) — \${list ? \`\${list.length}명 (접속중 \${online})\` : '비어있음'}\`)
    } catch (e) {
      out.clans.push({ barracks: c.barracks, name: c.name, tier: c.tier, status: 0, error: String(e) })
      console.warn('  실패', c.name, e)
    }
    if (i < IPL_CLANS.length - 1) await imSleep(IM_DELAY_MS)
  }

  const blob = new Blob([JSON.stringify(out)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'ipl-clan-members.json'
  document.body.appendChild(a)
  a.click()
  a.remove()
  console.log('끝. ipl-clan-members.json 을 내려받았다. 이 파일을 알려 주면 된다')
  return out
}
`

const out = join(REPO_ROOT, 'scripts', 'ipl-clan-members-snippet.js')
writeFileSync(out, snippet, 'utf8')
console.info(`IPL 클랜 ${clans.length}곳을 넣어 ${out} 를 만들었다`)
