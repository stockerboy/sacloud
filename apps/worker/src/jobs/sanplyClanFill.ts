import { prisma } from '@sacloud/db'

import { log } from '../lib/log.js'

/**
 * ★★열산에 빠진 클랜을 채운다★★ (2026-09-21 · 사장님 지시)
 *
 * > 「열산 3rd.supply에서 ★모든 3부 클랜들 다 열산고용가능클랜에 때려박고★
 * >  9/3부터 기록 다시 주워서 채워넣어 (…) ★걔네끼리한 모든 9/3부터의 경기★
 * >  우리 열산에도 전부 다 채워넣어 기록 다 채워넣어」
 *
 * ── 무엇이 문제였나 (실측 2026-09-21)
 *
 *   ```
 *   클랜을 못 찾아 명단을 못 만든 경기   ★90건★
 *   그 경기에 나온 클랜 60곳 중          ★21곳이 우리 DB 에 아예 없다★
 *     ‘세일러문’ · 8중대-루키 · arcenciel · hiemis · 혼겜러 · devastor · lunaclan …
 *   ```
 *   ★경기는 받아 놓고 클랜이 없어서 통째로 버리고 있었다.★
 *
 * ── ⚠ ★원문에는 클랜 주소가 없다★ (2026-09-21 실측으로 알았다)
 *
 *   ```
 *   red_clan_name · red_clan_mark1/2   ← 있다
 *   red_clan_id                        ← ★없다★
 *   clan_no                            ← 그 경기를 ★가져온 클랜★ 것 하나뿐
 *   ```
 *   그래서 ★상대 클랜의 주소를 모른다.★ 이름만 안다.
 *
 * ── 그래서 이 잡이 하는 일은 딱 여기까지다
 *
 *   ★이미 우리가 아는 클랜★ 을 그 리그 명단에 올린다. 그뿐이다.
 *   ★모르는 클랜은 만들지 않고 세어서 알린다★ — `＃chasepIay`(대문자 I)와
 *   `＃chaseplay`(소문자 l)처럼 눈으로 구별이 안 되는 이름이 있어서, 이름만 보고
 *   만들면 ★가짜 클랜이 하나 더 생긴다.★ (D-221 의 정신)
 *   그 클랜들의 주소는 ★병영에서 따로 찾아와야 한다.★
 *
 * ── 지키는 것
 *
 *   ⚠ ★이미 있는 클랜의 이름·마크를 여기서 고치지 않는다★ — 그 일은
 *     `clan-mark-fresh` · `clan-name-from-matches` 가 한다.
 *   ⚠ ★기록을 만들지 않는다★ — 명단(`LeagueClan`)만 채운다. 경기 기록은
 *     `battlelog-lineup` 이 다음 판에 알아서 만든다.
 *
 * ```
 * pnpm --filter @sacloud/worker nexon sanply-clan-fill             # 미리보기
 * pnpm --filter @sacloud/worker nexon sanply-clan-fill --confirm
 * pnpm --filter @sacloud/worker nexon sanply-clan-fill --league sanply
 * ```
 */

export interface SanplyClanFillResult {
  /** 어느 리그에 채웠나 */
  league: string
  /** 클랜을 못 찾아 버려진 경기 수 */
  strandedMatches: number
  /** 그 경기들에 나온 클랜 수 */
  seenClans: number
  /** ★우리가 모르는 클랜★ — 이름만 보고 만들지 않는다. 병영에서 주소를 찾아와야 한다 */
  createdClans: number
  /** 리그 명단에 새로 올린 클랜 */
  joined: number
  /** 이미 명단에 있던 클랜 */
  already: number
  confirmed: boolean
  samples: string[]
}

interface RawSide {
  name: string | null
  bg: string | null
  front: string | null
}

const trimmed = (v: unknown): string | null => {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s === '' ? null : s
}

