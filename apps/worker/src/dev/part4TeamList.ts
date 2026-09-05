/** ★teamList 가 진짜 명단(인원수)을 아는가★ (2026-09-05). ★읽기만 한다.★ */
import { prisma, type Prisma } from '@sacloud/db'
const payloadOf = (v: Prisma.JsonValue): Record<string, unknown> => {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return {}
  const h = v as Record<string, unknown>
  if (h['teamList'] !== undefined) return h
  if (typeof h['raw'] === 'object' && h['raw'] !== null) return h['raw'] as Record<string, unknown>
  return {}
}
for (const key of ['260904042247124001', '260904033143124001', '260905222837124001']) {
  const raws = await prisma.$queryRawUnsafe<Array<{ payload: Prisma.JsonValue; subject: string }>>(
    `SELECT "payload","subject" FROM "BarracksBattleLogRaw" WHERE "matchKey"=$1 AND "status"='ok'`, key)
  console.info(`\n══ ${key} · 원문 ${raws.length}벌 ══`)
  for (const raw of raws) {
    const p = payloadOf(raw.payload)
    const tl = Array.isArray(p['teamList']) ? (p['teamList'] as Array<Record<string, unknown>>) : []
    const byTeam = new Map<string, number>()
    for (const row of tl) {
      const t = String(row['team_no'] ?? '')
      byTeam.set(t, (byTeam.get(t) ?? 0) + 1)
    }
    console.info(
      `  주체 ${raw.subject} · teamList ${tl.length}줄 · 팀별 ${[...byTeam].map(([t, n]) => `${t}:${n}명`).join(' ')}`,
    )
    if (tl[0]) console.info(`    한 줄의 칸 — ${Object.keys(tl[0]).join(' · ')}`)
  }
}
await prisma.$disconnect()
