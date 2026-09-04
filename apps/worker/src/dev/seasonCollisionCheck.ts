/** ★원본 시즌 번호와 우리 시즌 번호가 부딪히나★ (2026-09-04 · Part 1) */
import { prisma } from '@sacloud/db'
import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'

const seasons = await prisma.$queryRawUnsafe<
  Array<{ number: number; seasonType: string; status: string; frozen: boolean; startedAt: Date }>
>(`SELECT s.number, s."seasonType", s.status, s.frozen, s."startedAt"
   FROM "Season" s JOIN "League" l ON l.id=s."leagueId" WHERE l.slug='supply' ORDER BY s.number`)

console.info('══ 우리 DB 의 supply 시즌 ══')
for (const s of seasons) {
  console.info(
    `  번호 ${String(s.number).padStart(3)} · ${s.seasonType.padEnd(8)} · ${s.status.padEnd(6)} · ` +
      `frozen=${s.frozen} · 시작 ${s.startedAt.toISOString().slice(0, 10)}`,
  )
}

const cards = new Map<number, number>()
const rl = createInterface({
  input: createReadStream('../../packages/db/data/supply-seasons-supply.seasons.jsonl'),
})
for await (const line of rl) {
  const t = line.trim()
  if (!t) continue
  const o = JSON.parse(t) as { raw: Array<{ season: number }> }
  for (const r of o.raw) cards.set(r.season, (cards.get(r.season) ?? 0) + 1)
}

console.info('')
console.info('══ 원본 카드의 시즌 번호 ══')
const have = new Map(seasons.map((s) => [s.number, s]))
let collide = 0
for (const [n, cnt] of [...cards].sort((a, b) => a[0] - b[0])) {
  const mine = have.get(n)
  if (mine && mine.seasonType !== 'legacy') {
    collide += cnt
    console.info(`  시즌 ${n} · 카드 ${cnt}장 · ★★부딪힌다 — 우리 「${mine.seasonType}」 시즌 ${n}★★`)
  } else if (mine) {
    console.info(`  시즌 ${n} · 카드 ${cnt}장 · 우리 legacy 시즌에 들어간다`)
  } else {
    console.info(`  시즌 ${n} · 카드 ${cnt}장 · 새 legacy 시즌을 만든다`)
  }
}
console.info('')
console.info(`★부딪히는 카드 ${collide}장★`)
await prisma.$disconnect()
