/**
 * ★자율 QA 러너★ (2026-09-24 사장님 「자율 QA 20시간 — 모든 페이지 하나하나 열어보면서 비율 이상한 거 맞추고 절대 멈추지 마」)
 *
 *   node scratchpad/qa2.mjs <BASE> <pc|m|both> [이름필터]
 *     BASE  https://3rdcloud.my  또는  http://localhost:3000
 *
 * 크롬 하나를 띄우고 PAGES 를 차례로 연다. 폭마다 (PC 1440 · 폰 390) —
 *   ① 기다릴 글자가 뜰 때까지 (최대 20초) ② 눌러야 나오는 것은 누르고 ③ scratchpad/qa.js(잘림·칸 밖·겹침) 를 돌리고
 *   ④ 전체 그림을 scratchpad/qa2/<이름>_<pc|m>.png 로 저장 ⑤ 결과 한 줄을 scratchpad/qa2/summary.md 에 쌓는다
 * 한 페이지가 죽어도 다음으로 간다. 크롬은 끝에 반드시 내린다 (메모리 taskstop-leaves-children).
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const [BASE = 'https://3rdcloud.my', which = 'both', filter = ''] = process.argv.slice(2)
const OUT = 'scratchpad/qa2'
mkdirSync(OUT, { recursive: true })
const QA_JS = readFileSync('scratchpad/qa.js', 'utf8')

/* [이름, 경로, 기다릴글자, 누를글자(선택 · @aria-label 가능), 폰에서만누름?] */
const PAGES = [
  ['home', '/', '검색', null],
  ['league-supply', '/league/supply', '클랜랭킹', null],
  ['league-home', '/league/supply/home', '', null],
  ['league-nolink', '/league/nolink', '클랜랭킹', null],
  ['league-sanply', '/league/sanply', '클랜랭킹', null],
  ['league-cpl', '/league/cpl', '', null],
  ['rank-clan', '/league/supply/rank/clan', '클랜랭킹', null],
  ['rank-player', '/league/supply/rank/player', '개인랭킹', null],
  ['rank-top5', '/league/supply/rank/top5', '', null],
  ['match-list', '/league/supply/match', '', null],
  ['match-detail', '/league/supply/match/260923223331124003', '플레이어', null],
  ['match-detail-analysis', '/league/supply/match/260923223331124003', '가 잡음', '경기분석', true, '가 잡음'],
  ['player', '/league/supply/player/cmtleu9y20111vleweqyrxpwf', '승률', null],
  ['player-analysis-m', '/league/supply/player/cmtleu9y20111vleweqyrxpwf', '', '플레이분석', true, '중위권'],
  ['clan', '/league/supply/clan/zxcvddr2', '클랜원', null],
  ['clan-nolink', '/league/nolink/clan/01025606089', '클랜원', null], /* happytogether 는 PL 소속이었다 — IPL 진짜 클랜(veritas)으로 */
  ['badge', '/league/supply/badge', '', null],
  ['hire', '/league/supply/hire', '', null],
  ['league-board', '/league/supply/board', '', null],
  ['board-hot', '/board/hot', '인기', null],
  ['board-free', '/board/free', '자유', null],
  ['board-post', '/board/free/cmuc4k3lr000jte0515mx4z44', '', null],
  ['board-write', '/board/free/write', '', null],
  ['about', '/about', '', null],
  ['guide', '/guide', '', null],
  ['leagues', '/leagues', '', null],
  ['apply', '/apply', '', null],
  ['login', '/auth/login', '로그인', null],
  ['signup', '/auth/signup', '', null],
  ['me', '/me', '', null],
  ['clause', '/clause/service', '', null],
  ['drawer-m', '/league/supply/rank/clan', 'Leagues', '@메뉴 열기', true],
  /* 2회차에 더한 화면 — 리그별 변주 · 상세 페이지들 */
  ['rank-clan-nolink', '/league/nolink/rank/clan', '클랜랭킹', null],
  ['rank-clan-nolink-div1', '/league/nolink/rank/clan/1', '', null],
  ['rank-player-nolink', '/league/nolink/rank/player', '개인랭킹', null],
  ['rank-player-sanply', '/league/sanply/rank/player', '개인랭킹', null],
  ['hire-sanply', '/league/sanply/hire', '', null],
  ['rank-clan-sanply', '/league/sanply/rank/clan', '', null],
  ['badge-detail', '/league/supply/badge/save', '', null],
  ['player-season', '/league/supply/player/cmtleu9y20111vleweqyrxpwf/season', '', null],
  ['clan-season', '/league/supply/clan/zxcvddr2/season', '', null],
  ['clan-players', '/league/supply/clan/zxcvddr2/player', '', null],
  ['league-desc', '/league/supply/home/desc', '', null],
  ['league-info', '/league/supply/home/info', '', null],
  ['clan-global', '/clan/zxcvddr2', '', null],
  ['leagues-create', '/leagues/create', '', null],
  ['pw-forget', '/auth/password/forget', '', null],
  ['clause-policy', '/clause/policy', '', null],
  /* 8회차 — 다른 리그의 선수·경기 상세 · 관리자 입구 */
  ['player-nolink', '/league/nolink/player/cmtlfmyyw02hmvld05faui3jt', '승률', null],
  ['player-sanply', '/league/sanply/player/cmtokb15b0byzvlkg426j40mu', '승률', null],
  ['match-nolink', '/league/nolink/match', '', null],
  ['match-sanply', '/league/sanply/match', '', null],
  ['admin', '/admin', '', null],
  ['admin-texts', '/admin/texts', '', null],
  /* 5회차 — 눌러야 보이는 상태들 */
  ['match-list-open', '/league/supply/match', '플레이어', 'css:.mc-card .mc-pc', false, '점수판보기'],
  ['trend-day', '/league/supply/player/cmtleu9y20111vleweqyrxpwf', '승률', 'DAY', false],
  ['clan-record-tab-m', '/league/supply/clan/zxcvddr2', '클랜원', '기록실', true],
]
/* 'tab' = 1024 (아이패드 가로 · 좁은 노트북) — 사장님 「비율 이상한 거」 는 중간 폭에서 자주 난다 (2026-09-24 8회차 뒤 추가) */
const WIDTHS = which === 'pc' ? [[1440, 'pc']] : which === 'm' ? [[390, 'm']] : which === 'tab' ? [[1024, 'tab']] : which === 'all' ? [[390, 'm'], [1024, 'tab'], [1440, 'pc']] : [[390, 'm'], [1440, 'pc']]

