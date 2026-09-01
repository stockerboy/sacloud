import { readFileSync, writeFileSync } from 'node:fs'
const sel = JSON.parse(readFileSync('.tmp-marks/sel.json', 'utf8'))
const out = []
let ok = 0, fail = 0, bytes = 0
for (const c of sel) {
  const one = { league: c.league, slug: c.slug, name: c.name, rating: c.rating, division: c.division }
  for (const k of ['bg', 'front']) {
    try {
      const r = await fetch(c[k])
      if (!r.ok) { fail++; continue }
      const b = Buffer.from(await r.arrayBuffer())
      bytes += b.length
      one[k] = 'data:image/png;base64,' + b.toString('base64')
      ok++
    } catch { fail++ }
  }
  if (one.bg && one.front) out.push(one)
  await new Promise((r) => setTimeout(r, 60))
}
writeFileSync('.tmp-marks/marks.json', JSON.stringify(out))
console.log('받은 이미지', ok, '· 실패', fail, '· 원본 합계', (bytes / 1024).toFixed(0) + 'KB')
console.log('클랜', out.length, '· JSON', (readFileSync('.tmp-marks/marks.json').length / 1024).toFixed(0) + 'KB')
