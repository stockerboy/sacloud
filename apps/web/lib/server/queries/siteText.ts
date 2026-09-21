import { prisma } from '@sacloud/db'

/**
 * ★★화면에 적히는 글 — 관리자가 사이트에서 고친다★★ (2026-09-21 사장님)
 *
 * > 「아니 글을 왜 이렇게 써놨어 이거 ★내가 관리자 권한으로 수정 할 수 있게 해줘★ 글
 * >  그리고 ★관리자 권한으로 공지사항도 쓸 수 있게 해줘★ 이게 더 급해」
 *
 * ── 규칙은 하나다
 *
 *   ★DB 에 줄이 있으면 그것을 쓰고, 없으면 코드에 박힌 글을 쓴다.★
 *   그래서 이 표가 비어 있어도 화면은 지금과 똑같다 — ★코드의 글을 안 지웠다★
 *   (`CLAUDE.md` 1-4). 관리자가 한 번 저장하면 그때부터 DB 가 이긴다.
 *
 * ── 글 하나의 모양
 *
 *   ```
 *   제목   「PL → IPL 전환 안내」
 *   본문   줄바꿈 한 번이 ★한 항목★ 이다. 화면이 앞에 `·` 를 붙인다
 *   ```
 *   빈 줄은 버린다 — 관리자가 실수로 엔터를 두 번 쳐도 빈 항목이 안 생긴다.
 */

/** 글 하나 */
export interface SiteTextBlock {
  title: string | null
  lines: string[]
}

/** 글 묶음의 열쇠를 한 곳에서 만든다 — 화면과 관리자가 ★같은 글자★ 를 봐야 한다 */
export function clanRankNotesKey(leagueSlug: string): string {
  return `league.${leagueSlug}.clanRankNotes`
}

/** 본문 한 덩어리를 항목 여럿으로. ★빈 줄은 버린다★ */
export function linesOf(body: string): string[] {
  return body
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '')
}

/**
 * 그 열쇠의 글. ★없거나 감춰져 있으면 `null`★ — 부르는 쪽이 코드 기본값을 쓴다.
 *
 * ⚠ ★지어내지 않는다★ — 빈 글을 「제목만 있는 칸」 으로 만들지 않는다 (D-106).
 */
export async function siteTextOf(key: string): Promise<SiteTextBlock | null> {
  const row = await prisma.siteText.findUnique({
    where: { key },
    select: { title: true, body: true, hidden: true },
  })
  if (row === null || row.hidden) return null
  const lines = linesOf(row.body)
  if (lines.length === 0 && (row.title === null || row.title.trim() === '')) return null
  return { title: row.title?.trim() || null, lines }
}

/** 관리자 화면이 쓰는 목록 — 지금 DB 에 들어 있는 글 전부 */
export async function listSiteTexts(): Promise<
  { key: string; title: string | null; body: string; hidden: boolean; updatedAt: Date }[]
> {
  return prisma.siteText.findMany({
    orderBy: { key: 'asc' },
    select: { key: true, title: true, body: true, hidden: true, updatedAt: true },
  })
}

/** 관리자가 저장한다. ★없으면 만들고 있으면 덮는다★ */
export async function saveSiteText(input: {
  key: string
  title: string | null
  body: string
  hidden: boolean
  userId: string | null
}): Promise<void> {
  await prisma.siteText.upsert({
    where: { key: input.key },
    create: {
      key: input.key,
      title: input.title,
      body: input.body,
      hidden: input.hidden,
      updatedByUserId: input.userId,
    },
    update: {
      title: input.title,
      body: input.body,
      hidden: input.hidden,
      updatedByUserId: input.userId,
    },
  })
}

/**
 * ★코드로 되돌린다★ — 줄을 지우면 코드에 박힌 글이 다시 나온다.
 *
 * 관리자가 잘못 고쳤을 때 ★되돌릴 길★ 이 있어야 한다. 이것이 그 길이다.
 */
export async function resetSiteText(key: string): Promise<void> {
  await prisma.siteText.deleteMany({ where: { key } })
}