const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const profile = mkdtempSync(join(tmpdir(), 'sacloud-qa2-'))
const port = 9600 + Math.floor(Math.random() * 300)
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, 'about:blank'], { stdio: 'ignore' })

async function findWs() {
  for (let i = 0; i < 60; i += 1) {
    try { const res = await fetch(`http://127.0.0.1:${port}/json/list`); const tabs = await res.json(); const page = tabs.find((t) => t.type === 'page'); if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl } catch { /* 아직 */ }
    await sleep(250)
  }
  throw new Error('크롬 디버그 주소를 못 찾았다')
}
const ws = new WebSocket(await findWs())
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
let id = 0
const waiting = new Map()
ws.onmessage = (ev) => { const msg = JSON.parse(ev.data); if (msg.id && waiting.has(msg.id)) { const { res, rej } = waiting.get(msg.id); waiting.delete(msg.id); msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result) } }
const send = (method, params = {}) => new Promise((res, rej) => { id += 1; waiting.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })) })
const evalStr = async (expression, awaitPromise = false) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise }); return r.result?.value }

await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {})
await send('Page.setWebLifecycleState', { state: 'active' }).catch(() => {})

const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ')
appendFileSync(join(OUT, 'summary.md'), `\n## ${stamp} · ${BASE} · ${which}\n`)

