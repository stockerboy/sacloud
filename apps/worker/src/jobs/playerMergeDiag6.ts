/** 결정 진단 — 넥슨 경기의 미러 쌍둥이 · 이름 노후화 규모. 읽기 전용. */
import { createInterface } from 'node:readline'
import { createReadStream, existsSync } from 'node:fs'
import path from 'node:path'
import { prisma } from '@sacloud/db'
import { REPO_ROOT } from '../lib/env.js'

async function main(): Promise<void> {
  console.log('## 넥슨 경기 136건 — 같은 startAt 의 미러 경기가 있는가')
  const nexonMatches = await prisma.match.findMany({
    where: { origin: 'nexon' },
    select: { id: true, startAt: true, sourceMatchId: true },
  })
  let twinCount = 0
  for (const m of nexonMatches) {
    const t = await prisma.match.count({ where: { origin: '3rd.supply', startAt: m.startAt } })
    if (t > 0) twinCount++
  }
  console.log(`넥슨경기 ${nexonMatches.length} · 같은 시각 미러 경기 있음 ${twinCount}`)

  /* --------- 이름 노후화: 프로필 파일(최신) 과 DB 이름 대조 --------- */
  const file = path.join(REPO_ROOT, 'packages', 'db', 'data', 'supply-player-profiles.jsonl')
  if (!existsSync(file)) {
    console.log('\n프로필 파일 없음:', file)
  } else {
    console.log('\n## 프로필 파일(최신 닉네임) ↔ DB Player.name 대조')
    const current = new Map<string, string>()
    const rl = createInterface({ input: createReadStream(file, 'utf8'), crlfDelay: Infinity })
    for await (const line of rl) {
      if (!line.trim()) continue
      try {
        const j = JSON.parse(line) as { player_id?: string; raw?: { name?: string } }
        if (j.player_id && typeof j.raw?.name === 'string') current.set(j.player_id, j.raw.name)
      } catch { /* 깨진 줄은 건너뛴다 */ }
    }
    console.log('프로필 건수:', current.size)

    const players = await prisma.player.findMany({
      where: { sourcePlayerId: { not: null } },
      select: { id: true, name: true, sourcePlayerId: true },
    })
    let same = 0
    let diff = 0
    const samples: Array<{ id: string; db: string; 최신: string }> = []
    const currentNames = new Map<string, string[]>()
    for (const p of players) {
      const cur = current.get(p.sourcePlayerId!)
      if (cur === undefined) continue
      if (cur === p.name) same++
      else {
        diff++
        if (samples.length < 15) samples.push({ id: p.sourcePlayerId!, db: p.name, 최신: cur })
      }
      const list = currentNames.get(cur) ?? []
      list.push(p.id)
      currentNames.set(cur, list)
    }
    console.log(`DB 이름 == 최신 프로필: ${same} · 다름: ${diff} · 프로필에 없음: ${players.length - same - diff}`)
    console.table(samples)

    /* 이름을 최신으로 고치면 같은 이름이 겹치는가 */
    let collide = 0
    for (const [, ids] of currentNames) if (ids.length > 1) collide++
    console.log('최신 이름 기준 동명이인 그룹:', collide)

    /* 잔재 48행의 이름이 최신 프로필 이름과 일치하는 미러 선수가 있는가 */
    console.log('\n## 잔재 행 이름 → 최신 프로필에서 같은 이름을 가진 sourcePlayerId')
    const leftovers = await prisma.player.findMany({
      where: { origin: 'nexon', sourcePlayerId: null },
      select: { id: true, name: true },
    })
    const byCurrentName = new Map<string, string[]>()
    for (const [pid, nm] of current) {
      const list = byCurrentName.get(nm) ?? []
      list.push(pid)
      byCurrentName.set(nm, list)
    }
    const rows = leftovers.map((l) => ({
      leftover: l.id,
      name: l.name,
      최신프로필매칭: (byCurrentName.get(l.name) ?? []).join(','),
    }))
    console.table(rows)
  }

  await prisma.$disconnect()
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })
