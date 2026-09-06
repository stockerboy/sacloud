/**
 * ★★원본이 지금 시즌7 카드를 주는가 — 표본만★★ (2026-09-06 · Part 5 ①②단계).
 *
 * > «원본이 실제로 시즌7을 주는지 ★확인하기 전 대량 요청 금지★»
 * > «★경기 미러는 절대 다시 켜지 않는다★» · «시즌 카드 조회만 한다»
 *
 * ── 이 도구가 하는 일 / 안 하는 일
 *   한다      `/leagueplayers/{id}/seasons` 를 ★표본 N명★ 만 부른다 (기본 5)
 *   안 한다   ★경기·매치 관련 경로는 한 건도 부르지 않는다★
 *             ★DB 에 한 줄도 안 쓴다★ (읽기만 한다)
 *
 *   대상은 ★이미 우리가 leaguePlayerId 를 알고 있는 supply 선수★ 뿐이라
 *   ★색인 호출(1단계)조차 하지 않는다★ — 선수당 요청 ★한 번★ 이다.
 */
import { readFileSync } from 'node:fs'
import { supplyGet } from '../lib/supplyClient.js'
import type { SupplySeasonRecord, SupplySeasonRow } from '../jobs/supplySeasons.js'

const SAMPLE = Number(process.argv[2] ?? 5)
const FILE = '../../packages/db/data/supply-seasons-supply.seasons.jsonl'

/* ★이미 받아 둔 파일에서 leaguePlayerId 를 꺼낸다 — 색인 요청을 안 하려고 */
const lines = readFileSync(FILE, 'utf8').split('\n').filter((l) => l.trim())
const picked: SupplySeasonRecord[] = []
/* 시즌 6 카드가 있던 선수를 고른다 — ★활동한 선수라야 시즌7 도 있을 법하다★ */
for (const line of lines) {
  if (picked.length >= SAMPLE) break
  try {
    const rec = JSON.parse(line) as SupplySeasonRecord
    if (rec.league_slug !== 'supply') continue
    if (!rec.raw?.some((r) => r.season === 6)) continue
    picked.push(rec)
  } catch {
    /* 깨진 줄은 건너뛴다 */
  }
}

console.info(`══ 표본 ${picked.length}명 · ★선수당 요청 1번★ · 경기 경로는 안 부른다 ══\n`)

let withSeven = 0
const seasonsSeen = new Set<number>()
for (const rec of picked) {
  const path = `/leagueplayers/${rec.league_player_id}/seasons`
  try {
    const res = await supplyGet<SupplySeasonRow[]>(path)
    const rows = Array.isArray(res.data) ? res.data : []
    const nums = rows.map((r) => r.season).sort((a, b) => a - b)
    for (const n of nums) seasonsSeen.add(n)
    const seven = rows.find((r) => r.season === 7)
    if (seven) withSeven += 1
    console.info(
      `  선수 ${rec.player_id} (leaguePlayerId ${rec.league_player_id})\n` +
        `    예전에 받은 시즌 ${rec.raw.map((r) => r.season).sort((a, b) => a - b).join(',')}\n` +
        `    ★지금 오는 시즌 ${nums.join(',') || '(없음)'}★` +
        (seven ? `\n    ★시즌7★ ${JSON.stringify(seven)}` : `\n    ★시즌7 없음★`),
    )
  } catch (e) {
    console.info(`  선수 ${rec.player_id} — ★못 받았다★ ${(e as Error).message}`)
  }
}

console.info(
  `\n══ 결과 ══\n  표본 ${picked.length}명 중 ★시즌7 카드가 온 선수 ${withSeven}명★\n` +
    `  응답에 나타난 시즌 번호 전체: ${[...seasonsSeen].sort((a, b) => a - b).join(', ') || '(없음)'}`,
)
