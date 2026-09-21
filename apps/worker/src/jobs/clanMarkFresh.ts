import { prisma } from '@sacloud/db'

import { log } from '../lib/log.js'

/**
 * ★★클랜 마크를 최근 경기로 맞춘다★★ (2026-09-21 · 사장님 지시)
 *
 * > 「클랜명바뀐건 적용이 잘되는데 ★클랜마크 바뀐건 적용이 안된다니까★」
 * > 「근본적인 문제를 해결해 (…) 매번 내가 알려줄때마다 한명한명 고칠거야?」
 *
 * ── 왜 마크만 안 따라왔나 (실측으로 밝혔다)
 *
 *   이름은 ★병영 클랜원 명부★(`BarracksClanMember`)로 매시 맞춰진다.
 *   그런데 그 표에는 ★마크 칸이 아예 없다★ —
 *   `clanSlug · clanName · strUsn · userNick …` 뿐이다.
 *   ★마크는 경기 쪽에만 있다.★ 그래서 이름만 따라오고 마크는 옛것으로 남았다.
 *
 *   마크를 고치는 잡이 하나 있긴 했다 (`clanNameFromMatches`). 그런데 그것은
 *   ★클랜마다 원문 표를 통째로 훑어서★ 2026-09-21 실측에서 ★DB 시간초과로 죽었다★ —
 *   `canceling statement due to statement timeout`. ★죽는 잡은 없는 잡이다.★
 *
 * ── 이 잡이 가벼운 이유
 *
 *   ★원문을 안 본다.★ 참가 기록에 ★경기 당시 마크가 이미 쌓여 있다★
 *   (`MatchPlayerStat.matchTimeClanMark*` — 최근 3일 12,672줄 실측).
 *   그래서 ★질의 한 번★ 으로 「클랜별 가장 최근 마크」 를 뽑는다.
 *
 *   실측 (2026-09-21) — 최근 7일에 나온 클랜 ★107곳★ 중 ★6곳★ 의 마크가 어긋나 있었다.
 *
 * ── 안 하는 것
 *
 *   ⚠ ★빈 마크로 덮지 않는다★ — 마크를 안 단 클랜이 그 자리일 수 있다 (D-106).
 *   ⚠ ★경기 당시 마크(`matchTime*`)는 한 칸도 안 건드린다★ — 지금 마크를 과거에
 *     뿌리면 마크를 바꾼 순간 옛 경기 화면이 통째로 바뀐다.
 */

/** 며칠치 경기를 볼까. 길게 볼수록 무겁고, 짧으면 안 뛴 클랜을 놓친다 */
export const MARK_LOOKBACK_DAYS = 14

export interface ClanMarkFreshResult {
  /** 최근 경기에 나온 클랜 수 */
  seen: number
  /** 마크가 달라서 고친 클랜 수 */
  updated: number
  samples: { slug: string; name: string }[]
}

interface Row {
  id: string
  slug: string
  name: string
  bg: string
  front: string
}

export async function runClanMarkFresh(
  options: { confirm?: boolean; days?: number } = {},
): Promise<ClanMarkFreshResult> {
  const days = options.days ?? MARK_LOOKBACK_DAYS
  const result: ClanMarkFreshResult = { seen: 0, updated: 0, samples: [] }

  /*
   * ★클랜마다 가장 최근 경기의 마크★ 를 한 번에 뽑는다.
   * `DISTINCT ON` 은 `ORDER BY` 의 첫 줄만 남긴다 — 그 클랜의 최신 한 줄이다.
   *
   * ⚠ ★SQL 템플릿 안에 백틱을 쓰지 않는다★ — 템플릿이 거기서 끊긴다.
   *   그래서 설명은 전부 ★템플릿 밖★ 인 여기에 적는다.
   */
  const rows = await prisma.$queryRaw<Row[]>`
    WITH latest AS (
      SELECT DISTINCT ON (s."matchTimeClanSlug")
             s."matchTimeClanSlug"          AS slug,
             s."matchTimeClanMarkBgUrl"     AS bg,
             s."matchTimeClanMarkFrontUrl"  AS front
        FROM "MatchPlayerStat" s
        JOIN "Match" m ON m."id" = s."matchId"
       WHERE m."startAt" > now() - (${days} || ' days')::interval
         AND s."matchTimeClanSlug" IS NOT NULL
         AND s."matchTimeClanMarkBgUrl" IS NOT NULL
         AND s."matchTimeClanMarkFrontUrl" IS NOT NULL
       ORDER BY s."matchTimeClanSlug", m."startAt" DESC
    )
    SELECT c."id", c."slug", c."name", l.bg, l.front
      FROM latest l
      JOIN "Clan" c ON c."slug" = l.slug
     WHERE c."markBgUrl" IS DISTINCT FROM l.bg
        OR c."markFrontUrl" IS DISTINCT FROM l.front
  `

  const seen = await prisma.$queryRaw<{ n: number }[]>`
    SELECT COUNT(DISTINCT s."matchTimeClanSlug")::int AS n
      FROM "MatchPlayerStat" s
      JOIN "Match" m ON m."id" = s."matchId"
     WHERE m."startAt" > now() - (${days} || ' days')::interval
       AND s."matchTimeClanSlug" IS NOT NULL
  `
  result.seen = seen[0]?.n ?? 0

  for (const r of rows) {
    result.updated += 1
    if (result.samples.length < 20) result.samples.push({ slug: r.slug, name: r.name })
    if (options.confirm) {
      await prisma.clan.update({
        where: { id: r.id },
        data: { markBgUrl: r.bg, markFrontUrl: r.front },
      })
    }
  }

  log(
    `클랜 마크 — 최근 ${days}일에 나온 클랜 ${result.seen}곳 · 고침 ${result.updated}곳` +
      (options.confirm ? '' : ' (미리보기)'),
  )
  for (const s of result.samples) log(`  ${s.name} (${s.slug})`)
  return result
}
