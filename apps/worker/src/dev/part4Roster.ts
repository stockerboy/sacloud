/**
 * ★10명이 안 차서 버린 경기 — 원문을 두 벌 다 읽으면 차나★ (2026-09-05). ★읽기만 한다.★
 *
 * 라인업 잡은 경기당 원문을 ★한 벌만★ 읽는다 (`DISTINCT ON (matchKey)`).
 * 그런데 양쪽 클랜이 각자 받아서 ★두 벌★ 인 경기가 있다. 합치면 명단이 차는가?
 */
import { prisma, type Prisma } from '@sacloud/db'
import {
  planLineup,
  LINEUP_TEAM_SIZE,
  type LineupEvent,
  type LineupTeamEntry,
} from '../lib/battlelogLineup.js'
import { iplClanNumberMap } from '../jobs/iplClanNumber.js'

const CUT = "TIMESTAMP '2026-09-02 22:00:00'"
const payloadOf = (v: Prisma.JsonValue): { battleLog?: unknown; teamList?: unknown } => {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return {}
  const h = v as { raw?: unknown; battleLog?: unknown; teamList?: unknown }
  if (h.battleLog !== undefined || h.teamList !== undefined) return h
  if (typeof h.raw === 'object' && h.raw !== null) return h.raw as { battleLog?: unknown }
  return {}
}
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])

const matches = await prisma.$queryRawUnsafe<
  Array<{ slug: string; leagueId: string; key: string; red: string; blue: string }>
>(`
  SELECT l.slug, l.id AS "leagueId", m."sourceMatchId" AS key,
         rc."clanId" AS red, bc."clanId" AS blue
  FROM "Match" m JOIN "League" l ON l.id = m."leagueId"
  JOIN "LeagueClan" rc ON rc.id = m."redLeagueClanId"
  JOIN "LeagueClan" bc ON bc.id = m."blueLeagueClanId"
  LEFT JOIN (SELECT DISTINCT "matchId" FROM "MatchPlayerStat") x ON x."matchId" = m.id
  JOIN (SELECT DISTINCT "matchKey" FROM "BarracksBattleLogRaw"
        WHERE "subjectKind"='clan' AND "status"='ok') r ON r."matchKey" = m."sourceMatchId"
  WHERE m."startAt" >= ${CUT} AND m."supersededAt" IS NULL AND m.origin='nexon_barracks'
    AND x."matchId" IS NULL AND l.slug IN ('nolink','supply','sanply')
  ORDER BY l.slug, m."startAt" DESC`)

const mapOf = new Map<string, Map<string, string>>()
for (const id of new Set(matches.map((m) => m.leagueId))) mapOf.set(id, await iplClanNumberMap(id))

let fixed = 0
const still: Record<string, number> = {}
console.info(`  라인업이 없는 경기 ${matches.length}건을 다시 본다\n`)
for (const m of matches) {
  const raws = await prisma.$queryRawUnsafe<Array<{ payload: Prisma.JsonValue }>>(
    `SELECT "payload" FROM "BarracksBattleLogRaw" WHERE "matchKey"=$1 AND "status"='ok'
     ORDER BY "fetchedAt" DESC`, m.key)
  const one = payloadOf(raws[0]?.payload ?? null)
  const merged = {
    battleLog: raws.flatMap((r) => arr<LineupEvent>(payloadOf(r.payload).battleLog)),
    teamList: raws.flatMap((r) => arr<LineupTeamEntry>(payloadOf(r.payload).teamList)),
  }
  const table = mapOf.get(m.leagueId) ?? new Map()
  const base = {
    resolveClanNo: (no: string) => table.get(no) ?? null,
    redClanId: m.red, blueClanId: m.blue, teamSize: LINEUP_TEAM_SIZE,
  }
  const a = planLineup({
    ...base,
    events: arr<LineupEvent>(one.battleLog),
    teamList: arr<LineupTeamEntry>(one.teamList),
  })
  const b = planLineup({ ...base, events: merged.battleLog, teamList: merged.teamList })
  if (!a.ok && b.ok) {
    fixed += 1
    console.info(`  ✔ ${m.slug.padEnd(8)} ${m.key} · 한 벌 ${a.reason} → ★두 벌 합치니 들어간다★ (원문 ${raws.length}벌)`)
  } else if (!b.ok) {
    still[`${m.slug} ${b.reason}`] = (still[`${m.slug} ${b.reason}`] ?? 0) + 1
  }
}
console.info(`\n  ★두 벌을 합치면 살아나는 경기 ${fixed}건★`)
console.info('  합쳐도 안 되는 것:')
for (const [k, n] of Object.entries(still).sort()) console.info(`    ${k} ${n}건`)
await prisma.$disconnect()
