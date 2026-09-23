import { PrismaClient } from './packages/db/generated/client/index.js'
const p = new PrismaClient()
const rows = await p.barracksBattleLogRaw.findMany({ where: { status: 'ok' }, orderBy: { fetchedAt: 'desc' }, take: 300, select: { payload: true } })
const seen = new Map()
for (const r of rows) {
  const raw = r.payload && typeof r.payload === 'object' && 'raw' in r.payload ? r.payload.raw : r.payload
  for (const e of raw?.battleLog ?? []) {
    const w = String(e.weapon ?? '').trim() || String(e.target_weapon ?? '').trim() || '(빈)'
    const key = `${w} | cat=${e.event_category ?? ''}/${e.target_event_category ?? ''}`
    const list = seen.get(key) ?? []
    if (list.length < 3) list.push(String(e.event_text ?? '').replace(/<[^>]+>/g, '').slice(0, 90))
    seen.set(key, list)
  }
}
for (const [k, v] of seen) console.log(k, '→', JSON.stringify(v))
await p.$disconnect()
