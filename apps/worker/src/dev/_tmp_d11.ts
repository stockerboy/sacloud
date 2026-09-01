import { prisma } from '@sacloud/db'
const str = (v: unknown): string | null => {
  if (v === null || v === undefined) return null
  const s = String(v).trim(); return s === '' ? null : s
}
async function main() {
  const league = await prisma.league.findUnique({ where: { slug: 'nolink' }, select: { id: true } })
  const keys = (await prisma.$queryRawUnsafe<any[]>(`
    select distinct b."matchKey" from "BarracksBattleLogRaw" b
    join "Match" m on m."sourceMatchId"=b."matchKey" and m."leagueId"='${league!.id}'
    where b."subjectKind"='clan' and b."status"='ok' order by 1`)).map(r=>r.matchKey)
  console.log('nolink 과 이어진 배틀로그 경기:', keys.length)

  const hist = new Map<number, number>()      // 등장 인원(전체, 팀 무관)
  const histClean = new Map<number, number>() // rosterOf 가 남기는 인원
  const teamShapes = new Map<string, number>()
  let multiTeamPeople = 0, matchesWithMultiTeam = 0
  const dropped: Array<{ key: string; usn: string; teams: string[]; kill: number; death: number }> = []

  for (let i = 0; i < keys.length; i += 40) {
    const batch = keys.slice(i, i + 40)
    const rows = await prisma.$queryRawUnsafe<any[]>(`
      select distinct on ("matchKey") "matchKey", "payload" from "BarracksBattleLogRaw"
      where "subjectKind"='clan' and "status"='ok' and "matchKey" = any($1::text[])
      order by "matchKey", "fetchedAt" desc, "id"`, batch)
    for (const row of rows) {
      const ev = (row.payload?.battleLog ?? []) as any[]
      const seen = new Map<string, Set<string>>()
      const put = (u: unknown, t: unknown) => {
        const usn = str(u), team = str(t)
        if (usn === null || team === null) return
        if (!seen.has(usn)) seen.set(usn, new Set()); seen.get(usn)!.add(team)
      }
      for (const e of ev) { put(e.str_usn, e.team_no); put(e.target_str_usn, e.target_team_no) }
      hist.set(seen.size, (hist.get(seen.size) ?? 0) + 1)

      const clean = [...seen].filter(([, t]) => t.size === 1)
      histClean.set(clean.length, (histClean.get(clean.length) ?? 0) + 1)
      const sizes = new Map<string, number>()
      for (const [, t] of clean) { const k = [...t][0]!; sizes.set(k, (sizes.get(k) ?? 0) + 1) }
      teamShapes.set([...sizes.values()].sort().join('v'), (teamShapes.get([...sizes.values()].sort().join('v')) ?? 0) + 1)

      const multi = [...seen].filter(([, t]) => t.size > 1)
      if (multi.length) {
        matchesWithMultiTeam += 1; multiTeamPeople += multi.length
        if (dropped.length < 20) {
          // 떨어진 사람의 킬/데스를 센다 (killsOf 와 같은 중복제거)
          const kills = new Map<string, number>(), deaths = new Map<string, number>(), dedup = new Set<string>()
          for (const e of ev) {
            const sK = str(e.event_type) === 'kill', tK = str(e.target_event_type) === 'kill'
            if (sK === tK) continue
            const killer = sK ? str(e.str_usn) : str(e.target_str_usn)
            const victim = sK ? str(e.target_str_usn) : str(e.str_usn)
            if (!killer || !victim) continue
            const k = `${str(e.round)}:${victim}:${str(e.event_time) ?? ''}`
            if (dedup.has(k)) continue; dedup.add(k)
            kills.set(killer, (kills.get(killer) ?? 0) + 1); deaths.set(victim, (deaths.get(victim) ?? 0) + 1)
          }
          for (const [usn, t] of multi) dropped.push({ key: row.matchKey, usn, teams: [...t], kill: kills.get(usn) ?? 0, death: deaths.get(usn) ?? 0 })
        }
      }
    }
  }
  const show = (m: Map<number, number>) => [...m].sort((a,b)=>a[0]-b[0]).map(([k,v])=>`${k}명:${v}`).join('  ')
  console.log('등장 인원(원본 그대로) :', show(hist))
  console.log('rosterOf 뒤 인원       :', show(histClean))
  console.log('팀 모양                :', JSON.stringify([...teamShapes].sort((a,b)=>b[1]-a[1])))
  console.log('두 팀에 걸친 사람이 있는 경기:', matchesWithMultiTeam, '· 그런 사람 수:', multiTeamPeople)
  console.log('떨어진 사람 표본:', JSON.stringify(dropped.slice(0,20)))
  await prisma.$disconnect()
}
main()
