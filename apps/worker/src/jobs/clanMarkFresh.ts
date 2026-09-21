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
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ★★2026-09-21 밤 — 도장을 읽던 것이 ★순환★ 이었다★★ (사장님: 「그레이브랑
 * 발렌티나 클랜마크 ★좋은말로 할때 제대로 넣어라★」)
 *
 * ── 왜 grave 가 고쳐도 고쳐도 돌아왔나 (실측으로 밝혔다)
 *
 *   손으로 DB 를 고쳐 놓으면 ★한 시간 뒤에 옛 마크로 돌아왔다.★ 범인은 이 잡이다 —
 *   ```
 *   battlelogLineup.ts:519   matchTimeClanMarkBgUrl ← ★Clan.markBgUrl (우리 DB)★
 *   clanMarkFresh (옛 판)    Clan.markBgUrl         ← ★matchTimeClanMarkBgUrl★
 *   ```
 *   ★자기가 자기를 베끼고 있었다.★ 그래서 ★새 마크를 영원히 배울 수 없었다.★
 *   (`clanNameFromMatches` 가 같은 함정을 이름 쪽에서 이미 적어 두었는데,
 *    마크 쪽에서 그대로 다시 밟았다)
 *
 * ── 진실은 ★경기 원문★ 하나뿐이다
 *
 *   `BarracksClanMatchRaw.payload` 의 `red_clan_mark1/2` · `blue_clan_mark1/2` 는
 *   ★넥슨이 준 값★ 이다. 우리가 쓴 값이 아니다.
 *
 * ── 그럼 왜 처음부터 그걸 안 읽었나 — ★색인이 없었다★
 *
 *   옛 주석에 「원문을 통째로 훑어서 DB 시간초과로 죽었다」 고 적혀 있다.
 *   ★그건 원문이 무거워서가 아니라 색인이 없어서였다.★ 색인은 `subject` 하나뿐이라
 *   「최근 여섯 줄」 을 뽑으려면 ★그 클랜의 1만 줄을 전부 읽어 정렬★ 해야 했다
 *   (`valentina2` 는 10,526줄이다).
 *
 *   ★`(subject, fetchedAt DESC)` 색인을 하나 놓으니 464곳이 8초다.★
 *
 * ⚠ ★옛 도장 방식은 지우지 않았다★ — `MARK_SOURCE` 를 `'stamp'` 로 두면 돌아온다
 *   (`CLAUDE.md` 1-4).
 */

/** 며칠치 경기를 볼까 (★도장 방식에서만 쓴다★). 길게 볼수록 무겁고, 짧으면 안 뛴 클랜을 놓친다 */
export const MARK_LOOKBACK_DAYS = 14

/**
 * ★마크를 어디서 읽나★
 *
 *   `'raw'`    ★경기 원문★ (`BarracksClanMatchRaw.payload`) — 지금 이것. ★넥슨이 준 값★
 *   `'stamp'`  옛 방식. 참가 기록의 도장 — ★우리 DB 를 베낀 값이라 순환한다★
 */
export type MarkSource = 'raw' | 'stamp'
export const MARK_SOURCE = 'raw' as MarkSource

/**
 * 클랜마다 원문을 ★몇 줄★ 볼까.
 *
 * 한 줄만 보면 ★그 줄에 그 클랜이 red 인지 blue 인지 모른다.★ 여러 줄에서
 * ★늘 나오는 이름★ 이 그 클랜 자신이다 — 상대는 경기마다 바뀐다.
 */
const RAW_LOOK_BACK = 6

/** 「늘 나온다」 고 치려면 몇 번 나와야 하나. 한 번이면 ★상대 클랜★ 일 수 있다 */
const RAW_MIN_HITS = 2

/** 마크를 안 단 클랜이 쓰는 그림 — ★이것으로 덮지 않는다★ */
const EMPTY_MARK = 'empty-clanmark'

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

/** 원문 한 줄에서 뽑아 쓰는 것만 */
interface RawRow {
  rn: string | null
  rb: string | null
  rf: string | null
  bn: string | null
  bb: string | null
  bf: string | null
}

