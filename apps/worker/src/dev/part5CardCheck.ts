/**
 * ★적재된 시즌7 카드를 경기까지 되짚어 대조한다★ (2026-09-06 · Part 5 ⑩). ★읽기만 한다.★
 */
import { prisma } from '@sacloud/db'
const FROM = new Date('2024-04-01T00:00:00+09:00')
const TO = new Date('2026-09-03T07:00:00+09:00')

const league = await prisma.league.findFirstOrThrow({ where: { slug: 'supply' }, select: { id: true } })
const season = await prisma.season.findFirstOrThrow({
  where: { leagueId: league.id, number: -107 },
  select: { id: true },
})

const cards = await prisma.leaguePlayerSeason.findMany({
  where: { seasonId: season.id },
  select: {
    season: true, rank: true, rankCount: true, rating: true,
    win: true, lose: true, kill: true, death: true, winRate: true, kdRate: true,
    games: true, assist: true, headshot: true, mvpCount: true, dropoutCount: true,
    rifleGames: true, rifleKill: true, rifleDeath: true,
    sniperGames: true, sniperKill: true, sniperDeath: true,
    source: true, sourceLeagueSlug: true, imported: true,
    leaguePlayer: { select: { playerId: true, player: { select: { name: true } } } },
  },
  orderBy: { games: 'desc' },
  take: 4,
})

let bad = 0
for (const c of cards) {
  const rows = await prisma.matchPlayerStat.findMany({
    where: {
      playerId: c.leaguePlayer.playerId,
      match: { origin: '3rd.supply', leagueId: league.id, startAt: { gte: FROM, lt: TO }, supersededAt: null },
    },
    select: { side: true, kill: true, death: true, weapon: true, mvp: true, dropout: true,
              assist: true, headshot: true, match: { select: { winnerSide: true } } },
  })
  let win = 0, kill = 0, death = 0, sniG = 0, sniK = 0, sniD = 0, rifG = 0, rifK = 0, rifD = 0, mvp = 0, drop = 0
  for (const r of rows) {
    if (r.side === r.match.winnerSide) win += 1
    kill += r.kill ?? 0
    death += r.death ?? 0
    if (r.mvp) mvp += 1
    if (r.dropout) drop += 1
    if (r.weapon === 1) { sniG += 1; sniK += r.kill ?? 0; sniD += r.death ?? 0 }
    if (r.weapon === 0) { rifG += 1; rifK += r.kill ?? 0; rifD += r.death ?? 0 }
  }
  const ok =
    c.games === rows.length && c.win === win && c.lose === rows.length - win &&
    c.kill === kill && c.death === death && c.mvpCount === mvp && c.dropoutCount === drop &&
    c.sniperGames === sniG && c.sniperKill === sniK && c.sniperDeath === sniD &&
    c.rifleGames === rifG && c.rifleKill === rifK && c.rifleDeath === rifD &&
    c.rank === null && c.rankCount === null && c.rating === null &&
    c.season === 7 && c.sourceLeagueSlug === 'supply' && c.imported === false
  if (!ok) bad += 1
  console.info(
    `  ${ok ? '✔' : '✘'} ${c.leaguePlayer.player.name.padEnd(16)} 카드 ${c.games}판 ${c.win}승 ${c.lose}패 ` +
      `${c.kill}킬 ${c.death}데스 (승률 ${c.winRate}% · 킬뎃 ${c.kdRate}%)\n` +
      `      경기되짚기 ${rows.length}판 ${win}승 ${rows.length - win}패 ${kill}킬 ${death}데스\n` +
      `      스나 ${c.sniperGames}판 ${c.sniperKill}킬 ${c.sniperDeath}데스 (되짚기 ${sniG}/${sniK}/${sniD}) · ` +
      `라플 ${c.rifleGames}판 ${c.rifleKill}킬 ${c.rifleDeath}데스 (되짚기 ${rifG}/${rifK}/${rifD})\n` +
      `      MVP ${c.mvpCount}(${mvp}) · 탈주 ${c.dropoutCount}(${drop}) · 어시 ${c.assist} · 헤드샷 ${c.headshot}\n` +
      `      ★순위 ${c.rank ?? 'null'} · 모수 ${c.rankCount ?? 'null'} · 래더 ${c.rating ?? 'null'}★ · 원본시즌 ${c.season} · imported ${c.imported}`,
  )
}
console.info(`\n  표본 ${cards.length}장 중 ★어긋난 카드 ${bad}장★`)
await prisma.$disconnect()