for (const [w, tag] of WIDTHS) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: tag === 'm' ? 2 : 1, mobile: tag === 'm' })
  if (tag === 'm') {
    await send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1', platform: 'iPhone' }).catch(() => {})
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }).catch(() => {})
  } else {
    await send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36', platform: 'Win32' }).catch(() => {})
    await send('Emulation.setTouchEmulationEnabled', { enabled: false }).catch(() => {})
  }
  for (const [name, path, waitFor, clickText, phoneOnly, expectText] of PAGES) {
    if (filter && !name.includes(filter)) continue
    if (phoneOnly && tag !== 'm') continue
    const label = `${name}_${tag}`
    try {
      /* 2026-09-24 3회차: 500 은 그림으로만 보였다 → 상태 코드를 먼저 잰다 (307 은 따라간 뒤 최종 코드) */
      let status = 0
      try { status = (await fetch(BASE + path, { redirect: 'follow', headers: { 'user-agent': tag === 'm' ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)' : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } })).status } catch { status = -1 }
      await send('Page.navigate', { url: BASE + path })
      await sleep(2500)
      if (waitFor) for (let i = 0; i < 40; i += 1) { if ((await evalStr(`document.body.innerText.includes(${JSON.stringify(waitFor)})`)) === true) break; await sleep(500) }
      if (clickText) {
        let clicked = 'not found'
        for (let i = 0; i < 20 && clicked !== 'clicked'; i += 1) {
          clicked = await evalStr(`(() => { const want = ${JSON.stringify(clickText)}; const el = want.startsWith('css:') ? document.querySelector(want.slice(4)) : want.startsWith('@') ? document.querySelector('[aria-label=' + JSON.stringify(want.slice(1)) + ']') : [...document.querySelectorAll('span,button,a,div')].find(e => e.children.length === 0 && e.textContent.trim() === want); if (el) { el.click(); return 'clicked' } return 'not found' })()`)
          if (clicked !== 'clicked') await sleep(500)
        }
        await sleep(2500)
        /* 2026-09-24 6회차: React 가 붙기 전에 눌러 아무 일도 안 나던 것 → 기대 글자(6번째 칸)가 안 뜨면 두 번 더 누른다 */
        if (expectText) for (let k = 0; k < 2; k += 1) {
          const ok = await evalStr(`document.body.innerText.includes(${JSON.stringify(expectText)})`)
          if (ok === true) break
          await evalStr(`(() => { const want = ${JSON.stringify(clickText)}; const el = want.startsWith('css:') ? document.querySelector(want.slice(4)) : want.startsWith('@') ? document.querySelector('[aria-label=' + JSON.stringify(want.slice(1)) + ']') : [...document.querySelectorAll('span,button,a,div')].find(e => e.children.length === 0 && e.textContent.trim() === want); if (el) el.click(); return 1 })()`)
          await sleep(2500)
        }
      }
      await sleep(1500)
      /* 그려지는 애니메이션이 끝나도록 살짝 더 · 그리고 맨 아래까지 한 번 훑어 지연 그림을 깨운다 */
      await evalStr(`(async () => { const h = document.documentElement.scrollHeight; for (let y = 0; y < h; y += 700) { scrollTo(0, y); await new Promise(r => setTimeout(r, 120)) } scrollTo(0, 0); return 'ok' })()`, true)
      await sleep(1200)
      const qa = await evalStr(QA_JS, true)
      const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
      writeFileSync(join(OUT, `${label}.png`), Buffer.from(shot.data, 'base64'))
      const parsed = (() => { try { return JSON.parse(qa) } catch { return null } })()
      const line = parsed
        ? `- ${label}  ${status >= 400 || status <= 0 ? `★HTTP ${status}★ ` : ''}scrollW ${parsed.scrollW}${parsed.scrollW > w ? ' ★가로넘침★' : ''} · 잘림 ${parsed.clipped?.length ?? 0} · 칸밖 ${parsed.outside?.length ?? 0} · 겹침 ${parsed.overlap?.length ?? 0}` +
          (parsed.clipped?.length ? `\n    잘림: ${parsed.clipped.slice(0, 6).join(' | ')}` : '') +
          (parsed.outside?.length ? `\n    칸밖: ${parsed.outside.slice(0, 4).join(' | ')}` : '') +
          (parsed.overlap?.length ? `\n    겹침: ${parsed.overlap.slice(0, 4).join(' | ')}` : '')
        : `- ${label}  (qa 결과 없음: ${String(qa).slice(0, 80)})`
      appendFileSync(join(OUT, 'summary.md'), line + '\n')
      console.log(line.split('\n')[0])
    } catch (e) {
      const line = `- ${label}  ★실패★ ${(e && e.message) || e}`
      appendFileSync(join(OUT, 'summary.md'), line + '\n')
      console.log(line)
    }
  }
}

ws.close()
chrome.kill()
await sleep(400)
try { rmSync(profile, { recursive: true, force: true }) } catch { /* 지워지면 좋고 */ }
process.exit(0)
