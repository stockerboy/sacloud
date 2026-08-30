/**
 * 아직 안 받은 **배틀로그 작업 목록**을 브라우저에 붙여 넣을 형태로 뽑는다 (D-200).
 *
 * ```
 * pnpm --filter @sacloud/worker exec tsx src/dev/battlelogWorklist.ts [건수]
 * ```
 *
 * 브라우저 한 줄에 붙여 넣을 수 있게 **클랜번호를 표로 빼고 번호로 참조한다**.
 * 경기키(18자) + `-` + 두 자리 번호 꼴이라 사람이 눈으로도 읽힌다.
 */
import { prisma } from '@sacloud/db'

async function main(): Promise<void> {
  const limit = Number(process.argv[2] ?? 600)

  const done = new Set(
    (
      await prisma.barracksBattleLogRaw.findMany({
        where: { subjectKind: 'clan' },
        select: { matchKey: true },
      })
    ).map((row) => row.matchKey),
  )

  const known = await prisma.barracksClanNumber.findMany({ select: { clanNo: true, clanId: true } })
  const leagueClans = await prisma.leagueClan.findMany({
    where: { clanId: { in: known.map((row) => row.clanId) } },
    select: { id: true, clanId: true },
  })
  const clanOfLeagueClan = new Map(leagueClans.map((row) => [row.id, row.clanId]))
  const noOfClan = new Map(known.map((row) => [row.clanId, row.clanNo]))

  const matches = await prisma.match.findMany({
    where: {
      sourceMatchId: { not: null },
      OR: [
        { redLeagueClanId: { in: [...clanOfLeagueClan.keys()] } },
        { blueLeagueClanId: { in: [...clanOfLeagueClan.keys()] } },
      ],
    },
    select: { sourceMatchId: true, redLeagueClanId: true, blueLeagueClanId: true },
    orderBy: { startAt: 'desc' },
  })

  const numbers: string[] = []
  const indexOf = new Map<string, number>()
  const parts: string[] = []
  for (const match of matches) {
    const key = match.sourceMatchId
    /* 양 팀이 다 아는 클랜이면 같은 경기가 두 번 나온다. 한 번만 받으면 된다 */
    if (!key || done.has(key)) continue
    done.add(key)
    const clanId =
      clanOfLeagueClan.get(match.redLeagueClanId) ?? clanOfLeagueClan.get(match.blueLeagueClanId)
    const clanNo = clanId ? noOfClan.get(clanId) : undefined
    if (!clanNo) continue
    let idx = indexOf.get(clanNo)
    if (idx === undefined) {
      idx = numbers.length
      numbers.push(clanNo)
      indexOf.set(clanNo, idx)
    }
    parts.push(`${key}-${String(idx).padStart(2, '0')}`)
    if (parts.length >= limit) break
  }

  console.info(`const C=${JSON.stringify(numbers)};`)
  console.info(`const P=${JSON.stringify(parts.join(' '))};`)
  console.error(`남은 후보 ${parts.length}건 · 아는 클랜 ${known.length}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