export async function runSanplyClanFill(
  options: { confirm?: boolean; leagueSlug?: string } = {},
): Promise<SanplyClanFillResult> {
  const confirm = options.confirm ?? false
  const leagueSlug = options.leagueSlug ?? 'sanply'

  const result: SanplyClanFillResult = {
    league: leagueSlug,
    strandedMatches: 0,
    seenClans: 0,
    createdClans: 0,
    joined: 0,
    already: 0,
    confirmed: confirm,
    samples: [],
  }

  const league = await prisma.league.findUnique({
    where: { slug: leagueSlug },
    select: { id: true },
  })
  if (league === null) {
    log(`★${leagueSlug} 리그가 없다★ — 아무것도 하지 않는다`)
    return result
  }

  /*
   * ★클랜을 못 찾아 버려진 경기★ 의 원문에서 양쪽 클랜을 뽑는다.
   *
   * ⚠ ★SQL 템플릿 안에 백틱을 쓰지 않는다★ — 템플릿이 거기서 끊긴다.
   */
  const rows = await prisma.$queryRaw<RawSide[]>`
    SELECT DISTINCT
           r."payload"->>'red_clan_name'   AS name,
           r."payload"->>'red_clan_mark1'  AS bg,
           r."payload"->>'red_clan_mark2'  AS front
      FROM "Match" m
      JOIN "League" l ON l."id" = m."leagueId"
      JOIN "BarracksClanMatchRaw" r ON r."matchKey" = m."sourceMatchId"
     WHERE m."supersededAt" IS NULL
       AND l."slug" = ${leagueSlug}
       AND m."lineupSkipReason" = 'clan_unmapped'
    UNION
    SELECT DISTINCT
           r."payload"->>'blue_clan_name'  AS name,
           r."payload"->>'blue_clan_mark1' AS bg,
           r."payload"->>'blue_clan_mark2' AS front
      FROM "Match" m
      JOIN "League" l ON l."id" = m."leagueId"
      JOIN "BarracksClanMatchRaw" r ON r."matchKey" = m."sourceMatchId"
     WHERE m."supersededAt" IS NULL
       AND l."slug" = ${leagueSlug}
       AND m."lineupSkipReason" = 'clan_unmapped'
  `

  const stranded = await prisma.$queryRaw<{ n: number }[]>`
    SELECT COUNT(*)::int AS n
      FROM "Match" m
      JOIN "League" l ON l."id" = m."leagueId"
     WHERE m."supersededAt" IS NULL
       AND l."slug" = ${leagueSlug}
       AND m."lineupSkipReason" = 'clan_unmapped'
  `
  result.strandedMatches = stranded[0]?.n ?? 0

  /*
   * ⚠ ★원문에는 클랜 주소(`clan_id`)가 없다★ — 2026-09-21 실측으로 알았다.
   *   `red_clan_name` · `red_clan_mark1/2` 뿐이고, 주소는 ★그 경기를 가져온 클랜★
   *   (`subject`) 것 하나만 안다. 상대 클랜의 주소는 원문이 안 준다.
   *
   *   그래서 이 잡은 ★이미 우리가 아는 클랜을 명단에 올리는 데까지★ 만 한다.
   *   ★없는 클랜을 이름만 보고 만들지 않는다★ — `＃chasepIay`(대문자 I)와
   *   `＃chaseplay`(소문자 l)처럼 눈으로 구별이 안 되는 이름이 있어서,
   *   이름으로 만들면 ★가짜 클랜이 하나 더 생긴다.★ (D-221 의 정신)
   *
   *   모르는 클랜은 ★세어서 알린다★ — 병영에서 주소를 찾아오는 일은 따로 해야 한다.
   */
  const sides = rows
    .map((r) => ({ name: trimmed(r.name), bg: trimmed(r.bg), front: trimmed(r.front) }))
    .filter((r): r is { name: string; bg: string | null; front: string | null } => r.name !== null)

  /* 같은 클랜이 여러 경기에 나온다 — 이름으로 한 번만 담는다 */
  const byName = new Map<string, (typeof sides)[number]>()
  for (const s of sides) if (!byName.has(s.name)) byName.set(s.name, s)
  result.seenClans = byName.size

  for (const [name, side] of byName) {
    void side
    const clan = await prisma.clan.findFirst({ where: { name }, select: { id: true, name: true } })

    if (clan === null) {
      /* ★우리가 모르는 클랜★ — 이름만 보고 만들지 않는다. 세어서 알린다 */
      result.createdClans += 1
      if (result.samples.length < 25) result.samples.push(`★모르는 클랜★ ${name}`)
      continue
    }

    const has = await prisma.leagueClan.findFirst({
      where: { leagueId: league.id, clanId: clan.id },
      select: { id: true },
    })
    if (has !== null) {
      result.already += 1
      continue
    }
    result.joined += 1
    if (result.samples.length < 25) result.samples.push(`명단에 올림 ${clan.name}`)
    if (confirm) {
      /* ★기록을 만들지 않는다★ — 명단 한 줄뿐이다. 전적은 경기에서 저절로 쌓인다 */
      await prisma.leagueClan.create({
        data: { leagueId: league.id, clanId: clan.id, division: 1 },
      })
    }
  }

  log(
    `${leagueSlug} 클랜 채움 — 버려진 경기 ${result.strandedMatches} · 나온 클랜 ${result.seenClans} · ` +
      `★모르는 클랜 ${result.createdClans}★ · 명단에 올림 ${result.joined} · 이미있음 ${result.already}` +
      (confirm ? '' : ' (미리보기)'),
  )
  for (const s of result.samples) log(`  ${s}`)
  return result
}
