// ★단추 QA★ — 헤드리스 크롬(CDP)으로 실제 단추를 누르고 결과를 찍는다 (2026-09-25 감시 · 확장 브라우저는 로컬에서 얼어 못 씀)
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const BASE = process.argv[2] || 'https://loginsa.cloud'
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const port = 9900 + Math.floor(Math.random() * 90)
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'sacloud-bq-'))}`, `--remote-debugging-port=${port}`, 'about:blank'], { stdio: 'ignore' })
async function findWs() { for (let i = 0; i < 60; i++) { try { const t = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); const p = t.find((x) => x.type === 'page'); if (p?.webSocketDebuggerUrl) return p.webSocketDebuggerUrl } catch {} await sleep(250) } throw new Error('no ws') }
const ws = new WebSocket(await findWs()); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
let id = 0; const waiting = new Map(); const consoleErr = []
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && waiting.has(m.id)) { const { res, rej } = waiting.get(m.id); waiting.delete(m.id); if (m.error) rej(new Error(JSON.stringify(m.error))); else res(m.result); return }
  if (m.method === 'Runtime.exceptionThrown') { consoleErr.push((m.params.exceptionDetails?.exception?.description || 'exception').slice(0, 120)); return }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') consoleErr.push(m.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 120))
}
const send = (method, params = {}) => new Promise((res, rej) => { id += 1; waiting.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })) })
const ev = async (expression, awaitPromise = false) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise })).result?.value
await send('Page.enable'); await send('Runtime.enable')
const go = async (path, waitText, ms = 20000) => { await send('Page.navigate', { url: BASE + path }); const t = Date.now(); while (Date.now() - t < ms) { if (await ev(`document.body && document.body.innerText.includes(${JSON.stringify(waitText)})`)) return true; await sleep(300) } return false }
const click = async (sel) => ev(`(() => { const el = ${sel}; if (!el) return 'not found'; el.click(); return 'clicked: ' + (el.innerText || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 40) })()`)
const out = (k, v) => console.log(k.padEnd(34), v)
const mobile = process.argv[3] === 'm'
await send('Emulation.setDeviceMetricsOverride', { width: mobile ? 390 : 1440, height: 900, deviceScaleFactor: 1, mobile })

// 1. 개인랭킹 — 무기 드롭다운·페이지 2
out('랭킹 열림', await go('/league/nolink/rank/player', '개인랭킹'))
const firstNames = async () => ev(`[...document.querySelectorAll('a[href*="/player/"]')].map(a => a.innerText.trim()).filter(Boolean).slice(0, 5)`)
out('  1쪽 상위', JSON.stringify(await firstNames()))
out('  무기 드롭다운', await click(`[...document.querySelectorAll('button,select,[role=combobox]')].find(b => /WEAPON|통합|무기/.test(b.innerText || b.value || ''))`))
await sleep(800)
out('  → 스나 항목', await click(`[...document.querySelectorAll('button,[role=option],li,option,a')].find(b => /스나/.test(b.innerText||''))`))
await sleep(2500)
out('  스나 뒤 상위', JSON.stringify(await firstNames()))
out('  페이지 2 단추', await click(`[...document.querySelectorAll('button,a')].find(b => (b.innerText||'').trim() === '2')`))
await sleep(2500)
const p2 = await firstNames(); out('  2쪽 상위', JSON.stringify(p2))
out('  URL', await ev('location.href'))
// 2. 서랍
out('서랍 단추', await click(`document.querySelector('button[aria-label*="메뉴"], button[aria-label*="menu"], [class*="hamburger"], button[aria-label*="서랍"]') || [...document.querySelectorAll('header button')][0]`))
await sleep(1200)
const drawer = await ev(`[...document.querySelectorAll('nav a, aside a, [role=dialog] a')].map(a => a.innerText.trim().replace(/\s+/g,' ') + '→' + a.getAttribute('href')).filter(s => !s.startsWith('→')).slice(0, 25)`)
out('  서랍 항목', JSON.stringify(drawer))
// 3. 검색
out('홈 열림', await go('/', 'SACLOUD'))
const typed = await ev(`(() => { const i = document.querySelector('input[type=search], input[placeholder*="닉네임"], input[placeholder*="검색"]'); if (!i) return 'input 없음'; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; set.call(i, '비청소'); i.dispatchEvent(new Event('input', {bubbles:true})); i.form ? i.form.requestSubmit ? i.form.requestSubmit() : i.form.submit() : i.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', bubbles:true})); return 'typed 비청소 + submit' })()`)
out('  검색 입력', typed); await sleep(3500)
out('  검색 후 URL', await ev('location.href'))
out('  결과에 비청소', await ev(`document.body.innerText.includes('비청소')`))
// 4. 최근경기 카드 → 라운드 그래프
out('최근경기 열림', await go('/league/nolink', '최근'))
out('  첫 카드 클릭', await click(`[...document.querySelectorAll('[class*="card"], article, li')].find(e => /vs|MVP/.test(e.innerText||'') && e.offsetHeight > 40)`))
await sleep(3000)
out('  라운드 그래프(svg) 수', await ev(`document.querySelectorAll('svg').length`))
out('  진영교대/전반 글자', await ev(`/전반|진영교대|라운드/.test(document.body.innerText)`))
// 5. 선수 페이지 정보갱신 단추
const pid = await ev(`(document.querySelector('a[href*="/player/"]')||{}).getAttribute ? document.querySelector('a[href*="/player/"]').getAttribute('href') : null`)
out('선수 링크', pid)
if (pid) { out('  선수 열림', await go(pid, '정보갱신', 25000)); out('  정보갱신 단추', await ev(`!![...document.querySelectorAll('button')].find(b => /정보갱신/.test(b.innerText))`)) }
out('콘솔 에러', consoleErr.length ? JSON.stringify(consoleErr.slice(0, 5)) : '없음')
chrome.kill(); process.exit(0)
