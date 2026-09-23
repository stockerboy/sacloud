/**
 * ★라운드 승률 빈도표★ — 「살아 있는 인원 a:b 일 때 그 라운드를 누가 땄나」 를 전 배틀로그에서 센다
 * (2026-09-23 사장님 · 라운드 흐름 그래프 재료).
 *
 *   pnpm --filter @sacloud/worker exec tsx src/dev/roundOddsBuild.ts            # 표를 JSON 으로 찍는다
 *   pnpm --filter @sacloud/worker exec tsx src/dev/roundOddsBuild.ts --limit 500
 *
 * 아무것도 쓰지 않는다. 찍힌 JSON 을 `packages/contract/src/roundOdds.ts` 에 손으로 옮긴다
 * (표는 6×6 = 36칸이라 파일에 박아 두는 게 맞다 — 요청마다 셀 것이 아니다).
 *
 * ── 두 표를 낸다
 *   `sided`   키 `공격생존:수비생존` → { n, w }  (w = 공격이 그 라운드를 땄다)
 *   `plain`   키 `a:b`(a = 주인 팀 생존, b = 상대 생존) → { n, w } (w = 주인 팀이 땄다) — 진영을 모르는 라운드용
 *
 * ★한 라운드 안에서 같은 상태를 두 번 세지 않는다★ — 5:5 → 4:5 → 4:4 순서면 세 상태가 각각 한 번씩.
 * 라운드 시작 상태(teamSize:teamSize)도 센다. 마지막 죽음 뒤(한쪽 0)는 결과가 정해진 것이라 안 센다.
 *
 * 응답 하나(경기 하나)만 넣는다 — `win_flag` 가 응답 주인 기준이라서다 (`roundFlow.ts` 머리 참고).
 */
import { prisma } from '@sacloud/db'
import { clanByTeamNo, roundFlowOf, type RoundFlowEvent } from '@sacloud/nexon'

interface RawShape {
  battleLog?: RoundFlowEvent[]
  teamList?: { team_no?: string | null; clan_no?: string | null }[]
}
const rawOf = (payload: unknown): RawShape => {
  if (typeof payload !== 'object' || payload === null) return {}
  const holder = payload as { raw?: unknown }
  const raw = typeof holder.raw === 'object' && holder.raw !== null ? holder.raw : payload
  return raw as RawShape
}

type Cell = { n: number; w: number }
const bump = (table: Record<string, Cell>, key: string, won: boolean) => {
  const cell = table[key] ?? { n: 0, w: 0 }
  cell.n += 1
  if (won) cell.w += 1
  table[key] = cell
}

async function main() {
  const limitArg = process.argv.find((a) => a.startsWith('--limit'))
  const limit = limitArg ? Number(limitArg.split(/[= ]/)[1] ?? process.argv[process.argv.indexOf(limitArg) + 1]) : null

  const heads = await prisma.barracksBattleLogRaw.findMany({
    where: { status: 'ok' },
    select: { id: true, matchKey: true, subject: true },
    orderBy: { fetchedAt: 'asc' },
    ...(limit ? { take: limit } : {}),
  })
  const firstByKey = new Map<string, { id: string; subject: string }>()
  for (const h of heads) if (!firstByKey.has(h.matchKey)) firstByKey.set(h.matchKey, { id: h.id, subject: h.subject })

  const sided: Record<string, Cell> = {}
  const plain: Record<string, Cell> = {}
  let matches = 0
  let rounds = 0
  let sidedRounds = 0
  let unreadable = 0
  const ids = [...firstByKey.values()].map((v) => v.id)
  const subjectOf = new Map([...firstByKey.values()].map((v) => [v.id, v.subject]))
  for (let i = 0; i < ids.length; i += 200) {
    const rows = await prisma.barracksBattleLogRaw.findMany({ where: { id: { in: ids.slice(i, i + 200) } }, select: { id: true, payload: true } })
    for (const row of rows) {
      const raw = rawOf(row.payload)
      const events = raw.battleLog ?? []
      const clanByTeam = clanByTeamNo(raw.teamList ?? [])
      const teamNo = [...clanByTeam.entries()].find(([, no]) => no === subjectOf.get(row.id))?.[0]
      if (events.length === 0 || teamNo === undefined) {
        unreadable += 1
        continue
      }
      const flow = roundFlowOf({ events, teamNo })
      if (flow === null) {
        unreadable += 1
        continue
      }
      matches += 1
      for (const r of flow.rounds) {
        if (r.winner === null) continue
        rounds += 1
        let mine = flow.teamSize.mine
        let foe = flow.teamSize.foe
        const seen = new Set<string>()
        const states: [number, number][] = [[mine, foe]]
        for (const d of r.deaths) {
          if (d.team === 'mine') mine -= 1
          else foe -= 1
          if (mine <= 0 || foe <= 0) break
          states.push([mine, foe])
        }
        const mineWon = r.winner === 'mine'
        if (r.defence !== null) sidedRounds += 1
        for (const [a, b] of states) {
          const key = `${a}:${b}`
          if (seen.has(key)) continue
          seen.add(key)
          bump(plain, key, mineWon)
          if (r.defence !== null) {
            const attackIsMine = r.defence === 'foe'
            const att = attackIsMine ? a : b
            const def = attackIsMine ? b : a
            bump(sided, `${att}:${def}`, attackIsMine ? mineWon : !mineWon)
          }
        }
      }
    }
  }
  const sort = (t: Record<string, Cell>) => Object.fromEntries(Object.entries(t).sort(([a], [b]) => a.localeCompare(b)))
  process.stdout.write(
    JSON.stringify({ builtAt: new Date().toISOString(), matches, rounds, sidedRounds, unreadable, sided: sort(sided), plain: sort(plain) }, null, 2) + '\n',
  )
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
