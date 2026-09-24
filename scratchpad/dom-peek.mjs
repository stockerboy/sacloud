import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const BASE='https://loginsa.cloud'
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const port = 9900 + Math.floor(Math.random() * 90)
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'sacloud-dp-'))}`, `--remote-debugging-port=${port}`, 'about:blank'], { stdio: 'ignore' })
async function findWs() { for (let i = 0; i < 60; i++) { try { const t = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); const p = t.find((x) => x.type === 'page'); if (p?.webSocketDebuggerUrl) return p.webSocketDebuggerUrl } catch {} await sleep(250) } throw new Error('no ws') }
const ws = new WebSocket(await findWs()); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
let id = 0; const waiting = new Map()
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && waiting.has(m.id)) { const { res, rej } = waiting.get(m.id); waiting.delete(m.id); if (m.error) rej(new Error(JSON.stringify(m.error))); else res(m.result) } }
const send = (method, params = {}) => new Promise((res, rej) => { id += 1; waiting.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })) })
const ev = async (e, a=false) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: a })).result?.value
await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' })
await send('Page.navigate', { url: BASE + '/league/nolink/home' }); await sleep(14000)
console.log('--- /league/nolink 폰 본문 앞 700자 ---'); console.log(await ev(`document.body.innerText.replace(/\n+/g,' | ').slice(0,700)`))
console.log('svg 수', await ev('document.querySelectorAll("svg").length'), '· 치열 글자', await ev(`document.body.innerText.includes('치열')`), '· 전반/후반', await ev(`/전반|후반|진영교대/.test(document.body.innerText)`))
await send('Page.navigate', { url: BASE + '/league/nolink/rank/player' }); await sleep(8000)
await ev(`([...document.querySelectorAll('button')].find(b => /WEAPON/.test(b.innerText))||{click(){}}).click()`); await sleep(1000)
console.log('--- WEAPON 드롭다운 열린 뒤 후보 ---'); console.log(await ev(`[...document.querySelectorAll('[role=option],[role=menuitem],li,button,label')].map(e=>e.tagName+':'+(e.innerText||'').trim().replace(/\s+/g,' ').slice(0,20)).filter(s=>/스나|라플|통합|sniper|rifle/i.test(s)).slice(0,12).join(' ; ')`))
chrome.kill(); process.exit(0)