const usable = (url: string | null): url is string =>
  url !== null && url.trim() !== '' && !url.includes(EMPTY_MARK)

/**
 * ★경기 원문에서 클랜마다 지금 마크를 고른다★ (2026-09-21).
 *
 * 클랜 하나에 질의 하나다. ★`(subject, fetchedAt DESC)` 색인★ 덕에 464곳이 8초다 —
 * 색인이 없으면 여기서 죽는다 (옛 주석의 「시간초과」 가 그것이었다).
 */
async function fromRaw(): Promise<{ rows: Row[]; seen: number }> {
  const clans = await prisma.clan.findMany({
    where: { active: true, leagueClans: { some: {} } },
    select: { id: true, slug: true, name: true, markBgUrl: true, markFrontUrl: true },
  })

  const out: Row[] = []
  for (const clan of clans) {
    /* ⚠ ★SQL 템플릿 안에 백틱을 쓰지 않는다★ — 템플릿이 거기서 끊긴다 */
    const raws = await prisma.$queryRaw<RawRow[]>`
      SELECT x."payload"->>'red_clan_name'   AS rn,
             x."payload"->>'red_clan_mark1'  AS rb,
             x."payload"->>'red_clan_mark2'  AS rf,
             x."payload"->>'blue_clan_name'  AS bn,
             x."payload"->>'blue_clan_mark1' AS bb,
             x."payload"->>'blue_clan_mark2' AS bf
        FROM "BarracksClanMatchRaw" x
       WHERE x."subject" = ${clan.slug}
       ORDER BY x."fetchedAt" DESC
       LIMIT ${RAW_LOOK_BACK}
    `
    if (raws.length === 0) continue

    /* ★그 클랜은 늘 나오고 상대는 바뀐다★ — 가장 많이 나온 이름이 자신이다 */
    const hits = new Map<string, number>()
    const markOf = new Map<string, { bg: string; front: string }>()
    for (const r of raws) {
      for (const side of [
        { name: r.rn, bg: r.rb, front: r.rf },
        { name: r.bn, bg: r.bb, front: r.bf },
      ]) {
        const name = (side.name ?? '').trim()
        if (name === '') continue
        hits.set(name, (hits.get(name) ?? 0) + 1)
        if (markOf.has(name)) continue
        /* ⚠ ★빈 마크는 안 담는다★ — 마크를 안 단 클랜이 그 자리일 수 있다 (D-106) */
        if (!usable(side.bg) || !usable(side.front)) continue
        markOf.set(name, { bg: side.bg, front: side.front })
      }
    }

    let best: string | null = null
    let bestHits = 0
    let tied = false
    for (const [name, n] of hits) {
      if (n > bestHits) {
        best = name
        bestHits = n
        tied = false
      } else if (n === bestHits) {
        tied = true
      }
    }
    /* ★갈리면 안 고친다★ — 틀린 마크로 덮느니 그대로 두는 편이 낫다 (D-106) */
    if (best === null || bestHits < RAW_MIN_HITS || tied) continue

    const mark = markOf.get(best)
    if (mark === undefined) continue
    if (mark.bg === clan.markBgUrl && mark.front === clan.markFrontUrl) continue
    out.push({ id: clan.id, slug: clan.slug, name: clan.name, bg: mark.bg, front: mark.front })
  }

  return { rows: out, seen: clans.length }
}

export async function runClanMarkFresh(
  options: { confirm?: boolean; days?: number } = {},
): Promise<ClanMarkFreshResult> {
  const days = options.days ?? MARK_LOOKBACK_DAYS
  const result: ClanMarkFreshResult = { seen: 0, updated: 0, samples: [] }

  if (MARK_SOURCE === 'raw') {
    const got = await fromRaw()
    result.seen = got.seen
    for (const r of got.rows) {
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
      `클랜 마크 — ★원문★ 으로 클랜 ${result.seen}곳 살펴봄 · 고침 ${result.updated}곳` +
        (options.confirm ? '' : ' (미리보기)'),
    )
    for (const s of result.samples) log(`  ${s.name} (${s.slug})`)
    return result
  }

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
