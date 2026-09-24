// ★단추 QA 2★ — 무기 칩·클랜랭킹·글쓰기·HOT (2026-09-25 감시 6회차)
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const BASE = process.argv[2] || 'https://loginsa.cloud'
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const port = 9900 + Math.floor(Math.random() * 90)
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'sacloud-bq2-'))}`, `--remote-debugging-port=${port}`, 'about:blank'], { stdio: 'ignore' })
async function findWs() { for (let i = 0; i < 60; i++) { try { const t = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); const p = t.find((x) => x.type === 'page'); if (p?.webSocketDebuggerUrl) return p.webSocketDebuggerUrl } catch {} await sleep(250) } throw new Error('no ws') }
const ws = new WebSocket(await findWs()); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
let id = 0; const waiting = new Map(); const consoleErr = []
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && waiting.has(m.id)) { const { res, rej } = waiting.get(m.id); waiting.delete(m.id); if (m.error) rej(new Error(JSON.stringify(m.error))); else res(m.result); return } if (m.method === 'Runtime.exceptionThrown') consoleErr.push((m.params.exceptionDetails?.exception?.description || 'exception').slice(0, 120)); if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') consoleErr.push(m.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 120)) }
const send = (method, params = {}) => new Promise((res, rej) => { id += 1; waiting.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })) })
const ev = async (e, a = false) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: a })).result?.value
await send('Page.enable'); await send('Runtime.enable')
const mobile = process.argv[3] === 'm'
await send('Emulation.setDeviceMetricsOverride', { width: mobile ? 390 : 1440, height: 900, deviceScaleFactor: 1, mobile })
const go = async (path, waitText, ms = 20000) => { await send('Page.navigate', { url: BASE + path }); const t = Date.now(); while (Date.now() - t < ms) { if (await ev(`!!document.body && document.body.innerText.includes(${JSON.stringify(waitText)})`)) return true; await sleep(300) } return false }
const clickBtn = async (re) => ev(`(() => { const el = [...document.querySelectorAll('button,a')].find(b => ${re}.test((b.innerText||'').trim())); if (!el) return 'not found'; el.click(); return 'clicked ' + (el.innerText||'').trim().slice(0,20) })()`)
const out = (k, v) => console.log(k.padEnd(30), v)
const rows = async () => ev(`[...document.querySelectorAll('a[href*="/player/"], a[href*="/clan/"]')].map(a => a.innerText.trim().replace(/\s+/g,' ')).filter(Boolean).slice(3, 8)`)
// 1. 무기 칩
out('개인랭킹', await go('/league/nolink/rank/player', '개인랭킹'))
const base = await rows(); out('  통합 4~8위', JSON.stringify(base))
out('  WEAPON 열기', await clickBtn('/WEAPON/')); await sleep(1500)
out('  스나 클릭', await clickBtn('/^스나$/')); await sleep(3000)
const sn = await rows(); out('  스나 4~8위', JSON.stringify(sn)); out('  → 표 바뀜', JSON.stringify(sn) !== JSON.stringify(base))
out('  WEAPON 열기', await clickBtn('/WEAPON/')); await sleep(1500)
out('  라플 클릭', await clickBtn('/^라플$/')); await sleep(3000)
const rf = await rows(); out('  라플 4~8위', JSON.stringify(rf)); out('  → 스나와 다름', JSON.stringify(rf) !== JSON.stringify(sn))
// 2. 클랜랭킹
out('클랜랭킹', await go('/league/nolink/rank/clan', '클랜랭킹'))
const c1 = await rows(); out('  1쪽', JSON.stringify(c1))
out('  페이지 2', await clickBtn('/^2$/')); await sleep(3000)
const c2 = await rows(); out('  2쪽', JSON.stringify(c2)); out('  → 바뀜', JSON.stringify(c2) !== JSON.stringify(c1))
const clanHref = await ev(`(document.querySelector('a[href*="/clan/"]')||{getAttribute(){return null}}).getAttribute('href')`)
out('  클랜 링크', clanHref)
if (clanHref) { out('  클랜 페이지', await go(clanHref, '클랜', 25000)); out('  URL', await ev('location.pathname')) }
// 3. 게시판 글쓰기 폼 · HOT
out('자유게시판', await go('/board/free', '자유'))
out('  글 쓰기 단추', await clickBtn('/글 ?쓰기/')); await sleep(3000)
out('  URL', await ev('location.pathname')); out('  제목/본문 입력칸', await ev(`!!document.querySelector('input[name=title], input[placeholder*="제목"]') + ' / ' + !!document.querySelector('textarea, [contenteditable=true]')`))
out('HOT 탭', await go('/board/hot', 'HOT')); out('  글 수', await ev(`document.querySelectorAll('a[href*="/board/"]').length`))
out('콘솔 에러', consoleErr.length ? JSON.stringify(consoleErr.slice(0, 5)) : '없음')
chrome.kill(); process.exit(0)
