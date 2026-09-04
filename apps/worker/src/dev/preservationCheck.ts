/**
 * ★Pre-Part 0 — 「보존됐나」를 숫자로 답한다★ (2026-09-04).
 *
 * 동결은 ★새 것을 막는 일★ 이지 ★있던 것을 지우는 일이 아니다.★
 * 그 둘을 헷갈리면 사고가 난다. 그래서 ★과거 쪽 숫자를 따로 센다.★
 *
 * ⚠ ★읽기만 한다.★ 한 줄도 쓰지 않는다.
 */
import { prisma } from '@sacloud/db'
import { MIRROR_FREEZE_FROM } from '@sacloud/db/ops'

const q = async (label: string, sql: string, ...p: unknown[]) => {
  const rows = await prisma.$queryRawUnsafe(sql, ...p)
  console.info('\n### ' + label)
  console.info(JSON.stringify(rows, null, 1))
}

await q(
  '★과거 경기 (기준시각 이전) — 리그별. 이 값이 줄면 사고다★',
  `SELECT l.slug, m.origin, COUNT(*)::int AS n, MIN(m."startAt") AS oldest, MAX(m."startAt") AS newest
   FROM "Match" m JOIN "League" l ON l.id = m."leagueId"
   WHERE m."startAt" < $1 GROUP BY 1,2 ORDER BY 1,2`,
  MIRROR_FREEZE_FROM,
)

await q(
  '★과거 참가기록 (MatchPlayerStat)★',
  `SELECT COUNT(*)::int AS n FROM "MatchPlayerStat" s
   JOIN "Match" m ON m.id = s."matchId" WHERE m."startAt" < $1`,
  MIRROR_FREEZE_FROM,
)

await q(
  '★3rd.supply 지난시즌 카드 재료가 아직 있나 (Part 1 이 쓸 것)★',
  `SELECT
     (SELECT COUNT(*)::int FROM "LeaguePlayer" lp JOIN "League" l ON l.id=lp."leagueId" WHERE l.slug='supply') AS supply_league_players,
     (SELECT COUNT(*)::int FROM "LeaguePlayerSeason") AS season_cards_now,
     (SELECT COUNT(*)::int FROM "Player") AS players`,
)

await prisma.$disconnect()
