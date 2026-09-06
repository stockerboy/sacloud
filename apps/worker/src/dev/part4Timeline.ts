/**
 * ★자동 복구 타임라인을 파일에 바로 적는다★ (2026-09-06 · Part 4 최종확인). ★읽기만 한다.★
 *
 * 파이프에 흘리면 버퍼에 갇혀 ★끝날 때까지 아무것도 안 보인다.★ 그래서 파일에 직접 적는다.
 */
import { prisma } from '@sacloud/db'
import { appendFileSync } from 'node:fs'

const OUT = process.argv[2] ?? 'timeline.txt'
const until = Date.now() + Number(process.argv[3] ?? 2400) * 1000
const put = (line: string) => {
  const t = new Date().toLocaleTimeString('ko-KR', { hour12: false })
  appendFileSync(OUT, `${t} ${line}\n`, 'utf8')
}

let last = ''
put('── 관측 시작 (아무것도 띄우지 않는다. 보기만 한다) ──')
while (Date.now() < until) {
  const [lease] = await prisma.$queryRawUnsafe<
    Array<{ owner: string; left: number; renew: number; blocked: number }>
  >(`
    SELECT "ownerId" AS owner, EXTRACT(EPOCH FROM ("expiresAt" - NOW()))::int AS left,
           "renewCount"::int AS renew, "blockedCount"::int AS blocked
      FROM "CollectorLease" WHERE "name"='barracks-collect'`)
  const [raw] = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
    `SELECT COUNT(*)::int AS n FROM "BarracksClanMatchRaw"`)

  const alive = (lease?.left ?? -1) > 0
  const key = `${lease?.owner ?? '-'}|${alive}|${lease?.blocked ?? 0}`
  if (key !== last) {
    put(
      `임대 ${alive ? '살아있음' : '★만료됨★'} · 주인 ${lease?.owner ?? '-'} · 남은 ${lease?.left ?? 0}초` +
        ` · 갱신 ${lease?.renew ?? 0} · 막은 ${lease?.blocked ?? 0} · 원문 ${raw?.n ?? 0}`,
    )
    last = key
  }
  await new Promise((r) => setTimeout(r, 20_000))
}
put('── 관측 끝 ──')
await prisma.$disconnect()
