// ★화면 얼음 탐침★ — 헤드리스 크롬으로 페이지를 열고 긴 작업(longtask)·메인스레드 막힘을 잰다 (2026-09-25 감시)
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const BASE = process.argv[2] || 'https://loginsa.cloud'
const PATHS = (process.argv[3] || '/league/nolink/rank/player,/board/free/cmuaxpu6c0001l004z311358o,/').split(',')
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const port = 9900 + Math.floor(Math.random() * 90)
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'sacloud-fp-'))}`, `--remote-debugging-port=${port}`, 'about:blank'], { stdio: 'ignore' })
async function findWs() { for (let i = 0; i < 60; i++) { try { const t = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); const p = t.find((x) => x.type === 'page'); if (p?.webSocketDebuggerUrl) return p.webSocketDebuggerUrl } catch {} await sleep(250) } throw new Error('no ws') }
const ws = new WebSocket(await findWs()); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
let id = 0; const waiting = new Map()
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && waiting.has(m.id)) { const { res, rej } = waiting.get(m.id); waiting.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result) } }
const send = (method, params = {}) => new Promise((res, rej) => { id += 1; waiting.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })) })
const ev = async (expression, awaitPromise = false) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise })).result?.value
await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
for (const path of PATHS) {
  const t0 = Date.now()
  await send('Page.navigate', { url: BASE + path })
  // 메인스레드 막힘 재기: 100ms 타이머가 얼마나 늦게 오나 (합계 = 막힌 시간)
  await sleep(1500)
  const r = await ev(`new Promise(res => { const lt=[]; try { new PerformanceObserver(l => l.getEntries().forEach(e => lt.push(Math.round(e.duration)))).observe({type:'longtask', buffered:true}) } catch {}
    let blocked=0, last=performance.now(); const iv=setInterval(()=>{ const n=performance.now(); const d=n-last-100; if(d>50) blocked+=d; last=n }, 100);
    setTimeout(()=>{ clearInterval(iv); res({ blockedMs: Math.round(blocked), longtasks: lt.length, worst: Math.max(0,...lt), title: document.title.slice(0,30), ready: document.readyState }) }, 12000) })`, true)
  console.log(path.padEnd(48), '12초 관측: 막힘', String(r?.blockedMs)+'ms', '· longtask', r?.longtasks, '건 · 최장', r?.worst+'ms', '·', r?.ready, '· 총', Date.now()-t0, 'ms')
}
chrome.kill()
process.exit(0)
