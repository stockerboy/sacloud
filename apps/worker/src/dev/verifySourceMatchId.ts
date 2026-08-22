/**
 * `sourceMatchId` 원형 보존 검증 (Phase 10 final cleanup).
 *
 *   pnpm --filter @sacloud/worker exec tsx src/dev/verifySourceMatchId.ts
 *
 * 왜 필요한가
 *   넥슨 `match_id`는 **18자리**다. JavaScript `Number`의 안전 정수 한계는 9,007,199,254,740,991
 *   (16자리)이라 숫자로 다루는 순간 **끝자리가 조용히 바뀐다**.
 *   그래서 원본 → 저장 → 재구성 → 조회 전 구간에서 **문자열 그대로**인지 숫자로 확인한다.
 *
 * 읽기만 한다. 아무것도 바꾸지 않는다.
 */
import { prisma } from '@sacloud/db'

/** 18자리 예시로 정밀도 한계를 눈으로 보여 준다 */
function precisionDemo(id: string): string {
  const asNumber = Number(id)
  return `${id} → Number() → ${asNumber} → 다시 문자열 → ${String(asNumber)} (${
    String(asNumber) === id ? '보존' : '**손상**'
  })`
}

async function main(): Promise<void> {
  console.info('sourceMatchId 원형 보존 검증\n')
  console.info(`안전 정수 한계 ${Number.MAX_SAFE_INTEGER} (16자리)`)
  console.info(precisionDemo('260716180538124001'))
  console.info('')

  const staged = await prisma.nexonMatch.findMany({
    where: { detailFetchedAt: { not: null } },
    select: { id: true, sourceMatchId: true },
    orderBy: { sourceMatchId: 'asc' },
  })

  let failures = 0
  for (const match of staged) {
    const sourceMatchId = match.sourceMatchId

    /* 1) 원본 응답(RawImport)에 있는 값과 같은가 */
    const raws = await prisma.rawImport.findMany({
      where: { source: 'nexon', sourceId: sourceMatchId },
      select: { raw: true, endpoint: true },
    })
    const rawValues = raws
      .map((row) => (row.raw as { match_id?: unknown } | null)?.match_id)
      .filter((value) => value !== undefined)

    for (const value of rawValues) {
      const type = typeof value
      const text = String(value)
      const ok = type === 'string' && text === sourceMatchId
      if (!ok) failures += 1
      console.info(
        `  원본 match_id  ${text} (${type}) ${ok ? '일치' : `**불일치** — 스테이징 ${sourceMatchId}`}`,
      )
    }

    /* 2) 목록 원본(entries)에도 같은 값이 있는가 */
    const listRaws = await prisma.rawImport.findMany({
      where: { source: 'nexon', endpoint: '/suddenattack/v1/match' },
      select: { raw: true },
    })
    let foundInList = false
    let listType = ''
    for (const row of listRaws) {
      const entries = (row.raw as { match?: { match_id?: unknown }[] } | null)?.match ?? []
      for (const entry of entries) {
        if (String(entry.match_id) === sourceMatchId) {
          foundInList = true
          listType = typeof entry.match_id
        }
      }
    }

    /* 3) 운영 매치까지 그대로 왔는가 */
    const domain = await prisma.match.findFirst({
      where: { origin: 'nexon', sourceMatchId },
      select: { id: true, sourceMatchId: true },
    })

    console.info(
      `  스테이징 ${sourceMatchId} · 목록원본 ${foundInList ? `있음(${listType})` : '없음'} · ` +
        `운영매치 ${domain ? `${domain.sourceMatchId} (내부 id ${domain.id})` : '없음'}`,
    )
    if (domain && domain.sourceMatchId !== sourceMatchId) failures += 1
    console.info('')
  }

  /* 4) 저장된 모든 sourceMatchId가 숫자 왕복에서 살아남는가 */
  const allStaged = await prisma.nexonMatch.findMany({ select: { sourceMatchId: true } })
  const unsafe = allStaged.filter(
    (row) => String(Number(row.sourceMatchId)) !== row.sourceMatchId,
  )
  console.info(
    `스테이징 ${allStaged.length}건 중 숫자로 바꾸면 값이 달라지는 것 ${unsafe.length}건` +
      ` — 그래서 어디서도 숫자로 다루지 않는다`,
  )

  console.info(failures === 0 ? '\n전 구간 문자열 원형 유지.' : `\n${failures}건 불일치.`)
  if (failures > 0) process.exitCode = 1
}

main()
  .catch((error: unknown) => console.error(error))
  .finally(() => prisma.$disconnect())
