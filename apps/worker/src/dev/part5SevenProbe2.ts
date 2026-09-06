/**
 * ★원본의 「현재 시즌」이 시즌7인가 — 표본만★ (2026-09-06 · Part 5 ②단계).
 *
 * `/leagueplayers/{id}/seasons` 는 ★끝난 시즌만★ 준다 (표본 5명 전부 시즌7 없음).
 * 그러면 시즌7은 어디 있나 — ★선수 프로필(현재 시즌)★ 을 열어 본다.
 *
 * ⚠ ★경기 경로(`/players/{id}/matches` 등)는 부르지 않는다.★
 * ⚠ ★DB 에 한 줄도 안 쓴다.★
 */
import { readFileSync } from 'node:fs'
import { supplyGet } from '../lib/supplyClient.js'
import type { SupplySeasonRecord } from '../jobs/supplySeasons.js'

const SAMPLE = Number(process.argv[2] ?? 3)
const FILE = '../../packages/db/data/supply-seasons-supply.seasons.jsonl'
const lines = readFileSync(FILE, 'utf8').split('\n').filter((l) => l.trim())
const picked: SupplySeasonRecord[] = []
for (const line of lines) {
  if (picked.length >= SAMPLE) break
  try {
    const rec = JSON.parse(line) as SupplySeasonRecord
    if (rec.league_slug === 'supply' && rec.raw?.some((r) => r.season === 6)) picked.push(rec)
  } catch { /* 깨진 줄 */ }
}

console.info('══ 선수 프로필 — 원본이 「지금 시즌」으로 무엇을 주나 ══\n')
for (const rec of picked) {
  const path = `/leagues/supply/players/${rec.player_id}`
  try {
    const res = await supplyGet<Record<string, unknown>>(path)
    const d = (res.data ?? {}) as Record<string, unknown>
    console.info(`  선수 ${rec.player_id}`)
    console.info(`    칸 ${Object.keys(d).length}개 — ${Object.keys(d).join(' · ')}`)
    const pick = (k: string) => (k in d ? `${k}=${JSON.stringify(d[k])}` : '')
    const shown = ['id', 'season', 'season_no', 'rank', 'rank_count', 'win', 'lose', 'win_rate', 'kill', 'death', 'kd_rate', 'rating']
      .map(pick).filter(Boolean).join(' · ')
    console.info(`    ${shown || '(위 칸들이 없다)'}`)
  } catch (e) {
    console.info(`  선수 ${rec.player_id} — ★못 받았다★ ${(e as Error).message}`)
  }
}

console.info('\n══ 리그 정보에 시즌 번호가 있나 ══\n')
for (const p of ['/leagues/supply', '/leagues/supply/seasons']) {
  try {
    const res = await supplyGet<unknown>(p)
    const s = JSON.stringify(res.data)
    console.info(`  ${p} → ${s.length > 400 ? s.slice(0, 400) + ' …' : s}`)
  } catch (e) {
    console.info(`  ${p} → ★못 받았다★ ${(e as Error).message}`)
  }
}
