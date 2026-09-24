// ★단추 QA 4★ — 비교분석·더 불러오기·댓글 답글·로그인 폼·약관 (2026-09-25 감시 8회차)
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const BASE = process.argv[2] || 'https://loginsa.cloud'
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const port = 9900 + Math.floor(Math.random() * 90)
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'sacloud-bq4-'))}`, `--remote-debugging-port=${port}`, 'about:blank'], { stdio: 'ignore' })
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
// 1. 선수 페이지 — 비교분석 · 더 불러오기
out('선수 페이지', await go('/league/nolink/player/cmtm25c9n01hqvlq0vm4r6f9b', '정보갱신', 25000))
const before = await ev(`document.querySelectorAll('a[href*="/match/"], [class*="match"]').length`)
out('  더 불러오기', await clickBtn('/더 불러오기/')); await sleep(3500)
out('    경기 요소 수', before + ' → ' + await ev(`document.querySelectorAll('a[href*="/match/"], [class*="match"]').length`))
out('  비교분석하기', await clickBtn('/비교분석/')); await sleep(2500)
out('    URL/모달', await ev(`location.pathname + ' · dialog=' + !!document.querySelector('[role=dialog], dialog[open]') + ' · 입력칸=' + !!document.querySelector('input')`))
// 2. 댓글 답글
out('글 페이지', await go('/board/free/cmuaxpu6c0001l004z311358o', '댓글', 20000))
out('  답글 단추', await clickBtn('/^답글$/')); await sleep(1200)
out('    답글 입력칸 수', await ev(`document.querySelectorAll('textarea').length`))
// 3. 로그인 폼
out('로그인 페이지', await go('/auth/login', '로그인', 20000))
out('  폼', await ev(`'id/email=' + !!document.querySelector('input[type=email], input[name*=id], input[name*=email], input[type=text]') + ' · pw=' + !!document.querySelector('input[type=password]') + ' · 제출=' + !![...document.querySelectorAll('button')].find(b => /로그인/.test(b.innerText))`))
out('  회원가입 링크', await ev(`(([...document.querySelectorAll('a')].find(a => /회원가입|가입/.test(a.innerText))||{getAttribute(){return null}}).getAttribute('href'))`))
// 4. 약관·개인정보 링크 (푸터)
out('홈 푸터 링크', await go('/', '이용약관', 15000) ? JSON.stringify(await ev(`[...document.querySelectorAll('footer a, a')].filter(a => /이용약관|개인정보/.test(a.innerText)).map(a => a.getAttribute('href'))`)) : '푸터 글자 못 찾음')
out('콘솔 에러', consoleErr.length ? JSON.stringify(consoleErr.slice(0, 5)) : '없음')
chrome.kill(); process.exit(0)
