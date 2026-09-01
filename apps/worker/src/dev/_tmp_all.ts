import { prisma } from '@sacloud/db'
const str = (v: unknown): string | null => {
  if (v === null || v === undefined) return null
  const s = String(v).trim(); return s === '' ? null : s
}
async function main() {
  const league = await prisma.league.findUnique({ where: { slug: 'nolink' }, select: { id: true } })
  const nolink = new Set((await prisma.$queryRawUnsafe<any[]>(`
    select distinct b."matchKey" k from "BarracksBattleLogRaw" b
    join "Match" m on m."sourceMatchId"=b."matchKey" and m."leagueId"='${league!.id}'
    where b."subjectKind"='clan'`)).map(r=>r.k))
  const keys = (await prisma.$queryRawUnsafe<any[]>(`
    select distinct "matchKey" k from "BarracksBattleLogRaw"
    where "subjectKind"='clan' and "status"='ok' order by 1`)).map(r=>r.k)
  console.log('클랜 배틀로그 고유 경기 전체:', keys.length, '· 그중 nolink:', nolink.size)

  const hist = new Map<string, Map<number, number>>()
  const shapes = new Map<string, number>()
  const extras: any[] = []
  let multiTeam = 0
  for (let i = 0; i < keys.length; i += 40) {
    const batch = keys.slice(i, i + 40)
    const rows = await prisma.$queryRawUnsafe<any[]>(`
      select distinct on ("matchKey") "matchKey", "payload" from "BarracksBattleLogRaw"
      where "subjectKind"='clan' and "status"='ok' and "matchKey" = any($1::text[])
      order by "matchKey", "fetchedAt" desc, "id"`, batch)
    for (const row of rows) {
      const grp = nolink.has(row.matchKey) ? 'nolink' : '그밖'
      const ev = (row.payload?.battleLog ?? []) as any[]
      const seen = new Map<string, Set<string>>()
      const put = (u: unknown, t: unknown) => {
        const usn = str(u), team = str(t)
        if (usn === null || team === null) return
        if (!seen.has(usn)) seen.set(usn, new Set()); seen.get(usn)!.add(team)
      }
      for (const e of ev) { put(e.str_usn, e.team_no); put(e.target_str_usn, e.target_team_no) }
      if (!hist.has(grp)) hist.set(grp, new Map())
      hist.get(grp)!.set(seen.size, (hist.get(grp)!.get(seen.size) ?? 0) + 1)
      if ([...seen.values()].some(t => t.size > 1)) multiTeam += 1
      const sizes = new Map<string, number>()
      for (const [, t] of seen) if (t.size === 1) { const k=[...t][0]!; sizes.set(k,(sizes.get(k)??0)+1) }
      const shape = [...sizes.values()].sort((a,b)=>a-b).join('v')
      shapes.set(`${grp} ${shape}`, (shapes.get(`${grp} ${shape}`) ?? 0) + 1)
      // 11명 경기 표본: 각자 킬/데스
      if (seen.size === 11 && extras.length < 3) {
        const kills=new Map<string,number>(), deaths=new Map<string,number>(), dedup=new Set<string>()
        for (const e of ev) {
          const sK = str(e.event_type)==='kill', tK = str(e.target_event_type)==='kill'
          if (sK===tK) continue
          const killer = sK?str(e.str_usn):str(e.target_str_usn), victim = sK?str(e.target_str_usn):str(e.str_usn)
          if(!killer||!victim) continue
          const k=`${str(e.round)}:${victim}:${str(e.event_time)??''}`
          if(dedup.has(k)) continue; dedup.add(k)
          kills.set(killer,(kills.get(killer)??0)+1); deaths.set(victim,(deaths.get(victim)??0)+1)
        }
        const nick=new Map<string,string>()
        for(const e of ev){ if(str(e.str_usn)&&str(e.user_nick)) nick.set(str(e.str_usn)!,str(e.user_nick)!)
                            if(str(e.target_str_usn)&&str(e.target_user_nick)) nick.set(str(e.target_str_usn)!,str(e.target_user_nick)!) }
        extras.push({ key: row.matchKey, grp, people: [...seen].map(([u,t])=>({nick:nick.get(u)??'?',team:[...t].join('/'),kill:kills.get(u)??0,death:deaths.get(u)??0})) })
      }
    }
  }
  for (const [g,m] of hist) console.log(`[${g}] 등장 인원 :`, [...m].sort((a,b)=>a[0]-b[0]).map(([k,v])=>`${k}명:${v}`).join('  '))
  console.log('두 팀에 걸친 사람이 있는 경기 (전체):', multiTeam)
  console.log('팀 모양 상위:', JSON.stringify([...shapes].sort((a,b)=>b[1]-a[1]).slice(0,10)))
  console.log('=== 11명 경기 표본 ===')
  for (const x of extras) console.log(x.grp, x.key, JSON.stringify(x.people))
  await prisma.$disconnect()
}
main()
