/** ★화면이 받는 모양 그대로★ 근본 시즌이 나오는지 본다 (읽기 전용) */
import { prisma } from '@sacloud/db'
import { seasonDisplayLabel } from '@sacloud/contract'

const lp = await prisma.leaguePlayer.findFirst({
  where: { player: { sourcePlayerId: '1006959881' }, league: { slug: 'supply' } },
  select: { id: true, player: { select: { id: true, name: true } } },
})
if (!lp) throw new Error('표본 선수를 못 찾았다')

/* records.ts 와 ★같은 정렬·같은 라벨★ 로 뽑는다 */
const rows = await prisma.leaguePlayerSeason.findMany({
  where: { leaguePlayerId: lp.id },
  orderBy: [{ seasonRef: { startedAt: 'desc' } }, { id: 'asc' }],
  select: {
    season: true, rank: true, rankCount: true, win: true, lose: true, winRate: true, kdRate: true,
    source: true, sourceLeagueSlug: true,
    seasonRef: { select: { seasonType: true, number: true } },
  },
})
console.info(`선수 ${lp.player.name} (${lp.player.id}) — 화면이 받을 줄 ${rows.length}개\n`)
for (const r of rows) {
  console.info(
    `  season_label 「${seasonDisplayLabel(r.seasonRef)}」 · season_type ${r.seasonRef.seasonType}` +
      ` · season ${r.season} · ${r.rankCount}명중 ${r.rank}위 · 승률 ${r.winRate}% · 킬뎃 ${r.kdRate}%` +
      ` · 출처 ${r.source}/${r.sourceLeagueSlug}`,
  )
}
const leaked = rows.filter((r) => seasonDisplayLabel(r.seasonRef).includes('-'))
console.info(`\n${leaked.length === 0 ? '★내부 번호가 새지 않았다★' : '★★내부 번호가 샜다★★'}`)
await prisma.$disconnect()
