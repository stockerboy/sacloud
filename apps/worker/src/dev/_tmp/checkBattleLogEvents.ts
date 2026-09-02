/**
 * 「경기 분석」이 킬 이벤트가 없다고 하는데 정말 없는지 원문을 직접 센다.
 * 총괄 검증용 임시 스크립트 (커밋 대상 아님).
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // 1) 배틀로그 원문이 몇 건 있고, 그 안에 킬 이벤트가 있는 것이 몇 건인가
  const total = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
    `SELECT count(*)::bigint AS n FROM "BarracksBattleLogRaw"`,
  )
  console.log('배틀로그 원문 총건수:', Number(total[0].n))

  // 2) 표본 20건을 열어 이벤트 종류를 센다
  const rows = await prisma.$queryRawUnsafe<
    Array<{ matchKey: string; clanNo: string | null; raw: unknown }>
  >(
    `SELECT "matchKey", "clanNo", "raw"
     FROM "BarracksBattleLogRaw"
     ORDER BY "fetchedAt" DESC
     LIMIT 20`,
  )

  let withKill = 0
  let withoutKill = 0
  for (const r of rows) {
    const raw = r.raw as Record<string, unknown> | null
    const log = (raw?.battleLog ?? raw?.battlelog ?? raw?.result) as
      | Array<Record<string, unknown>>
      | undefined
    const arr = Array.isArray(log) ? log : []
    const types = new Map<string, number>()
    for (const e of arr) {
      const t = String(e.event_type ?? e.eventType ?? '?')
      types.set(t, (types.get(t) ?? 0) + 1)
    }
    const killish = [...types.entries()].filter(([t]) => /kill/i.test(t))
    if (killish.length > 0) withKill++
    else withoutKill++
    console.log(
      `${r.matchKey} clan=${r.clanNo ?? '-'} 이벤트 ${arr.length}건`,
      JSON.stringify(Object.fromEntries(types)),
      arr.length > 0 ? `첫칸=${JSON.stringify(Object.keys(arr[0] ?? {}))}` : '',
    )
  }
  console.log(`표본 20건 중 킬이벤트 있음 ${withKill} · 없음 ${withoutKill}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
