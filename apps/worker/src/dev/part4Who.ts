/** ★클랜번호 150531000663 은 누구인가★ (2026-09-06). ★읽기만 한다.★ */
import { prisma } from '@sacloud/db'
const NO = '150531000663'

console.info(`══ 매치목록 원문이 이 번호를 아는가 (${NO}) ══\n`)
const owner = await prisma.$queryRawUnsafe<Array<{ subject: string; name: string | null; n: number }>>(`
  SELECT "subject", "payload"->>'clan_name' AS name, COUNT(*)::int AS n
  FROM "BarracksClanMatchRaw" WHERE "status"='ok' AND "payload"->>'clan_no' = $1
  GROUP BY 1,2 ORDER BY 3 DESC LIMIT 10`, NO)
if (owner.length === 0) console.info('  ★한 줄도 없다 — 이 번호를 주체로 훑은 적이 없다★')
for (const o of owner) console.info(`  주체 ${o.subject} · 이름 ${o.name ?? '(없음)'} · ${o.n}줄`)

console.info('\n══ 배틀로그 teamList 가 이 번호를 어떻게 적나 ══\n')
const tl = await prisma.$queryRawUnsafe<Array<{ name: string | null; team: string | null; n: number }>>(`
  SELECT t->>'clan_name' AS name, t->>'team_name' AS team, COUNT(*)::int AS n
  FROM "BarracksBattleLogRaw" b,
       LATERAL jsonb_array_elements(
         CASE WHEN b."payload" ? 'teamList' THEN b."payload"->'teamList'
              ELSE b."payload"->'raw'->'teamList' END) AS t
  WHERE b."status"='ok' AND t->>'clan_no' = $1
  GROUP BY 1,2 ORDER BY 3 DESC LIMIT 10`, NO)
for (const t of tl) console.info(`  clan_name ${t.name ?? '(빈칸)'} · team_name ${t.team ?? '(빈칸)'} · ${t.n}줄`)

console.info('\n══ 이 번호가 낀 경기의 상대는 누구인가 ══\n')
const foe = await prisma.$queryRawUnsafe<Array<{ red: string; blue: string; n: number }>>(`
  SELECT rc.name AS red, bc.name AS blue, COUNT(*)::int AS n
  FROM "Match" m
  JOIN "LeagueClan" rl ON rl.id = m."redLeagueClanId" JOIN "Clan" rc ON rc.id = rl."clanId"
  JOIN "LeagueClan" bl ON bl.id = m."blueLeagueClanId" JOIN "Clan" bc ON bc.id = bl."clanId"
  WHERE m."sourceMatchId" IN (
    SELECT DISTINCT b."matchKey" FROM "BarracksBattleLogRaw" b,
      LATERAL jsonb_array_elements(
        CASE WHEN b."payload" ? 'teamList' THEN b."payload"->'teamList'
             ELSE b."payload"->'raw'->'teamList' END) AS t
    WHERE b."status"='ok' AND t->>'clan_no' = $1)
  GROUP BY 1,2 ORDER BY 3 DESC LIMIT 12`, NO)
for (const f of foe) console.info(`  ${f.red} vs ${f.blue} · ${f.n}경기`)

console.info('\n══ 그 경기들의 teamList 두 줄 전체 (표본 2건) ══\n')
const smp = await prisma.$queryRawUnsafe<Array<{ key: string; subject: string; tl: unknown }>>(`
  SELECT b."matchKey" AS key, b."subject",
         CASE WHEN b."payload" ? 'teamList' THEN b."payload"->'teamList'
              ELSE b."payload"->'raw'->'teamList' END AS tl
  FROM "BarracksBattleLogRaw" b
  WHERE b."status"='ok' AND b."matchKey" IN (
    SELECT DISTINCT b2."matchKey" FROM "BarracksBattleLogRaw" b2,
      LATERAL jsonb_array_elements(
        CASE WHEN b2."payload" ? 'teamList' THEN b2."payload"->'teamList'
             ELSE b2."payload"->'raw'->'teamList' END) AS t
    WHERE b2."status"='ok' AND t->>'clan_no' = $1)
  ORDER BY b."matchKey" DESC LIMIT 2`, NO)
for (const s of smp) console.info(`  ${s.key} (주체 ${s.subject})\n    ${JSON.stringify(s.tl)}`)
await prisma.$disconnect()
