/**
 * 리그 표시 이름 변경 (2026-08-30 사용자 지시).
 *
 *   pnpm --filter @sacloud/worker exec tsx src/dev/leagueRename.ts [--dry-run]
 *
 * ── 무엇을 바꾸는가
 *   `League.name` 세 건과, 그 리그를 가리키는 게시판 카테고리 이름 한 건뿐이다.
 *
 *     slug `supply`  서플라이공식리그 → DPL
 *     slug `nolink`  무소속리그       → IPL
 *     slug `sanply`  열산리그         → 열산
 *     BoardCategory slug `spl`  SPL   → DPL      (DPL 리그 게시판이다)
 *
 * ── 무엇을 **건드리지 않는가**
 *   `slug` · 라우트 · API 경로 · `category` · `divisionCount` · `official` · `origin` ·
 *   그 밖의 모든 컬럼. `slug` 로 찾아 `name` 만 쓴다.
 *   `Clan.category === 'independent'`(무소속 분류)와 관리자 화면의 `무소속 티어` 같은
 *   **도메인 용어는 이름이 아니다.** 여기서도, 코드에서도 그대로 뒀다.
 *
 * ── 멱등하다
 *   이미 목표 이름이면 아무것도 쓰지 않는다. 리그 행이 없으면 **만들지 않고** 건너뛴다 —
 *   이 스크립트는 이름을 고치는 도구이지 리그를 만드는 도구가 아니다
 *   (무소속리그 생성은 `nexon independent-league` 가 한다).
 *
 * 로컬 개발 DB 전용이다.
 */
import { prisma } from '@sacloud/db'

/** slug → 새 표시 이름. **slug 는 절대 바꾸지 않는다** */
const LEAGUE_RENAMES: readonly { slug: string; name: string }[] = [
  { slug: 'supply', name: 'DPL' },
  { slug: 'nolink', name: 'IPL' },
  { slug: 'sanply', name: '열산' },
]

/** 리그 이름을 따라가는 게시판 카테고리. slug 는 그대로 둔다 (글 경로가 바뀌면 안 된다) */
const CATEGORY_RENAMES: readonly { slug: string; name: string }[] = [{ slug: 'spl', name: 'DPL' }]

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run')
  if (dryRun) console.info('[dry-run] 아무것도 쓰지 않는다\n')

  let changed = 0
  let already = 0
  let missing = 0

  for (const target of LEAGUE_RENAMES) {
    const league = await prisma.league.findUnique({
      where: { slug: target.slug },
      select: { id: true, name: true },
    })
    if (!league) {
      console.warn(`- League ${target.slug}: 없음 — 건너뜀 (만들지 않는다)`)
      missing += 1
      continue
    }
    if (league.name === target.name) {
      console.info(`= League ${target.slug}: 이미 "${target.name}"`)
      already += 1
      continue
    }
    if (!dryRun) {
      await prisma.league.update({ where: { id: league.id }, data: { name: target.name } })
    }
    console.info(`* League ${target.slug}: "${league.name}" → "${target.name}"`)
    changed += 1
  }

  for (const target of CATEGORY_RENAMES) {
    /* BoardCategory 의 기본키는 `slug` 다 — 별도 id 컬럼이 없다 */
    const category = await prisma.boardCategory.findUnique({
      where: { slug: target.slug },
      select: { slug: true, name: true },
    })
    if (!category) {
      console.warn(`- BoardCategory ${target.slug}: 없음 — 건너뜀`)
      missing += 1
      continue
    }
    if (category.name === target.name) {
      console.info(`= BoardCategory ${target.slug}: 이미 "${target.name}"`)
      already += 1
      continue
    }
    if (!dryRun) {
      await prisma.boardCategory.update({
        where: { slug: category.slug },
        data: { name: target.name },
      })
    }
    console.info(`* BoardCategory ${target.slug}: "${category.name}" → "${target.name}"`)
    changed += 1
  }

  console.info(`\n바꿈 ${changed} · 이미 맞음 ${already} · 없음 ${missing}`)
}

await main()
await prisma.$disconnect()
