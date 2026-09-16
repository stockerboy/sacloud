/**
 * ★무한 QA — 화면을 돌며 자동으로 트집을 잡는다★ (2026-09-17 사장님).
 *
 * > 「다 하고 PC 한번 모바일 한번씩 무한 QA 돌려
 * >  자 높낮이 그리고 피시버전에서 이상한거 그리고 글씨 크기(짤리는거)
 * >  그리고 너무 큰 공간낭비」
 *
 * 눈으로만 보면 놓친다. 사장님이 늘 잡아내시는 네 가지를 ★재서★ 잡는다:
 *
 * ```
 * ① 가로 스크롤     scrollWidth > clientWidth              폰에서 제일 흔한 사고
 * ② 글자 짤림       scrollWidth > clientWidth + 1 인 칸     말줄임(…)도 같이 센다
 * ③ 빈 공간 낭비    한 줄 안에서 이웃 사이 가로 틈 > 160px
 * ④ 겹침           서로 다른 글자 상자가 포개진 것
 * ```
 *
 * 쓰는 법:
 *   node scratchpad/qa.mjs <포트> [pc|m|both]
 *
 * 화면은 아래 `PAGES` 에 있다. 찍은 그림은 `scratchpad/qa-shots/` 에 남는다.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const port = process.argv[2] ?? '3233'
const which = process.argv[3] ?? 'both'
const BASE = `http://localhost:${port}`
const OUT = 'scratchpad/qa-shots'

/** 사장님이 보시는 화면 여섯 + 곁가지 */
const PAGES = [
  ['홈', '/'],
  ['리그홈', '/league/supply/home'],
  ['클랜랭킹', '/league/supply/rank/clan'],
  ['개인랭킹', '/league/supply/rank/player'],
  ['분야별TOP5', '/league/supply/rank/top5'],
  ['게시판', '/league/supply/board'],
]

const WIDTHS = which === 'pc' ? [[1280, 'pc']] : which === 'm' ? [[390, 'm']] : [[390, 'm'], [1280, 'pc']]

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find((p) => existsSync(p))

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
mkdirSync(OUT, { recursive: true })

/** 화면 안에서 도는 검사 — 브라우저 쪽 코드다 */
const PROBE = `(() => {
  const root = document.documentElement
  const out = {
    scrollW: root.scrollWidth,
    clientW: root.clientWidth,
    height: root.scrollHeight,
    clipped: [],
    gaps: [],
    overlaps: [],
    tiny: [],
  }
  const nodes = [...document.querySelectorAll('body *')]
  const seen = (el) => {
    const r = el.getBoundingClientRect()
    const st = getComputedStyle(el)
    return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.opacity !== '0'
  }
  const label = (el) => {
    const t = (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 28)
    return el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.') : '') + (t ? ' «' + t + '»' : '')
  }

  /* ② 글자 짤림 — 담긴 글이 칸보다 넓다 */
  for (const el of nodes) {
    if (!seen(el)) continue
    if (el.children.length > 0) continue          // 글자를 직접 담은 칸만 본다
    const text = (el.textContent || '').trim()
    if (text === '') continue
    if (el.scrollWidth > el.clientWidth + 1) {
      out.clipped.push({ where: label(el), need: el.scrollWidth, have: el.clientWidth })
    }
    /* ④ 너무 작은 글씨 — 폰에서 10px 아래는 안 읽힌다 */
    const size = parseFloat(getComputedStyle(el).fontSize)
    if (size > 0 && size < 10) out.tiny.push({ where: label(el), size })
  }

  /* ③ 한 줄 안에서 이웃 사이가 너무 벌어진 것 */
  for (const parent of nodes) {
    if (!seen(parent)) continue
    const kids = [...parent.children].filter(seen)
    if (kids.length < 2 || kids.length > 8) continue
    const boxes = kids.map((k) => ({ el: k, r: k.getBoundingClientRect() })).sort((a, b) => a.r.left - b.r.left)
    for (let i = 1; i < boxes.length; i += 1) {
      const prev = boxes[i - 1].r
      const cur = boxes[i].r
      const sameRow = Math.abs(prev.top - cur.top) < 8
      const gap = cur.left - prev.right
      if (sameRow && gap > 160) {
        out.gaps.push({ where: label(parent), gap: Math.round(gap), left: label(boxes[i - 1].el), right: label(boxes[i].el) })
      }
    }
  }

  /* ⑤ 글자끼리 포개진 것 */
  const texts = nodes.filter((el) => seen(el) && el.children.length === 0 && (el.textContent || '').trim() !== '')
  for (let i = 0; i < texts.length; i += 1) {
    for (let j = i + 1; j < Math.min(texts.length, i + 24); j += 1) {
      const a = texts[i].getBoundingClientRect()
      const b = texts[j].getBoundingClientRect()
      const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left)
      const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
      if (ox > 6 && oy > 6) out.overlaps.push({ a: label(texts[i]), b: label(texts[j]) })
    }
  }
  /* 같은 말이 여러 번 나오면 한 번만 */
  const uniq = (rows, key) => {
    const s = new Set(); const o = []
    for (const r of rows) { const k = key(r); if (!s.has(k)) { s.add(k); o.push(r) } }
    return o.slice(0, 12)
  }
  out.clipped = uniq(out.clipped, (r) => r.where)
  out.gaps = uniq(out.gaps, (r) => r.where + r.gap)
  out.overlaps = uniq(out.overlaps, (r) => r.a + r.b)
  out.tiny = uniq(out.tiny, (r) => r.where)
  return JSON.stringify(out)
})()`

