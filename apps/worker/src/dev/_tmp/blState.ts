/** 읽기 전용 — 배틀로그 원문 · 클랜번호 · 육각형 현황 */
import { prisma } from '@sacloud/db'
const main = async (): Promise<void> => {
  const where = process.env.SACLOUD_LABEL ?? '(DB)'
  const byKind = await prisma.barracksBattleLogRaw.groupBy({
    by: ['subjectKind'],
    _count: { _all: true },
  })
  const total = byKind.reduce((a, b) => a + b._count._all, 0)
  console.log(`[${where}] BarracksBattleLogRaw ${total}`, byKind.map((r) => `${r.subjectKind}=${r._count._all}`).join(' · '))
  const bySource: never[] = []
  void bySource
  console.log(`[${where}] BarracksClanNumber ${await prisma.barracksClanNumber.count()}`)
  const hex = await prisma.matchClanHexV2.groupBy({ by: ['formulaVersion'], _count: { _all: true } })
  for (const r of hex) console.log(`[${where}] MatchClanHexV2 ${r.formulaVersion} — ${r._count._all}`)
  const sum = await prisma.clanHexV2Summary.groupBy({ by: ['formulaVersion'], _count: { _all: true } })
  for (const r of sum) console.log(`[${where}] ClanHexV2Summary ${r.formulaVersion} — ${r._count._all}`)
  await prisma.$disconnect()
}
void main()
