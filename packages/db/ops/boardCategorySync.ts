/**
 * 게시판 카테고리를 **계약(픽스처)에 맞춰 덧붙인다** (`docs/SITE_SPEC_V2.md` 2절).
 *
 * ```
 * pnpm --filter @sacloud/db exec tsx ops/boardCategorySync.ts            # 미리보기
 * pnpm --filter @sacloud/db exec tsx ops/boardCategorySync.ts --confirm  # 반영
 * ```
 *
 * ── 왜 시드가 아니라 이 도구인가
 *   `pnpm db:seed` 는 DB 를 통째로 비우고 다시 만든다. 지금 로컬 DB 에는 넥슨에서
 *   실제로 받아 온 기록이 들어 있어서 비울 수 없다. 그래서 **카테고리만** 맞춘다.
 *
 * ── 지우지 않는다
 *   원본(3rd.supply) 카테고리는 그대로 두고 새 것만 넣는다. 이미 쌓인 글이
 *   갈 곳을 잃으면 안 된다 (사용자 지시 — "바꿀 때는 전 버전도 남긴다").
 *   순번(`order`)만 픽스처 값으로 맞춘다.
 */
import { prisma } from '../src'
import { BOARD_CATEGORIES } from '@sacloud/contract'

async function main(): Promise<void> {
  const confirm = process.argv.includes('--confirm')
  const wanted = BOARD_CATEGORIES
  const have = new Map(
    (await prisma.boardCategory.findMany()).map((row) => [row.slug, row]),
  )

  const add = wanted.filter((row) => !have.has(row.slug))
  const move = wanted.filter((row) => {
    const found = have.get(row.slug)
    return found !== undefined && found.order !== row.order
  })

  console.info('새로 넣을 것 :', add.map((row) => `${row.slug}(${row.name})`).join(' ') || '없음')
  console.info('순번만 바꿀 것:', move.map((row) => `${row.slug} ${have.get(row.slug)?.order}→${row.order}`).join(' ') || '없음')
  if (!confirm) {
    console.info('미리보기다. 반영하려면 --confirm')
    return
  }

  for (const row of wanted) {
    await prisma.boardCategory.upsert({
      where: { slug: row.slug },
      update: { name: row.name, notice: row.notice, order: row.order },
      create: { slug: row.slug, name: row.name, notice: row.notice, order: row.order },
    })
  }
  console.info('반영 완료 —', wanted.length, '줄')
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
