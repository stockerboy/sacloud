/**
 * ★★Match.seasonId 바로잡기 — dry-run★★ (2026-09-06 · Part 5 ④단계 · 사장님 지시).
 * ★읽기만 한다. 한 줄도 안 쓴다.★
 *
 * > «실제 경기 시각 기준으로 수정한다» · «★단, 바로 쓰지 말고 먼저 dry-run 한다★»
 * > «합계가 맞아야 한다»
 *
 * ── ★규칙은 하나뿐이다★ (사장님 지시 6)
 *   `seasonWindowAt(startAt)` — `packages/contract/src/seasonWindow.ts` 의 그 함수다.
 *   ★화면이 쓰는 창과 같은 값★ 이라 DB 와 화면이 갈라질 수 없다.
 */
import { prisma } from '@sacloud/db'
import { seasonWindowAt } from '@sacloud/contract'

const CHUNK = 20_000

/* 리그 → (시즌번호 → Season.id) */
const seasonOf = new Map<string, Map<number, string>>()
for (const s of await prisma.season.findMany({
  select: { id: true, leagueId: true, number: true },
})) {
  if (!seasonOf.has(s.leagueId)) seasonOf.set(s.leagueId, new Map())
  seasonOf.get(s.leagueId)?.set(s.number, s.id)
}
const leagueSlug = new Map(
  (await prisma.league.findMany({ select: { id: true, slug: true } })).map((l) => [l.id, l.slug]),
)

type Row = { id: string; leagueId: string; startAt: Date; seasonId: string | null }
const numberOfSeasonId = new Map<string, number>()
for (const [, m] of seasonOf) for (const [num, id] of m) numberOfSeasonId.set(id, num)

/* 세는 통 */
const move = new Map<string, number>()      // "리그 지금→바뀜" → 수
const keep = new Map<string, number>()      // 이미 맞는 것
const stuck = new Map<string, number>()     // ★자동으로 못 고치는 것★
let total = 0
let wrongCloud0Past = 0
let missingAfterCut = 0

const CUT = new Date('2026-09-03T07:00:00+09:00')

let cursor: string | null = null
for (;;) {
  const page: Row[] = await prisma.match.findMany({
    where: cursor ? { id: { gt: cursor } } : {},
    select: { id: true, leagueId: true, startAt: true, seasonId: true },
    orderBy: { id: 'asc' },
    take: CHUNK,
  })
  if (page.length === 0) break
  cursor = page[page.length - 1]?.id ?? null

  for (const m of page) {
    total += 1
    const slug = leagueSlug.get(m.leagueId) ?? '(모름)'
    const now = m.seasonId ? (numberOfSeasonId.get(m.seasonId) ?? null) : null
    const want = seasonWindowAt(m.startAt)

    if (m.startAt < CUT && now === 0) wrongCloud0Past += 1
    if (m.startAt >= CUT && m.seasonId === null) missingAfterCut += 1

    if (want === null) {
      stuck.set(`${slug} · 창 밖(시각 ${m.startAt.toISOString().slice(0, 10)})`,
        (stuck.get(`${slug} · 창 밖`) ?? 0) + 1)
      continue
    }
    const targetId = seasonOf.get(m.leagueId)?.get(want.number)
    if (!targetId) {
      const k = `${slug} · Season 행 없음(번호 ${want.number})`
      stuck.set(k, (stuck.get(k) ?? 0) + 1)
      continue
    }
    if (targetId === m.seasonId) {
      keep.set(slug, (keep.get(slug) ?? 0) + 1)
      continue
    }
    const k = `${slug} · ${now === null ? '없음' : now} → ${want.number}`
    move.set(k, (move.get(k) ?? 0) + 1)
  }
}

const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0)
console.info('══ ★고칠 것★ (리그 · 지금 시즌번호 → 바뀔 시즌번호) ══\n')
for (const [k, n] of [...move].sort()) console.info(`  ${k.padEnd(34)} ${String(n).padStart(7)}건`)
console.info(`  ${'─'.repeat(44)}`)
console.info(`  ${'고칠 것 합계'.padEnd(34)} ${String(sum(move)).padStart(7)}건`)

console.info('\n══ 이미 맞는 것 ══\n')
for (const [k, n] of [...keep].sort()) console.info(`  ${k.padEnd(34)} ${String(n).padStart(7)}건`)
console.info(`  ${'그대로 둘 것 합계'.padEnd(33)} ${String(sum(keep)).padStart(7)}건`)

console.info('\n══ ★자동으로 못 고치는 것★ ══\n')
if (stuck.size === 0) console.info('  ★0건★')
for (const [k, n] of [...stuck].sort()) console.info(`  ${k.padEnd(34)} ${String(n).padStart(7)}건`)

console.info('\n══ 합이 맞나 ══\n')
const all = sum(move) + sum(keep) + sum(stuck)
console.info(`  전체 Match ${total.toLocaleString()}건`)
console.info(`  고칠 것 ${sum(move).toLocaleString()} + 그대로 ${sum(keep).toLocaleString()} + 못 고침 ${sum(stuck).toLocaleString()} = ${all.toLocaleString()}`)
console.info(`  ${all === total ? '★맞는다★' : '★★안 맞는다★★'}`)

console.info('\n══ 사장님이 물으신 두 숫자 ══\n')
console.info(`  기준시각 이전인데 Cloud 0 이 붙은 Match     ★${wrongCloud0Past.toLocaleString()}건★`)
console.info(`  기준시각 이후인데 seasonId 가 빈 Match      ★${missingAfterCut.toLocaleString()}건★`)
await prisma.$disconnect()
