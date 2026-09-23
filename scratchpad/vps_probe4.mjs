import { PrismaClient } from './packages/db/generated/client/index.js'
const p = new PrismaClient()
const since = new Date('2026-09-19T00:00:00Z')
/* deluxe 가 낀 원문 경기 — 9/19 이후 */
const parts = await p.nexonMatchParticipant.findMany({ where: { clanName: 'deluxe', match: { dateMatch: { gte: since } } }, select: { nexonMatchId: true, userName: true }, distinct: ['nexonMatchId'] })
const ids = [...new Set(parts.map((x) => x.nexonMatchId))]
console.log('deluxe raw matches since 9/19:', ids.length)
const ms = await p.nexonMatch.findMany({ where: { id: { in: ids } }, orderBy: { dateMatch: 'desc' }, select: { id: true, sourceMatchId: true, dateMatch: true, matchMode: true, matchType: true, participantCount: true, validationStatus: true, projectionStatus: true, projectionReason: true, projectedMatchId: true, participantCompleteness: true, official: true, participants: { select: { clanName: true, teamId: true }, } } })
for (const m of ms) {
  const clans = [...new Set(m.participants.map((x) => x.clanName))].join('/')
  console.log(' ', m.dateMatch?.toISOString().slice(5, 16), m.sourceMatchId, m.matchMode, m.matchType, 'n', m.participantCount, 'val', m.validationStatus, 'proj', m.projectionStatus, m.projectionReason ?? '', m.projectedMatchId ? 'MATCH' : '-', m.participantCompleteness ?? '', clans)
}
/* 전체 — 9/19 이후 원문의 투영 상태 분포 */
const g = await p.nexonMatch.groupBy({ by: ['projectionStatus', 'projectionReason'], where: { dateMatch: { gte: since } }, _count: { _all: true } })
console.log('ALL since 9/19 by projection:')
for (const r of g.sort((a, b) => b._count._all - a._count._all)) console.log('  ', r.projectionStatus, r.projectionReason ?? '-', r._count._all)
const v = await p.nexonMatch.groupBy({ by: ['validationStatus'], where: { dateMatch: { gte: since } }, _count: { _all: true } })
console.log('by validation:', JSON.stringify(v))
await p.$disconnect()
