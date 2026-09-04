/**
 * ★스냅샷이 낡았나★ — 2026-08-28 에 「카드 없음」이던 선수를 다시 물어본다 (2026-09-04).
 *
 * ── 왜
 *   사장님이 아시던 규모는 ★5,623명★ 인데 우리 스냅샷은 ★5,514명★ 이다. 109명 차이다.
 *   ★그 차이가 「원본이 그 뒤로 바뀐 것」인지 아닌지를 재야 한다.★
 *   설명 안 된 차이를 그냥 두고 적재하지 않는다 (사장님 지시).
 *
 * ── 어떻게
 *   스냅샷에서 `raw: []` 였던 선수 중 ★표본★ 을 골라 `/leagueplayers/{id}/seasons` 만
 *   다시 부른다. ★색인은 이미 있으니 선수당 요청 1건★ 이다.
 *   한 명이라도 카드가 생겼으면 ★스냅샷이 낡은 것★ 이고, 0명이면 ★다른 이유★ 다.
 *
 * ⚠ ★경기는 한 건도 안 받는다.★ 과거 시즌 카드 확인 목적의 최소 요청이다.
 * ⚠ ★본 파일(.seasons.jsonl)을 건드리지 않는다.★ 결과는 따로 남긴다.
 */
import { createReadStream, existsSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { supplyGet } from '../lib/supplyClient.js'
import { log } from '../lib/log.js'

const CARDS = '../../packages/db/data/supply-seasons-supply.seasons.jsonl'
const OUT = '../../packages/db/data/supply-seasons-supply.staleprobe.json'
const SAMPLE = Number(process.env['PROBE_SAMPLE'] ?? 60)

interface Line {
  player_id: string
  league_player_id: number
  raw: unknown[]
}

const empties: Line[] = []
if (existsSync(CARDS)) {
  const rl = createInterface({ input: createReadStream(CARDS) })
  for await (const line of rl) {
    const t = line.trim()
    if (!t) continue
    const o = JSON.parse(t) as Line
    if (o.raw.length === 0 && o.league_player_id) empties.push(o)
  }
}
log(`스냅샷에서 「카드 없음」이던 선수 ${empties.length}명`)

/* ★골고루 뽑는다★ — 앞에서만 뽑으면 수집 순서에 치우친다 */
const step = Math.max(1, Math.floor(empties.length / SAMPLE))
const sample = empties.filter((_, i) => i % step === 0).slice(0, SAMPLE)
log(`표본 ${sample.length}명 · 요청 ${sample.length}건 (선수당 1건)`)

let nowHasCard = 0
let failed = 0
const changed: Array<{ player_id: string; seasons: number[] }> = []

for (const [i, row] of sample.entries()) {
  try {
    const res = await supplyGet<Array<{ season: number }>>(
      `/leagueplayers/${row.league_player_id}/seasons`,
    )
    const cards = res.data ?? []
    if (cards.length > 0) {
      nowHasCard += 1
      changed.push({ player_id: row.player_id, seasons: cards.map((c) => c.season) })
    }
  } catch (e) {
    failed += 1
    if (failed <= 3) log(`  실패 ${row.player_id}: ${(e as Error).message}`)
    /* ★첫 실패에서 멈추지 않는다★ — 표본이라 몇 건 빠져도 판정이 선다.
       다만 실패가 표본의 1/4을 넘으면 ★판정할 수 없다★ 고 말한다 */
    if (failed > sample.length / 4) {
      log('★실패가 너무 많다 — 여기서 멈춘다. 이 표본으로는 판정할 수 없다★')
      break
    }
  }
  if ((i + 1) % 20 === 0) log(`  ${i + 1}/${sample.length} (새 카드 ${nowHasCard} · 실패 ${failed})`)
}

log('')
log('══ 결과 ══')
log(`  표본 ${sample.length}명 · 실패 ${failed}건`)
log(`  ★스냅샷엔 없었는데 지금은 카드가 있는 선수 ${nowHasCard}명★`)
if (nowHasCard === 0) {
  log('  → ★원본이 그 사이에 바뀐 흔적이 없다.★ 109명 차이는 다른 이유다')
} else {
  const rate = nowHasCard / (sample.length - failed)
  log(`  → ★스냅샷이 낡았다.★ 비율 ${(rate * 100).toFixed(1)}%`)
  log(`     「카드 없음」 4,815명에 적용하면 대략 ★${Math.round(4815 * rate)}명★ 이 더 생긴다`)
}
writeFileSync(OUT, JSON.stringify({ probedAt: new Date().toISOString(), sample: sample.length, failed, nowHasCard, changed }, null, 1))
log(`  기록 ${OUT}`)
