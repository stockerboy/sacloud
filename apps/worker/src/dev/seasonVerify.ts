/**
 * **O-046 확인 칸** — 읽기 전용 (2026-09-03).
 *
 * 지시서의 다섯 칸을 그대로 잰다. ★5번(일부러 깨뜨리기)은 이 파일이 아니라
 * `packages/contract/src/__tests__/seasonWindow.test.ts` 가 지킨다.★
 */
import { SEASON_WINDOWS } from '@sacloud/contract'
import { prisma } from '@sacloud/db'

async function main(): Promise<void> {
  console.info('══ 1 · 경기가 시즌에 묶였나 ══\n')
  const left = await prisma.match.count({ where: { seasonId: null } })
  console.info(`  미분류 ★${left}건★  ${left === 0 ? '★통과★' : '★실패★'}`)

  console.info('\n══ 2 · 경계가 맞나 (하루를 눈으로) ══\n')
  const rows = await prisma.$queryRaw<
    { label: string; n: bigint; oldest: Date; newest: Date }[]
  >`
    SELECT s."seasonType" || ' #' || s."number" AS label,
           count(*) AS n, min(m."startAt") AS oldest, max(m."startAt") AS newest
      FROM "Match" m JOIN "Season" s ON s."id" = m."seasonId"
     GROUP BY 1 ORDER BY 1
  `
  for (const r of rows) {
    console.info(
      `  ${r.label.padEnd(14)} ${Number(r.n).toLocaleString().padStart(9)}건  ` +
        `${r.oldest.toISOString().slice(0, 16)} ~ ${r.newest.toISOString().slice(0, 16)}`,
    )
  }
  const beta = rows.find((r) => r.label.startsWith('beta'))
  const s0 = rows.find((r) => r.label === 'official #0')
  if (beta && s0) {
    /* KST 로 봐야 사람 눈에 맞는다 */
    const kst = (d: Date) => new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 16).replace('T', ' ')
    console.info(`\n  Beta 마지막  ${kst(beta.newest)} KST   (≤ 2026-07-01 이어야 한다)`)
    console.info(`  시즌0 첫    ${kst(s0.oldest)} KST   (≥ 2026-07-02 이어야 한다)`)
    const ok = kst(beta.newest) < '2026-07-02' && kst(s0.oldest) >= '2026-07-02'
    console.info(`  ${ok ? '★통과★' : '★실패★'}`)
  }

  console.info('\n══ 3 · 리그별로 다 있나 ══\n')
  const per = await prisma.$queryRaw<{ slug: string; n: bigint }[]>`
    SELECT l."slug" AS slug, count(s."id") AS n
      FROM "League" l LEFT JOIN "Season" s ON s."leagueId" = l."id"
     GROUP BY 1 ORDER BY 1
  `
  for (const r of per) {
    console.info(`  ${r.slug.padEnd(9)} 시즌 ${Number(r.n)}개 ${Number(r.n) >= SEASON_WINDOWS.length ? '★통과★' : '★모자람★'}`)
  }

  console.info('\n══ 4 · 작년 것 ══\n')
  const lastYear = await prisma.$queryRaw<{ label: string; n: bigint }[]>`
    SELECT s."seasonType" AS label, count(*) AS n
      FROM "Match" m JOIN "Season" s ON s."id" = m."seasonId"
     WHERE m."startAt" < timestamptz '2026-01-01 00:00:00+09'
     GROUP BY 1
  `
  for (const r of lastYear) {
    console.info(`  2026 이전 경기가 들어간 시즌: ${r.label} ${Number(r.n).toLocaleString()}건`)
  }
  console.info('  ⚠ 전부 ★legacy★ 여야 한다 — Beta·시즌0 에 섞이면 실패다')
}

main().catch((e) => { console.error(e); process.exitCode = 1 }).finally(() => prisma.$disconnect())
