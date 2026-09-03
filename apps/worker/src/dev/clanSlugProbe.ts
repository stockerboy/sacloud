/**
 * **IPL 클랜 슬러그가 병영수첩에서 실제로 통하나** (2026-09-04 · ★읽기 전용★).
 *
 * 3~6월 발견을 돌리자마자 ★`ferwfwfwfwf` · `ipl-backspace00` · `ipl-yoonsh1971` 가
 * 연달아 「0건」★ 이 왔다. ★`ipl-` 로 시작하는 것은 우리가 붙인 임시 슬러그★ 로 보인다 —
 * ★병영수첩의 `clan_id` 가 아니다.★
 *
 * ★그러면 그 클랜들에 보내는 요청은 전부 헛돈다.★ 80쪽씩 걸어 두면 ★헛된 요청이 80배★ 다.
 * ★받기 전에 몇 곳이 진짜인지부터 센다.★
 */
import { prisma } from '@sacloud/db'

async function main(): Promise<void> {
  const rows = await prisma.$queryRaw<{ slug: string; name: string; got: bigint }[]>`
    SELECT c."slug", c."name",
           (SELECT count(*) FROM "BarracksClanMatchRaw" b WHERE b."subject" = c."slug") AS got
      FROM "LeagueClan" lc
      JOIN "League" l ON l."id" = lc."leagueId" AND l."slug" = 'nolink'
      JOIN "Clan" c ON c."id" = lc."clanId"
     ORDER BY 3 DESC, 1
  `
  const ok = rows.filter((r) => Number(r.got) > 0)
  const bad = rows.filter((r) => Number(r.got) === 0)
  console.info(`IPL 클랜 ★${rows.length}곳★ 중 병영수첩 목록이 온 곳 ★${ok.length}곳★\n`)
  console.info('  ★된 곳★ (최대 12)')
  for (const r of ok.slice(0, 12)) console.info(`    ${r.slug}  (${r.name})  ${Number(r.got)}행`)
  console.info(`\n  ★안 된 곳 ${bad.length}곳★ (최대 20)`)
  for (const r of bad.slice(0, 20)) console.info(`    ${r.slug}  (${r.name})`)
  const prefixed = bad.filter((r) => r.slug.startsWith('ipl-'))
  console.info(
    `\n  ⚠ 안 된 곳 중 ★\`ipl-\` 로 시작하는 것 ${prefixed.length}곳★ — ` +
      '★우리가 붙인 이름이지 병영수첩 것이 아닐 가능성이 크다★',
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
