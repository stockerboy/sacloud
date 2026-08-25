/** D-145 replay 검증 리포트 — 읽기 전용 (dry-run) */
import { prisma } from '@sacloud/db'
import { runRate } from '../jobs/rate.js'
import { readNexonConfig } from '@sacloud/nexon'

const ctx = { config: readNexonConfig(), client: null, dryRun: true, limit: null, resume: false }
const result = await runRate(ctx, { leagueSlug: 'supply' })
const names = new Map(
  (await prisma.player.findMany({ select: { id: true, name: true } })).map((p) => [p.id, p.name]),
)
const clanNames = new Map(
  (await prisma.leagueClan.findMany({ select: { id: true, clan: { select: { name: true } } } })).map((c) => [
    c.id,
    c.clan.name,
  ]),
)
console.info(`\n=== 대상 ===`)
console.info(`고려 ${result.matchesConsidered} · 래더 반영 ${result.matchesRated} · 새로 포함 ${result.newlyIncluded}`)
console.info('제외:', Object.entries(result.skipped).map(([k, v]) => `${k}=${v}`).join(' '))
console.info(`선수 ${result.report.players.length} · 클랜 ${result.report.clans.length}`)
console.info(`NaN/Infinity ${result.report.nonFinite} · 승률48%미만인데4000+ ${result.report.underMinWinRateAt4000}`)

const bands = [4000, 4100, 4300, 4500, 4700, 4800, 4900, 5000]
console.info('\n=== 개인 밴드 ===')
console.info(bands.map((b) => `${b}+:${result.report.players.filter((p) => p.display >= b).length}`).join(' '))

console.info('\n=== 개인 TOP 10 ===')
for (const [i, p] of result.report.players.slice(0, 10).entries()) {
  console.info(
    `#${i + 1} ${(names.get(p.playerId) ?? p.playerId).padEnd(14)} 표시 ${p.display}  내부 ${p.internal.toFixed(1)}` +
      `  판 ${p.games} (${p.win}승${p.lose}패 ${p.winRate.toFixed(0)}%)  신뢰도 ${(p.confidence * 100).toFixed(0)}%` +
      `  평균상대 ${p.opponentAvg.toFixed(0)}  강자전 ${p.strongWins}/${p.strongGames}  벌점 ${p.penalty.toFixed(0)}`,
  )
}
console.info('\n=== 클랜 TOP 10 ===')
for (const [i, c] of result.report.clans.slice(0, 10).entries()) {
  console.info(
    `#${i + 1} ${(clanNames.get(c.leagueClanId) ?? c.leagueClanId).padEnd(14)} 최종 ${c.display}` +
      `  Elo ${c.internal.toFixed(1)}  구성 +${c.composition.toFixed(1)}  벌점 ${c.penalty.toFixed(0)}` +
      `  판 ${c.games} (${c.win}승${c.lose}패)  평균상대 ${c.opponentAvg.toFixed(0)}  평균클랜원 ${c.avgMembers.toFixed(2)}`,
  )
}
await prisma.$disconnect()
