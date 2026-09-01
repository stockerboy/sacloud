/**
 * 리그 표시 이름 변경 (2026-09-01 사용자 지시 · D-246).
 *
 *   pnpm --filter @sacloud/worker exec tsx src/dev/leagueRename.ts [--confirm]
 *   node scripts/prod-run.mjs league-rename [--confirm]
 *
 * ── 2026-08-30 의 이름을 **되돌린다**
 *   지난번(D-204)에 이 도구로 `SPL`→`DPL`, `열산리그`→`열산` 을 했다.
 *   사용자가 하루 만에 «SPL 로 가 · 열산도 10mountain 으로 해» 라고 다시 지시했다.
 *   **도구를 새로 만들지 않고 목표값만 고쳤다** — 어느 이름에서 출발하든
 *   목표 이름이면 건너뛰므로, 옛 이름(`DPL`)이든 그 전 이름(`서플라이공식리그`)이든
 *   똑같이 한 번에 맞춰진다.
 *
 * ── 무엇을 바꾸는가
 *   `League.name` 세 건과, 그 리그를 가리키는 게시판 카테고리 이름 한 건뿐이다.
 *
 *     slug `supply`  서플라이공식리그 / DPL → SPL
 *     slug `nolink`  무소속리그             → IPL          (그대로다)
 *     slug `sanply`  열산리그 / 열산        → 10mountain
 *     BoardCategory slug `spl`  DPL         → SPL          (SPL 리그 게시판이다)
 *
 * ── 이름에 **이모지를 넣지 않는다**
 *   사용자가 «귀여운 산 이모티콘 붙여도 되고» 라고 했지만 `League.name` 은
 *   정렬 키이자 검색 대상이고 API·CSV·로그에 그대로 실려 나간다. 기기마다 모양도 다르다.
 *   그래서 이름은 `10mountain` 글자만 두고, **산 표시는 화면에서만** 붙인다
 *   (`@sacloud/ui` 의 `LeagueLabel` · 인라인 SVG).
 *
 * ── 무엇을 **건드리지 않는가**
 *   `slug` · 라우트 · API 경로 · `category` · `divisionCount` · `official` · `origin` ·
 *   그 밖의 모든 컬럼. `slug` 로 찾아 `name` 만 쓴다.
 *   `Clan.category === 'independent'`(무소속 분류)와 관리자 화면의 `무소속 티어` 같은
 *   **도메인 용어는 이름이 아니다.** 여기서도, 코드에서도 그대로 뒀다.
 *
 * ── **`--confirm` 이 없으면 미리보기다** (2026-09-01 에 고쳤다 · D-246)
 *   예전에는 반대였다 — 아무 옵션 없이 돌리면 **바로 썼고** `--dry-run` 을 붙여야
 *   미리보기였다. 그런데 `scripts/prod-run.mjs` 는 «`--confirm` 이 없으면 미리보기»
 *   라고 안내하면서 인자를 그대로 넘긴다. 그래서 `prod-run.mjs league-rename` 을
 *   옵션 없이 돌리면 **미리보기라고 믿은 채 운영 DB 에 써 버린다.** 방향을 뒤집었다.
 *   옛 `--dry-run` 도 계속 받는다 (붙이면 무조건 미리보기 · `CLAUDE.md` 10-4).
 *
 * ── 멱등하다
 *   이미 목표 이름이면 아무것도 쓰지 않는다. 리그 행이 없으면 **만들지 않고** 건너뛴다 —
 *   이 스크립트는 이름을 고치는 도구이지 리그를 만드는 도구가 아니다
 *   (무소속리그 생성은 `nexon independent-league` 가 한다).
 *
 * 운영에도 쓴다 (`scripts/prod-run.mjs league-rename --confirm`).
 */
import { prisma } from '@sacloud/db'

/** slug → 새 표시 이름. **slug 는 절대 바꾸지 않는다** */
const LEAGUE_RENAMES: readonly { slug: string; name: string }[] = [
  { slug: 'supply', name: 'SPL' },
  { slug: 'nolink', name: 'IPL' },
  { slug: 'sanply', name: '10mountain' },
]

/** 리그 이름을 따라가는 게시판 카테고리. slug 는 그대로 둔다 (글 경로가 바뀌면 안 된다) */
const CATEGORY_RENAMES: readonly { slug: string; name: string }[] = [{ slug: 'spl', name: 'SPL' }]

async function main(): Promise<void> {
  /* 기본이 미리보기다. `--confirm` 을 붙여야 쓴다. `--dry-run` 은 옛 이름 — 계속 받는다 */
  const dryRun = !process.argv.includes('--confirm') || process.argv.includes('--dry-run')
  if (dryRun) console.info('[미리보기] 아무것도 쓰지 않는다 — 쓰려면 `--confirm`\n')

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

  console.info(
    `\n${dryRun ? '바꿀 것' : '바꿈'} ${changed} · 이미 맞음 ${already} · 없음 ${missing}` +
      (dryRun && changed > 0 ? '  ← 아직 안 썼다. 쓰려면 `--confirm`' : ''),
  )
}

await main()
await prisma.$disconnect()
