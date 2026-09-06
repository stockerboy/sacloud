/**
 * ★낡은 임대가 만료되고 예약작업이 스스로 살아나는가★ (2026-09-06 · Part 4 최종확인).
 * ★읽기만 한다. 아무것도 띄우지 않는다.★
 *
 * 사장님: «사람이 직접 띄우지 말고 lease 만료 후 예약작업이 자연스럽게 시작하는지 확인해라»
 */
import { prisma } from '@sacloud/db'

const CUT = "TIMESTAMP '2026-09-02 22:00:00'"
const until = Date.now() + Number(process.argv[2] ?? 2700) * 1000
const stamp = () => new Date().toLocaleTimeString('ko-KR', { hour12: false })

let lastOwner: string | null = null
let lastAlive: boolean | null = null

while (Date.now() < until) {
  const [lease] = await prisma.$queryRawUnsafe<
    Array<{ owner: string; left: number; renew: number; blocked: number; startedAt: Date }>
  >(`
    SELECT "ownerId" AS owner,
           EXTRACT(EPOCH FROM ("expiresAt" - NOW()))::int AS left,
           "renewCount"::int AS renew, "blockedCount"::int AS blocked,
           "acquiredAt" AS "startedAt"
    FROM "CollectorLease" WHERE "name"='barracks-collect'`)
  const [raw] = await prisma.$queryRawUnsafe<Array<{ n: number; last: Date | null }>>(
    `SELECT COUNT(*)::int AS n, MAX("fetchedAt") AS last FROM "BarracksClanMatchRaw"`)

  const alive = (lease?.left ?? -1) > 0
  const owner = lease?.owner ?? '(없음)'
  if (owner !== lastOwner || alive !== lastAlive) {
    console.info(
      `${stamp()} · 임대 ${alive ? '★살아있음★' : '만료됨'} · 주인 ${owner}` +
        ` · 남은 ${lease?.left ?? 0}초 · 갱신 ${lease?.renew ?? 0} · 막은 ${lease?.blocked ?? 0}` +
        ` · 원문 ${raw?.n ?? 0}`,
    )
    if (owner !== lastOwner && lastOwner !== null) {
      console.info(`           ★★주인이 바뀌었다 — 새 Collector 가 임대를 잡았다★★`)
    }
    lastOwner = owner
    lastAlive = alive
  }
  await new Promise((r) => setTimeout(r, 30_000))
}

const [end] = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
  SELECT (SELECT COUNT(*)::int FROM "BarracksClanMatchRaw") AS "원문",
         (SELECT MAX("fetchedAt") FROM "BarracksClanMatchRaw") AS "원문마지막",
         (SELECT COUNT(*)::int FROM "Match" WHERE origin='3rd.supply' AND "startAt" >= ${CUT}) AS "미러신규",
         (SELECT COUNT(*)::int FROM "Match" WHERE "startAt" < ${CUT}) AS "과거경기",
         (SELECT COUNT(*)::int FROM "LeaguePlayerSeason") AS "근본시즌행"`)
console.info(`\n${stamp()} · 끝 — ${JSON.stringify(end)}`)
await prisma.$disconnect()
