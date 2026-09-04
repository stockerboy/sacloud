import { supplyGet } from '../lib/supplyClient.js'
import { log } from '../lib/log.js'
const paths = [
  '/leagues/1/ranks/players?weapon=all',
  '/leagues/1/ranks/players',
  '/leagues/1/ranks/overall',
]
for (const p of paths) {
  try {
    const res = await supplyGet<unknown>(p)
    const text = JSON.stringify(res)
    log(`\n${p}  (${text.length} bytes)`)
    const nums = new Set<string>()
    for (const m of text.matchAll(/"([a-z_]*(?:count|total)[a-z_]*)":\s*(\d+)/gi)) nums.add(`${m[1]}=${m[2]}`)
    log(`  숫자 칸: ${[...nums].slice(0, 12).join(' · ') || '(없음)'}`)
    if (text.includes('5623')) log('  ★★5623 이 응답 안에 있다★★')
    log(`  앞 240자: ${text.slice(0, 240)}`)
  } catch (e) {
    log(`\n${p}\n  실패: ${(e as Error).message}`)
  }
}
