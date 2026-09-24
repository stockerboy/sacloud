// ★단추 QA 3★ — 클랜 페이지 탭 · 선수 페이지 단추 · 홈 리그 단추 · 서랍 관리자 줄 (2026-09-25 감시 7회차)
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const BASE = process.argv[2] || 'https://loginsa.cloud'
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const port = 9900 + Math.floor(Math.random() * 90)
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'sacloud-bq3-'))}`, `--remote-debugging-port=${port}`, 'about:blank'], { stdio: 'ignore' })
async function findWs() { for (let i = 0; i < 60; i++) { try { const t = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); const p = t.find((x) => x.type === 'page'); if (p?.webSocketDebuggerUrl) return p.webSocketDebuggerUrl } catch {} await sleep(250) } throw new Error('no ws') }
const ws = new WebSocket(await findWs()); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
let id = 0; const waiting = new Map(); const consoleErr = []
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && waiting.has(m.id)) { const { res, rej } = waiting.get(m.id); waiting.delete(m.id); if (m.error) rej(new Error(JSON.stringify(m.error))); else res(m.result); return } if (m.method === 'Runtime.exceptionThrown') consoleErr.push((m.params.exceptionDetails?.exception?.description || 'exception').slice(0, 120)); if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') consoleErr.push(m.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 120)) }
const send = (method, params = {}) => new Promise((res, rej) => { id += 1; waiting.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })) })
const ev = async (e, a = false) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: a })).result?.value
await send('Page.enable'); await send('Runtime.enable')
const mobile = process.argv[3] === 'm'
await send('Emulation.setDeviceMetricsOverride', { width: mobile ? 390 : 1440, height: 900, deviceScaleFactor: 1, mobile })
if (mobile) await send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' })
const go = async (path, waitText, ms = 20000) => { await send('Page.navigate', { url: BASE + path }); const t = Date.now(); while (Date.now() - t < ms) { if (await ev(`!!document.body && document.body.innerText.includes(${JSON.stringify(waitText)})`)) return true; await sleep(300) } return false }
const clickBtn = async (re) => ev(`(() => { const el = [...document.querySelectorAll('button,a,[role=tab]')].find(b => ${re}.test((b.innerText||'').trim())); if (!el) return 'not found'; el.click(); return 'clicked ' + (el.innerText||'').trim().slice(0,20) })()`)
const out = (k, v) => console.log(k.padEnd(30), v)
const btns = async () => ev(`[...document.querySelectorAll('button,[role=tab]')].map(b => (b.innerText||'').trim().replace(/\s+/g,' ')).filter(t => t && t.length < 14).slice(0, 30)`)
// 1. 클랜 페이지
out('클랜 페이지', await go('/league/nolink/clan/ferwfwfwfwf', '클랜', 25000))
out('  단추/탭 목록', JSON.stringify(await btns()))
for (const re of ['/클랜원|명단|선수/', '/상대전적|전적/', '/육각|분석|플레이/']) { out('  클릭 ' + re, await clickBtn(re)); await sleep(1500); out('    svg/표', await ev(`document.querySelectorAll('svg').length + ' svg · ' + document.querySelectorAll('table, [role=table]').length + ' 표'`)) }
// 2. 선수 페이지
out('선수 페이지', await go('/league/nolink/player/cmtm25c9n01hqvlq0vm4r6f9b', '정보갱신', 25000))
out('  단추 목록', JSON.stringify(await btns()))
out('  기본정보 클릭', await clickBtn('/^기본정보$/')); await sleep(1500); out('    본문에 기본정보/리그 카드', await ev(`/기본정보|Supply|IPL/.test(document.body.innerText)`))
const brk = await ev(`(([...document.querySelectorAll('a')].find(a => /병영수첩/.test(a.innerText))||{}).getAttribute||(()=>null)).call([...document.querySelectorAll('a')].find(a => /병영수첩/.test(a.innerText)), 'href')`)
out('  병영수첩 링크', brk)
// 3. 홈 리그 단추
out('홈', await go('/', '리그', 20000) || await go('/', 'IPL', 5000))
const league = await ev(`[...document.querySelectorAll('a[href^="/league/"]')].map(a => a.getAttribute('href')).filter((v,i,arr) => arr.indexOf(v)===i).slice(0, 8)`)
out('  리그 링크', JSON.stringify(league))
// 4. 서랍 관리자 줄 (비로그인)
out('  서랍 열기', await clickBtn('/메뉴|menu/i') === 'not found' ? await ev(`(() => { const b = document.querySelector('button[aria-label*="메뉴"]'); if (!b) return 'not found'; b.click(); return 'clicked aria' })()`) : 'clicked'); await sleep(1200)
out('  서랍에 관리자 줄', await ev(`[...document.querySelectorAll('nav a, aside a, [role=dialog] a')].some(a => /관리자/.test(a.innerText))`))
out('콘솔 에러', consoleErr.length ? JSON.stringify(consoleErr.slice(0, 5)) : '없음')
chrome.kill(); process.exit(0)
