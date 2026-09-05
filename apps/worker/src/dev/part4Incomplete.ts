/** ★10명이 안 찬 SPL 16건 — 원래 5대5 경기가 맞나★ (2026-09-05). ★읽기만 한다.★ */
import { prisma, type Prisma } from '@sacloud/db'
const CUT = "TIMESTAMP '2026-09-02 22:00:00'"
const payloadOf = (v: Prisma.JsonValue): { battleLog?: unknown } => {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return {}
  const h = v as { raw?: unknown; battleLog?: unknown }
  if (h.battleLog !== undefined) return h as { battleLog?: unknown }
  if (typeof h.raw === 'object' && h.raw !== null) return h.raw as { battleLog?: unknown }
  return {}
}
const rows = await prisma.$queryRawUnsafe<Array<{ key: string; slug: string }>>(`
  SELECT m."sourceMatchId" AS key, l.slug
  FROM "Match" m JOIN "League" l ON l.id = m."leagueId"
  LEFT JOIN (SELECT DISTINCT "matchId" FROM "MatchPlayerStat") x ON x."matchId" = m.id
  JOIN (SELECT DISTINCT "matchKey" FROM "BarracksBattleLogRaw"
        WHERE "subjectKind"='clan' AND "status"='ok') r ON r."matchKey" = m."sourceMatchId"
  WHERE m."startAt" >= ${CUT} AND m."supersededAt" IS NULL AND m.origin='nexon_barracks'
    AND x."matchId" IS NULL AND l.slug='supply' ORDER BY m."startAt" DESC`)
console.info(`  SPL 에서 라인업이 없는 ${rows.length}건 — 팀마다 몇 명이 보이나\n`)
const tally: Record<string, number> = {}
for (const r of rows) {
  const raws = await prisma.$queryRawUnsafe<Array<{ payload: Prisma.JsonValue }>>(
    `SELECT "payload" FROM "BarracksBattleLogRaw" WHERE "matchKey"=$1 AND "status"='ok'`, r.key)
  const byTeam = new Map<string, Set<string>>()
  for (const raw of raws)
    for (const e of (payloadOf(raw.payload).battleLog as Array<Record<string, unknown>>) ?? []) {
      for (const [t, u] of [
        [e['team_no'], e['str_usn']],
        [e['target_team_no'], e['target_str_usn']],
      ] as Array<[unknown, unknown]>) {
        const team = t === null || t === undefined ? null : String(t).trim()
        const usn = u === null || u === undefined ? null : String(u).trim()
        if (!team || !usn) continue
        if (!byTeam.has(team)) byTeam.set(team, new Set())
        byTeam.get(team)?.add(usn)
      }
    }
  const shape = [...byTeam.values()].map((v) => v.size).sort((a, b) => b - a).join('대')
  tally[shape] = (tally[shape] ?? 0) + 1
  console.info(`  ${r.key} · 팀 ${byTeam.size}개 · ★${shape}★`)
}
console.info('\n  모양별 개수:')
for (const [k, n] of Object.entries(tally).sort()) console.info(`    ${k} → ${n}건`)
await prisma.$disconnect()
