/**
 * ★event_icon 이 무기를 더 잘게 가르나★ (사장님 「최대한 보조무기 구별법을 찾아보고」 · §7-8)
 *   . /root/sacloud.env && node probe24.mjs 600
 *   weapon 값 × event_icon 주소(파일명) 조합을 센다 — 권총(보조무기) 아이콘이 따로 있으면 여기서 보인다.
 */
import { PrismaClient } from './packages/db/generated/client/index.js'
const p = new PrismaClient()
const N = Number(process.argv[2] ?? 600)
const rows = await p.barracksBattleLogRaw.findMany({ where: { status: 'ok' }, orderBy: { fetchedAt: 'desc' }, take: N, select: { payload: true } })
const combo = new Map()
const keys = new Set()
for (const r of rows) {
  const raw = r.payload && typeof r.payload === 'object' && 'raw' in r.payload ? r.payload.raw : r.payload
  for (const e of raw?.battleLog ?? []) {
    for (const k of Object.keys(e)) keys.add(k)
    const w = String(e.weapon ?? '').trim() || '(빈)'
    const tw = String(e.target_weapon ?? '').trim() || '(빈)'
    const icon = String(e.event_icon ?? '').split('/').pop() || '(빈)'
    const ticon = String(e.target_event_icon ?? '').split('/').pop() || '(없음)'
    const key = `${e.event_type ?? ''}/${e.target_event_type ?? ''} | weapon=${w} target_weapon=${tw} | icon=${icon} target_icon=${ticon}`
    combo.set(key, (combo.get(key) ?? 0) + 1)
  }
}
console.log('== 줄의 모든 키:', [...keys].join(', '))
console.log('== event_type | weapon | icon 조합 (상위 60)')
for (const [k, v] of [...combo].sort((a, b) => b[1] - a[1]).slice(0, 60)) console.log(String(v).padStart(7), k)
await p.$disconnect()
