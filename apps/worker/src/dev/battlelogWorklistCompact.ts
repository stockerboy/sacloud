/* ⚠ 이것은 **옛 방식**이다 (`CLAUDE.md` 10-4 — 방식을 바꾸면 이전 버전도 남긴다).
   `Match` 표에 있는 경기만, 시즌0 창 안에서, 한 줄로 즐여 뿌렸다.
   그런데 `Match` ∩ `BarracksClanMatchRaw` 는 1,340건뿐이라
   병영수첩이 가진 130,260건 중 1% 도 못 다룬다.
   전수조사는 `battlelogWorklist.ts` 가 한다. 이 파일은 기록으로 남긴다 */
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
import { season0MatchWhere } from '../lib/season0Window'

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

  /* **시즌0 창 안**만 받는다 (`docs/DECISIONS.md` D-175).
     아는 클랜이 뛴 경기는 30만 건이 넘는데, 지표도 포지션도 시즌0 창만 본다.
     창 밖을 받는 것은 요청을 버리는 것이다 */
  const matches = await prisma.match.findMany({
    where: {
      sourceMatchId: { not: null },
      ...season0MatchWhere(),
      OR: [
        { redLeagueClanId: { in: [...clanOfLeagueClan.keys()] } },
        { blueLeagueClanId: { in: [...clanOfLeagueClan.keys()] } },
      ],
    },
    select: {
      id: true,
      sourceMatchId: true,
      redLeagueClanId: true,
      blueLeagueClanId: true,
    },
    orderBy: { startAt: 'desc' },
  })

  /* **포지션을 아직 모르는 선수가 많이 뛴 경기부터** 받는다.
     한 요청이 열 명의 좌표를 준다. 이미 다 아는 경기를 다시 받으면 아무것도 안 는다 */
  const judged = new Set(
    (await prisma.playerPositionProfile.findMany({ select: { playerId: true } }))
      .map((row) => row.playerId)
      .filter((id): id is string => id !== null),
  )
  const unknownCount = new Map<string, number>()
  for (let i = 0; i < matches.length; i += 800) {
    const slice = matches.slice(i, i + 800)
    const stats = await prisma.matchPlayerStat.findMany({
      where: { matchId: { in: slice.map((m) => m.id) } },
      select: { matchId: true, playerId: true },
    })
    for (const stat of stats) {
      if (judged.has(stat.playerId)) continue
      unknownCount.set(stat.matchId, (unknownCount.get(stat.matchId) ?? 0) + 1)
    }
  }
  matches.sort((a, b) => (unknownCount.get(b.id) ?? 0) - (unknownCount.get(a.id) ?? 0))

  const numbers: string[] = []
  const indexOf = new Map<string, number>()
  /** 경기키 꼬리 6자리 사전 — 종류가 열 몇 개뿐이라 번호로 줄인다 */
  const suffixes: string[] = []
  const suffixIndex = new Map<string, number>()
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
    /* 경기키 18자 = `26` + `MMDDHHMMSS` + 6자리 꼬리.
       해가 하나뿐이고 꼬리는 종류가 적어서, 둘을 빼면 목록이 3할 짧아진다.
       브라우저에서 `S[꼬리번호]` 로 되돌린다 */
    const tail = key.slice(12)
    let tailIdx = suffixIndex.get(tail)
    if (tailIdx === undefined) {
      tailIdx = suffixes.length
      suffixes.push(tail)
      suffixIndex.set(tail, tailIdx)
    }
    parts.push(`${key.slice(2, 12)}${tailIdx.toString(36)}${String(idx).padStart(2, '0')}`)
    if (parts.length >= limit) break
  }

  console.info(`const C=${JSON.stringify(numbers)};`)
  console.info(`const S=${JSON.stringify(suffixes)};`)
  console.info(`const P=${JSON.stringify(parts.join(' '))};`)
  console.error(`남은 후보 ${parts.length}건 · 아는 클랜 ${known.length}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
