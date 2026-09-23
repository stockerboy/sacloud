/**
 * ★스코어 → 경기 승률 빈도표★ — 「라운드 스코어가 a:b 일 때 결국 경기를 이긴 비율」 을 전 배틀로그에서 센다
 * (2026-09-23 사장님 · 시안 2 「이 경기를 이길 확률」 재료).
 *
 *   pnpm --filter @sacloud/worker exec tsx src/dev/scoreOddsBuild.ts
 *
 * 아무것도 쓰지 않는다. 찍힌 JSON 을 `packages/contract/src/scoreOdds.ts` 에 옮긴다.
 *
 * ── 세는 법
 *   라운드마다 「그 라운드가 열릴 때의 스코어」 `내승:상대승` 을 한 번 센다 (경기 시작 0:0 포함).
 *   `w` = 그 상태를 지난 경기를 ★결국 내가 이겼다★.
 *   경기 승자 = 라운드를 더 많이 딴 쪽. 같으면(무승부·중도 종료) 그 경기는 안 센다 — 지어내지 않는다.
 *   한 경기 안에서 같은 스코어는 한 번만 지난다(스코어는 단조 증가)라 중복은 없다.
 *
 *   응답 하나(경기 하나)만 넣는다 — `win_flag` 가 응답 주인 기준이라서다 (`roundFlow.ts` 머리).
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

async function main() {
  const heads = await prisma.barracksBattleLogRaw.findMany({
    where: { status: 'ok' },
    select: { id: true, matchKey: true, subject: true },
    orderBy: { fetchedAt: 'asc' },
  })
  const firstByKey = new Map<string, { id: string; subject: string }>()
  for (const h of heads) if (!firstByKey.has(h.matchKey)) firstByKey.set(h.matchKey, { id: h.id, subject: h.subject })

  const table: Record<string, Cell> = {}
  /* 전반/후반을 나눠서도 센다 — 같은 4:3 이라도 후반이면 남은 라운드가 적다 */
  const byHalf: Record<'first' | 'second', Record<string, Cell>> = { first: {}, second: {} }
  const bump = (t: Record<string, Cell>, key: string, won: boolean) => {
    const cell = t[key] ?? { n: 0, w: 0 }
    cell.n += 1
    if (won) cell.w += 1
    t[key] = cell
  }
  let matches = 0
  let ties = 0
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
      const known = flow.rounds.filter((r) => r.winner !== null)
      if (known.length === 0) {
        unreadable += 1
        continue
      }
      const mineTotal = known.filter((r) => r.winner === 'mine').length
      const foeTotal = known.length - mineTotal
      if (mineTotal === foeTotal) {
        ties += 1
        continue
      }
      const mineWon = mineTotal > foeTotal
      matches += 1
      let mine = 0
      let foe = 0
      for (const r of flow.rounds) {
        const key = `${mine}:${foe}`
        bump(table, key, mineWon)
        const half = flow.secondHalfFrom !== null && r.round >= flow.secondHalfFrom ? 'second' : 'first'
        bump(byHalf[half], key, mineWon)
        if (r.winner === 'mine') mine += 1
        else if (r.winner === 'foe') foe += 1
      }
      /* 마지막 라운드가 끝난 뒤의 스코어도 센다 — 그래프 끝점이 이 칸을 본다 */
      bump(table, `${mine}:${foe}`, mineWon)
    }
  }
  const sort = (t: Record<string, Cell>) => Object.fromEntries(Object.entries(t).sort(([a], [b]) => a.localeCompare(b)))
  process.stdout.write(
    JSON.stringify({ builtAt: new Date().toISOString(), matches, ties, unreadable, all: sort(table), first: sort(byHalf.first), second: sort(byHalf.second) }, null, 2) + '\n',
  )
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
