/**
 * ★표본 선수를 경기 한 건씩 되짚어 대조한다★ (2026-09-06 · Part 5). ★읽기만 한다.★
 *
 * > «표본 선수 여러 명을 골라 ★기존 3rd.supply 경기/참가기록과 직접 대조★ 해라»
 *
 * 집계 SQL 이 만든 값과, ★경기 줄을 하나씩 세어 만든 값★ 을 맞대 본다.
 * ★같은 SQL 로 두 번 세면 안 된다★ — 두 번째는 JS 가 줄 단위로 센다.
 */
import { prisma } from '@sacloud/db'
const FROM = new Date('2024-04-01T00:00:00Z')
const TO = new Date('2026-09-02T22:00:00Z')
const SAMPLE = Number(process.argv[2] ?? 5)

const league = await prisma.league.findFirstOrThrow({ where: { slug: 'supply' }, select: { id: true } })

/* 표본 — 판수가 많은 쪽에서 고른다 (많이 뛴 선수라야 어긋남이 드러난다) */
const picks = await prisma.$queryRawUnsafe<Array<{ playerId: string; name: string; games: number }>>(`
  SELECT ps."playerId", p.name, COUNT(*)::int AS games
    FROM "MatchPlayerStat" ps
    JOIN "Match" m ON m.id = ps."matchId"
    JOIN "Player" p ON p.id = ps."playerId"
   WHERE m.origin='3rd.supply' AND m."leagueId"=$1
     AND m."startAt" >= $2 AND m."startAt" < $3 AND m."supersededAt" IS NULL
   GROUP BY 1,2 ORDER BY 3 DESC LIMIT ${SAMPLE}`, league.id, FROM, TO)

let bad = 0
for (const p of picks) {
  /* ① 집계 SQL */
  const [agg] = await prisma.$queryRawUnsafe<
    Array<{ games: number; win: number; kill: number; death: number; sni: number; rif: number }>
  >(`
    SELECT COUNT(*)::int AS games,
           COUNT(*) FILTER (WHERE ps.side = m."winnerSide")::int AS win,
           COALESCE(SUM(ps.kill),0)::int AS kill, COALESCE(SUM(ps.death),0)::int AS death,
           COUNT(*) FILTER (WHERE ps.weapon = 1)::int AS sni,
           COUNT(*) FILTER (WHERE ps.weapon = 0)::int AS rif
      FROM "MatchPlayerStat" ps JOIN "Match" m ON m.id = ps."matchId"
     WHERE ps."playerId"=$1 AND m.origin='3rd.supply' AND m."leagueId"=$2
       AND m."startAt" >= $3 AND m."startAt" < $4 AND m."supersededAt" IS NULL`,
    p.playerId, league.id, FROM, TO)

  /* ② 줄을 하나씩 받아 ★JS 가 직접 센다★ */
  const rows = await prisma.matchPlayerStat.findMany({
    where: {
      playerId: p.playerId,
      match: {
        origin: '3rd.supply', leagueId: league.id,
        startAt: { gte: FROM, lt: TO }, supersededAt: null,
      },
    },
    select: { side: true, kill: true, death: true, weapon: true, match: { select: { winnerSide: true, startAt: true } } },
  })
  let win = 0, kill = 0, death = 0, sni = 0, rif = 0, outside = 0
  for (const r of rows) {
    if (r.side === r.match.winnerSide) win += 1
    kill += r.kill ?? 0
    death += r.death ?? 0
    if (r.weapon === 1) sni += 1
    if (r.weapon === 0) rif += 1
    if (r.match.startAt < FROM || r.match.startAt >= TO) outside += 1
  }
  const same =
    rows.length === agg?.games && win === agg?.win && kill === agg?.kill &&
    death === agg?.death && sni === agg?.sni && rif === agg?.rif && outside === 0
  if (!same) bad += 1
  const wr = rows.length ? ((win / rows.length) * 100).toFixed(1) : '-'
  const kd = kill + death ? ((kill / (kill + death)) * 100).toFixed(1) : '-'
  console.info(
    `  ${same ? '✔' : '✘'} ${p.name.padEnd(16)} ${rows.length}판 · ${win}승 ${rows.length - win}패 (승률 ${wr}%)` +
      ` · ${kill.toLocaleString()}킬 ${death.toLocaleString()}데스 (킬뎃 ${kd}%)` +
      ` · 스나 ${sni}판 · 라플 ${rif}판 · ★창 밖 ${outside}판★` +
      (same ? '' : `\n      집계=${JSON.stringify(agg)} vs 줄세기={games:${rows.length},win:${win},kill:${kill},death:${death},sni:${sni},rif:${rif}}`),
  )
}
console.info(`\n  표본 ${picks.length}명 중 ★어긋난 선수 ${bad}명★`)
await prisma.$disconnect()
