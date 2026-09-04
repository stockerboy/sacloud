/** ★원본이 말하는 supply 리그 모수★ — 5,623 이 원본 숫자인지 본다. 요청 몇 건뿐이다 */
import { supplyGet } from '../lib/supplyClient.js'
import { log } from '../lib/log.js'

const paths = [
  '/leagues/supply/ranks/players?weapon=all&page=1',
  '/leagues/supply/ranks/players?page=1',
  '/leagues/supply',
]
for (const p of paths) {
  try {
    const res = await supplyGet<unknown>(p)
    const body = res as unknown as Record<string, unknown>
    const data = (body['data'] ?? null) as unknown
    const keys = data && typeof data === 'object' && !Array.isArray(data) ? Object.keys(data) : null
    log(`\n${p}`)
    log(`  최상위 칸: ${Object.keys(body).join(' · ')}`)
    if (Array.isArray(data)) log(`  data 는 배열 · 길이 ${data.length}`)
    else if (keys) log(`  data 칸: ${keys.join(' · ')}`)
    const text = JSON.stringify(body)
    for (const m of text.matchAll(/"(total|count|rank_count|player_count|total_count)":\s*(\d+)/g)) {
      log(`  ★${m[1]} = ${m[2]}★${m[2] === '5623' ? '  ←★★맞다★★' : ''}`)
    }
    log(`  앞 300자: ${text.slice(0, 300)}`)
  } catch (e) {
    log(`\n${p}\n  실패: ${(e as Error).message}`)
  }
}
