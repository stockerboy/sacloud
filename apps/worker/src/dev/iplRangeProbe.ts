/**
 * **IPL 기록이 언제부터 언제까지 있나** (2026-09-03 · 읽기 전용 · 사장님 질문).
 *
 * ⚠ ★시간대를 KST 로 낸다.★ 전에 시간대를 잘못 다뤄 218건이 실제로는 13,993건이었던
 *   일이 있다 — 그 숫자가 지시서와 사장님 답까지 갔다. ★모든 날짜에 KST 를 명시한다.★
 * ⚠ ★「우리 DB」와 「병영수첩 원문」을 가른다.★ 사장님 질문은 「우리가 가진 것」이지만,
 *   ★병영수첩이 얼마나 과거를 주는지★ 를 알면 «더 받을 수 있나» 를 판단하실 수 있다.
 */
import { prisma } from '@sacloud/db'
const kst = (d: Date | null) =>
  d === null ? '없음' : new Date(d.getTime() + 9 * 3600000).toISOString().slice(0, 16).replace('T', ' ')

async function main() {
  console.info('══ 1 · ★우리 DB 의 IPL 경기★ (전부 KST) ══\n')
  const r = await prisma.$queryRaw<{ n: bigint; first: Date; last: Date; withLineup: bigint }[]>`
    SELECT count(*) AS n, min(m."startAt") AS first, max(m."startAt") AS last,
           count(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM "MatchPlayerStat" s WHERE s."matchId" = m."id"
           )) AS "withLineup"
      FROM "Match" m JOIN "League" l ON l."id" = m."leagueId" AND l."slug" = 'nolink'
  `
  const x = r[0]!
  const n = Number(x.n), wl = Number(x.withLineup)
  console.info(`  총 ★${n.toLocaleString()}건★`)
  console.info(`  ★${kst(x.first)} ~ ${kst(x.last)}★ (KST)`)
  console.info(`  그중 ★라인업(누가 뛰었는지)이 있는 경기 ${wl.toLocaleString()}건★ ${((100*wl)/n).toFixed(1)}%`)
  console.info(`  ★라인업이 없는 경기 ${(n-wl).toLocaleString()}건★ — 경기는 있는데 사람은 모른다`)

  console.info('\n══ 2 · ★월별★ (KST) ══\n')
  const by = await prisma.$queryRaw<{ mm: string; n: bigint; wl: bigint }[]>`
    SELECT to_char(m."startAt" AT TIME ZONE 'Asia/Seoul','YYYY-MM') AS mm,
           count(*) AS n,
           count(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM "MatchPlayerStat" s WHERE s."matchId" = m."id"
           )) AS wl
      FROM "Match" m JOIN "League" l ON l."id" = m."leagueId" AND l."slug" = 'nolink'
     GROUP BY 1 ORDER BY 1
  `
  const max = Math.max(...by.map(b => Number(b.n)), 1)
  for (const b of by) {
    const v = Number(b.n)
    console.info(`  ${b.mm}  ${v.toLocaleString().padStart(7)}건  (라인업 ${Number(b.wl).toLocaleString()})  ${'#'.repeat(Math.round(v/max*34))}`)
  }

  console.info('\n══ 3 · ★시즌별★ (KST) ══\n')
  const seasons: [string, string, string][] = [
    ['Beta   (3/5~7/1)', '2026-03-05', '2026-07-02'],
    ['시즌0 (7/2~9/30)', '2026-07-02', '2026-10-01'],
    ['시즌1 (10/1~)', '2026-10-01', '2027-01-01'],
  ]
  for (const [label, from, to] of seasons) {
    const s = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM "Match" m
       JOIN "League" l ON l."id" = m."leagueId" AND l."slug" = 'nolink'
       WHERE m."startAt" >= ${new Date(from + 'T00:00:00+09:00')}
         AND m."startAt" <  ${new Date(to + 'T00:00:00+09:00')}
    `
    console.info(`  ${label.padEnd(18)} ★${Number(s[0]!.n).toLocaleString()}건★`)
  }

  console.info('\n══ 4 · ★병영수첩 원문은 어디까지 있나★ (우리 DB 와 다르다) ══\n')
  const raw = await prisma.$queryRaw<{ n: bigint; first: string; last: string }[]>`
    SELECT count(DISTINCT "matchKey") AS n,
           min(substring("matchKey" from 1 for 6)) AS first,
           max(substring("matchKey" from 1 for 6)) AS last
      FROM "BarracksBattleLogRaw" WHERE "status" = 'ok'
  `
  const b = raw[0]!
  console.info(`  배틀로그 원문 ★${Number(b.n).toLocaleString()}건★ · 키 앞 6자리 ${b.first} ~ ${b.last} (YYMMDD)`)
  const ml = await prisma.$queryRaw<{ n: bigint; first: string; last: string }[]>`
    SELECT count(DISTINCT "matchKey") AS n,
           min(substring("matchKey" from 1 for 6)) AS first,
           max(substring("matchKey" from 1 for 6)) AS last
      FROM "BarracksClanMatchRaw" WHERE "status" = 'ok'
  `
  const m2 = ml[0]!
  console.info(`  매치목록 원문 ★${Number(m2.n).toLocaleString()}건★ · ${m2.first} ~ ${m2.last}`)
  console.info('\n  ★매치목록이 「무엇이 있는지」이고 배틀로그가 「누가 뛰었는지」다★')
}
main().catch(console.error).finally(() => prisma.$disconnect())
