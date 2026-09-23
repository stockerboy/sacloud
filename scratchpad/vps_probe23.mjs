/**
 * ★배틀로그 weapon 값 전수 — 보조무기(권총) 값이 따로 있나★ (사장님 2026-09-23 밤 · §7-8)
 *   VPS 에서:  . /root/sacloud.env && node probe23.mjs
 *   최근 원문 행 N 개의 battleLog 줄에서 weapon / target_weapon 값을 센다. DB 는 짧게만 읽는다.
 */
import { PrismaClient } from './packages/db/generated/client/index.js'
const p = new PrismaClient()
const N = Number(process.argv[2] ?? 600)
const rows = await p.barracksBattleLogRaw.findMany({ where: { status: 'ok' }, orderBy: { fetchedAt: 'desc' }, take: N, select: { payload: true, matchKey: true } })
const cnt = new Map()
const byType = new Map()
const sample = new Map()
let lines = 0
for (const r of rows) {
  const raw = r.payload && typeof r.payload === 'object' && 'raw' in r.payload ? r.payload.raw : r.payload
  const log = raw?.battleLog ?? []
  for (const e of log) {
    lines += 1
    for (const k of ['weapon', 'target_weapon']) {
      const v = e[k] === null || e[k] === undefined ? '(null)' : String(e[k]).trim() === '' ? '(빈)' : String(e[k]).trim()
      cnt.set(v, (cnt.get(v) ?? 0) + 1)
      const tk = `${v} | ${k} | ${e.event_type ?? ''}/${e.target_event_type ?? ''}`
      byType.set(tk, (byType.get(tk) ?? 0) + 1)
      if (!sample.has(v)) sample.set(v, JSON.stringify(e).slice(0, 260))
    }
  }
}
console.log(`원문 ${rows.length}행 · 줄 ${lines}`)
console.log('== weapon 값 (weapon+target_weapon 합)')
for (const [k, v] of [...cnt].sort((a, b) => b[1] - a[1])) console.log(String(v).padStart(8), k)
console.log('== 값 | 칸 | event_type/target_event_type')
for (const [k, v] of [...byType].sort((a, b) => b[1] - a[1])) console.log(String(v).padStart(8), k)
console.log('== 값별 표본 한 줄')
for (const [k, v] of sample) console.log(k, '→', v)
await p.$disconnect()
