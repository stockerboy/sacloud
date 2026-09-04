/**
 * ★Part 1 — 숫자부터 맞춘다★ (2026-09-04).
 *
 * 사장님: «바로 5,514명을 최종값으로 확정하지 마라. 먼저 아래를 확인해라»
 *
 * ★적재하지 않는다. 읽고 세기만 한다.★
 */
import { prisma } from '@sacloud/db'
import { createReadStream, existsSync } from 'node:fs'
import { createInterface } from 'node:readline'

const DATA = '../../packages/db/data'

interface SeasonLine {
  player_id: string
  league_player_id: number
  league_slug: string
  raw: Array<{ season: number }>
}

async function readJsonl<T>(path: string): Promise<T[]> {
  if (!existsSync(path)) return []
  const out: T[] = []
  const rl = createInterface({ input: createReadStream(path) })
  for await (const line of rl) {
    const t = line.trim()
    if (t) out.push(JSON.parse(t) as T)
  }
  return out
}

const say = (s: string) => console.info(s)

/* ── ① 파일이 무엇을 담고 있나 ─────────────────────────────────── */
const seasons = await readJsonl<SeasonLine>(`${DATA}/supply-seasons-supply.seasons.jsonl`)
const lps = await readJsonl<{ player_id: string; league_player_id: number; player_name: string }>(
  `${DATA}/supply-seasons-supply.leagueplayers.jsonl`,
)

const queried = new Set(seasons.map((r) => r.player_id))
const withCard = new Set(seasons.filter((r) => r.raw.length > 0).map((r) => r.player_id))
const emptyCard = new Set([...queried].filter((p) => !withCard.has(p)))

say('══ ① 로컬 파일 ══')
say(`  seasons 줄수      ${seasons.length}`)
say(`  leagueplayers 줄수 ${lps.length}`)
say(`  조회한 선수(고유)  ${queried.size}`)
say(`  ★카드 있음★        ${withCard.size}`)
say(`  카드 없음(빈 배열)  ${emptyCard.size}`)
say(`  합계 검산          ${withCard.size + emptyCard.size} (= 조회한 선수)`)

/* ── ② 운영 DB 의 supply 리그 선수 ────────────────────────────── */
const rows = await prisma.$queryRawUnsafe<
  Array<{ playerId: string; sourcePlayerId: string | null; name: string; origin: string; lpCreated: Date }>
>(`
  SELECT p.id AS "playerId", p."sourcePlayerId", p.name, p.origin, lp."joinedAt" AS "lpCreated"
  FROM "LeaguePlayer" lp
  JOIN "Player" p ON p.id = lp."playerId"
  JOIN "League" l ON l.id = lp."leagueId"
  WHERE l.slug = 'supply'`)

say('')
say('══ ② 운영 DB · supply 리그 선수 ══')
say(`  LeaguePlayer 행    ${rows.length}`)
const withSource = rows.filter((r) => r.sourcePlayerId !== null)
say(`  sourcePlayerId 있음 ${withSource.length}`)
say(`  sourcePlayerId 없음 ${rows.length - withSource.length}  ← 원본 대조가 불가능한 선수`)

const byOrigin = new Map<string, number>()
for (const r of rows) byOrigin.set(r.origin, (byOrigin.get(r.origin) ?? 0) + 1)
say(`  origin 별: ${[...byOrigin].map(([k, v]) => `${k}=${v}`).join(' · ')}`)

/* ── ③ 조회 안 된 선수 ─────────────────────────────────────────── */
const notQueried = withSource.filter((r) => !queried.has(r.sourcePlayerId as string))
say('')
say('══ ③ ★조회하지 않은 선수★ ══')
say(`  운영에 있는데 파일에 없는 선수 ★${notQueried.length}명★`)
if (notQueried.length > 0) {
  const sorted = [...notQueried].sort((a, b) => a.lpCreated.getTime() - b.lpCreated.getTime())
  say(`  가장 이른 리그가입 ${sorted[0]?.lpCreated.toISOString()}`)
  say(`  가장 늦은 리그가입 ${sorted[sorted.length - 1]?.lpCreated.toISOString()}`)
  const cut = new Date('2026-08-28T01:00:00.000Z') // 파일을 받은 시각
  const after = sorted.filter((r) => r.lpCreated.getTime() >= cut.getTime()).length
  say(`  ★파일 수집(2026-08-28 01:00Z) 이후에 리그에 들어온 선수 ${after}명★`)
  say(`  그 전부터 있었는데 안 받은 선수 ${sorted.length - after}명`)
  say('  표본 5명:')
  for (const r of sorted.slice(0, 5)) {
    say(`    ${r.sourcePlayerId} · ${r.name} · 가입 ${r.lpCreated.toISOString()}`)
  }
}

/* ── ④ 파일에는 있는데 운영에 없는 선수 ────────────────────────── */
const sourceSet = new Set(withSource.map((r) => r.sourcePlayerId as string))
const inFileNotDb = [...queried].filter((p) => !sourceSet.has(p))
say('')
say('══ ④ 파일에는 있는데 운영 supply 리그에 없는 선수 ══')
say(`  ${inFileNotDb.length}명`)
const inFileNotDbWithCard = inFileNotDb.filter((p) => withCard.has(p))
say(`  그중 ★카드가 있는★ 선수 ${inFileNotDbWithCard.length}명  ← 적재할 자리가 없다`)

/* ── ⑤ 다른 리그 파일에 그 125명이 있나 ────────────────────────── */
const others = ['sanply', 'daerule']
say('')
say('══ ⑤ 못 받은 선수가 다른 로컬 파일에 있나 ══')
const missing = new Set(notQueried.map((r) => r.sourcePlayerId as string))
for (const slug of others) {
  const o = await readJsonl<SeasonLine>(`${DATA}/supply-seasons-${slug}.seasons.jsonl`)
  const hit = o.filter((r) => missing.has(r.player_id))
  say(`  ${slug}: ${hit.length}명 있다 (★그건 ${slug} 카드다 — 쓰면 안 된다★)`)
}
const profiles = await readJsonl<{ player_id?: string }>(`${DATA}/supply-player-profiles.jsonl`)
const profHit = profiles.filter((r) => r.player_id && missing.has(r.player_id))
say(`  supply-player-profiles: ${profHit.length}명 (★프로필이지 시즌 카드가 아니다★)`)

await prisma.$disconnect()
