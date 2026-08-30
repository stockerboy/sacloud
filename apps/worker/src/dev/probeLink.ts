import { prisma } from '@sacloud/db'
async function main() {
  console.log('count:', await prisma.barracksBattleLogRaw.count({ where: { subjectKind: 'clan', status: 'ok' } }))
  console.log('findMany:', (await prisma.barracksBattleLogRaw.findMany({ where: { subjectKind: 'clan', status: 'ok' }, select: { id: true } })).length)
  console.log('all count:', await prisma.barracksBattleLogRaw.count())
  const dup = await prisma.barracksBattleLogRaw.groupBy({ by: ['matchKey', 'subject'], where: { subjectKind: 'clan', status: 'ok' }, _count: { _all: true } })
  console.log('distinct (matchKey,subject):', dup.length, 'with >1 payloadHash:', dup.filter((d) => d._count._all > 1).length)
  await prisma.$disconnect()
}
void main()