async function run() {
  const profile = mkdtempSync(join(tmpdir(), 'sacloud-qa-'))
  const dbg = 9600 + Math.floor(Math.random() * 300)
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--no-default-browser-check', `--user-data-dir=${profile}`,
    `--remote-debugging-port=${dbg}`, 'about:blank',
  ], { stdio: 'ignore' })

  let wsUrl = null
  for (let i = 0; i < 80; i += 1) {
    try {
      const tabs = await (await fetch(`http://127.0.0.1:${dbg}/json/list`)).json()
      const page = tabs.find((t) => t.type === 'page')
      if (page?.webSocketDebuggerUrl) { wsUrl = page.webSocketDebuggerUrl; break }
    } catch { /* 아직 */ }
    await sleep(250)
  }
  if (wsUrl === null) { console.log('크롬을 못 띄웠다'); chrome.kill(); return }

  const ws = new WebSocket(wsUrl)
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
  let id = 0
  const waiting = new Map()
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id && waiting.has(m.id)) {
      const { res, rej } = waiting.get(m.id); waiting.delete(m.id)
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result)
    }
  }
  const send = (method, params = {}) => new Promise((res, rej) => {
    id += 1; waiting.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params }))
  })

  await send('Page.enable')
  await send('Runtime.enable')

  const report = []
  for (const [w, tag] of WIDTHS) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: w < 700 })
    for (const [name, path] of PAGES) {
      await send('Page.navigate', { url: BASE + path })
      await sleep(4200)
      let probe
      try {
        const r = await send('Runtime.evaluate', { expression: PROBE, returnByValue: true, awaitPromise: false })
        probe = JSON.parse(r.result?.value ?? '{}')
      } catch (err) {
        report.push({ name, tag, error: String(err).slice(0, 120) })
        continue
      }
      const shot = await send('Page.captureScreenshot', { format: 'png' })
      const file = join(OUT, `${tag}-${name}.png`)
      writeFileSync(file, Buffer.from(shot.data, 'base64'))
      report.push({ name, tag, ...probe, file })
    }
  }

  ws.close(); chrome.kill(); await sleep(300)
  try { rmSync(profile, { recursive: true, force: true }) } catch { /* 지워지면 좋고 */ }

  /* ── 보고 ── */
  for (const r of report) {
    const head = `[${r.tag === 'm' ? '폰 390' : 'PC 1280'}] ${r.name}`
    if (r.error) { console.log(`${head}  ✗ ${r.error}`); continue }
    const over = r.scrollW > r.clientW + 1
    const bits = []
    if (over) bits.push(`★가로스크롤 ${r.scrollW}>${r.clientW}★`)
    if (r.clipped?.length) bits.push(`짤림 ${r.clipped.length}`)
    if (r.gaps?.length) bits.push(`빈틈 ${r.gaps.length}`)
    if (r.overlaps?.length) bits.push(`겹침 ${r.overlaps.length}`)
    if (r.tiny?.length) bits.push(`작은글씨 ${r.tiny.length}`)
    console.log(`${head}  높이 ${r.height}  ${bits.length ? bits.join(' · ') : '깨끗'}`)
    for (const c of r.clipped ?? []) console.log(`    짤림  ${c.where}  ${c.need}px 를 ${c.have}px 칸에`)
    for (const g of r.gaps ?? []) console.log(`    빈틈  ${g.gap}px  ${g.left}  ↔  ${g.right}`)
    for (const o of r.overlaps ?? []) console.log(`    겹침  ${o.a}  ×  ${o.b}`)
    for (const t of r.tiny ?? []) console.log(`    작은글씨  ${t.size}px  ${t.where}`)
  }
  process.exit(0)
}

run()
