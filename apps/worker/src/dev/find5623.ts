/** ★5,623 이 무엇을 센 값인가★ — 후보 정의를 전부 계산해 본다 (읽기만 한다) */
import { prisma } from '@sacloud/db'

const q = async (label: string, sql: string) => {
  const r = await prisma.$queryRawUnsafe<Array<{ n: number }>>(sql)
  const n = r[0]?.n ?? 0
  console.info(`${String(n).padStart(7)}  ${n === 5623 ? '★★맞다★★  ' : '          '}${label}`)
}

console.info('  값      후보 정의')
console.info('  ─────────────────────────────────────────────')

await q('supply LeaguePlayer 전체', `
  SELECT COUNT(*)::int AS n FROM "LeaguePlayer" lp JOIN "League" l ON l.id=lp."leagueId" WHERE l.slug='supply'`)

await q('supply LeaguePlayer · 승패가 하나라도 있는', `
  SELECT COUNT(*)::int AS n FROM "LeaguePlayer" lp JOIN "League" l ON l.id=lp."leagueId"
  WHERE l.slug='supply' AND (lp.win + lp.lose) > 0`)

await q('supply LeaguePlayer · 배치고사 끝난 (placement=false)', `
  SELECT COUNT(*)::int AS n FROM "LeaguePlayer" lp JOIN "League" l ON l.id=lp."leagueId"
  WHERE l.slug='supply' AND lp.placement = false`)

await q('supply 경기에 실제로 뛴 선수 (MatchPlayerStat 기준)', `
  SELECT COUNT(DISTINCT s."playerId")::int AS n FROM "MatchPlayerStat" s
  JOIN "Match" m ON m.id=s."matchId" JOIN "League" l ON l.id=m."leagueId" WHERE l.slug='supply'`)

await q('supply LeaguePlayer · 현재 클랜이 있는', `
  SELECT COUNT(*)::int AS n FROM "LeaguePlayer" lp JOIN "League" l ON l.id=lp."leagueId"
  WHERE l.slug='supply' AND lp."clanId" IS NOT NULL`)

await q('supply 등록클랜의 현재 소속 선수 (Player.clanId 기준)', `
  SELECT COUNT(DISTINCT p.id)::int AS n FROM "Player" p
  JOIN "LeagueClan" lc ON lc."clanId" = p."clanId"
  JOIN "League" l ON l.id = lc."leagueId"
  WHERE l.slug='supply' AND lc."expelledAt" IS NULL`)

await q('supply LeaguePlayer · rating 이 기본값(3000)이 아닌', `
  SELECT COUNT(*)::int AS n FROM "LeaguePlayer" lp JOIN "League" l ON l.id=lp."leagueId"
  WHERE l.slug='supply' AND lp.rating <> 3000`)

await q('supply LeaguePlayer · 파일 수집 이전 가입', `
  SELECT COUNT(*)::int AS n FROM "LeaguePlayer" lp JOIN "League" l ON l.id=lp."leagueId"
  WHERE l.slug='supply' AND lp."joinedAt" < TIMESTAMP '2026-08-28 01:00:00'`)

await q('전체 Player 중 sourcePlayerId 있고 supply 리그인', `
  SELECT COUNT(*)::int AS n FROM "LeaguePlayer" lp
  JOIN "Player" p ON p.id=lp."playerId" JOIN "League" l ON l.id=lp."leagueId"
  WHERE l.slug='supply' AND p."sourcePlayerId" IS NOT NULL`)

await prisma.$disconnect()
