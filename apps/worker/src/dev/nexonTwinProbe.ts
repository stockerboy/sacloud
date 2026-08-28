/**
 * 넥슨 재구성 경기가 미러 경기의 **중복**인지 규모를 잰다 — 읽기만 한다.
 *
 * 왜 재는가 — `playerMerge` 는 잔재 행의 참가행을 진짜 선수에게 옮긴다.
 * 그런데 그 참가행이 붙은 넥슨 경기가 미러 경기와 **같은 경기**라면,
 * 옮긴 뒤 그 선수는 한 경기를 두 번 뛴 것이 된다 (판수·킬 중복 계상).
 *
 * 여기서 세는 것 —
 *   1. 넥슨 경기 중 경기번호 앞 12자리(YYMMDDHHMMSS)가 같은 미러 경기가 있는 것
 *   2. 그 쌍둥이 경기의 라인업 이름이 실제로 겹치는가 (같은 경기라는 증거)
 *   3. 병합으로 옮겨질 참가행 중 몇 건이 그런 중복 경기에 붙어 있는가
 */
import { prisma } from '@sacloud/db'
import { planPlayerMerge } from '../jobs/playerMerge.js'

const KEY = 12

async function main(): Promise<void> {
  const nexon = await prisma.match.findMany({
    where: { origin: 'nexon' },
    select: { id: true, sourceMatchId: true, startAt: true },
  })
  console.log(`넥슨 재구성 경기 ${nexon.length}건`)

  let twinById = 0
  let twinWithOverlap = 0
  const twinOf = new Map<string, string>()

  for (const m of nexon) {
    const key = (m.sourceMatchId ?? m.id).slice(0, KEY)
    if (key.length < KEY) continue
    const twins = await prisma.match.findMany({
      where: { origin: '3rd.supply', id: { startsWith: key } },
      select: { id: true },
    })
    if (twins.length === 0) continue
    twinById++

    const mine = await prisma.matchPlayerStat.findMany({
      where: { matchId: m.id },
      select: { player: { select: { name: true } } },
    })
    const myNames = new Set(mine.map((r) => r.player.name))
    for (const t of twins) {
      const theirs = await prisma.matchPlayerStat.findMany({
        where: { matchId: t.id },
        select: { player: { select: { name: true } } },
      })
      const overlap = theirs.filter((r) => myNames.has(r.player.name)).length
      if (overlap >= 3) {
        twinWithOverlap++
        twinOf.set(m.id, t.id)
        break
      }
    }
  }

  console.log(`  경기번호 12자리가 같은 미러 경기 있음   ${twinById}`)
  console.log(`  그중 라인업 이름이 3명 이상 겹침(같은 경기) ${twinWithOverlap}`)

  const { merges } = await planPlayerMerge()
  let moved = 0
  let movedOnTwin = 0
  for (const m of merges) {
    const rows = await prisma.matchPlayerStat.findMany({
      where: { id: { in: m.statIds } },
      select: { matchId: true },
    })
    moved += rows.length
    movedOnTwin += rows.filter((r) => twinOf.has(r.matchId)).length
  }
  console.log(`\n병합으로 옮겨질 참가행 ${moved}건`)
  console.log(`  그중 중복(쌍둥이) 경기에 붙은 것 ${movedOnTwin}건  ← 옮기면 중복 계상`)

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
