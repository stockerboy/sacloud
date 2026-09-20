import { prisma } from '@sacloud/db'
import { log } from '../lib/log.js'

/**
 * ★★클랜 이름을 ★최근 경기★ 로 맞춘다★★ (2026-09-20 사장님)
 *
 * > 「아 시발 클랜명 바뀐거였네 이것도 서플라이보다 느리네
 * >  ★서플에는 반영돼있는데 우리는 안돼있네★ 또..」
 * > 「ctrl 저기 recent.wct에서 이름 바뀐거고 원투데이는 dravelior? ★둘다 pl인데★」
 *
 * ── 왜 안 바뀌고 있었나 (실측으로 하나씩 지웠다)
 *
 *   ① `GetClanInfo` — ★번호만 준다★ (`{"clan_no":"080102096503"}`)
 *   ② 명부(`GetClanUserList`) — ★회원만 준다.★ 클랜 이름이 없다
 *   ③ 그래서 명부를 저장할 때 ★우리 DB 의 이름★ 을 그대로 적고 있었다
 *      (`clanName: clan.name`) — ★자기가 자기를 베끼는 순환★ 이라 영원히 안 바뀐다
 *
 *   ★클랜 이름이 들어오는 곳은 경기 목록 원문 하나뿐이다★ —
 *   `red_clan_name` · `blue_clan_name`.
 *
 * ── 그런데 그 원문도 늦다
 *
 *   실측 — `friendliness1` 의 마지막 원문은 20:53 에 받았는데 ★그 안의 경기는
 *   20시간 전★ 것이었고, 적힌 이름이 옛 이름(`recent.wct-`)이었다.
 *   클랜 409곳을 돌아가며 받으니 ★자기 차례가 와야★ 갱신된다.
 *
 * ── 이 잡이 하는 일
 *
 *   ★이미 받아 둔 원문★ 에서 클랜마다 ★가장 최근 경기의 이름★ 을 읽어 맞춘다.
 *   새로 받아 오지 않는다 — ★공짜다.★
 *
 *   ⚠ ★red/blue 중 어느 쪽이 그 클랜인지★ 는 원문이 안 알려 준다.
 *     그래서 ★여러 경기에서 항상 나오는 이름★ 을 고른다 — 그 클랜은 red 에도
 *     blue 에도 번갈아 서지만 ★이름은 하나★ 다. 실측에서 6경기 중 6경기에
 *     `recent.wct-` 가 있었다.
 *
 *   ⚠ ★옛 경기로 되돌리지 않는다★ — 최근 것부터 본다. 옛 원문이 나중에 들어와도
 *     이름이 과거로 돌아가면 안 된다.
 *   ⚠ ★slug 는 안 건드린다★ — 주소가 바뀌면 옛 링크가 전부 깨진다.
 *   ⚠ ★빈 이름으로 덮지 않는다.★
 */

/** 마크를 안 단 클랜이 쓰는 그림 — ★이것으로 덮지 않는다★ */
const EMPTY_MARK = 'empty-clanmark'
const isEmptyMark = (url: string): boolean => url.includes(EMPTY_MARK)

const str = (v: unknown): string | null => {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s === '' ? null : s
}

/** 클랜마다 최근 몇 경기를 보나 — 많을수록 확실하지만 느리다 */
const LOOK_BACK = 8

/**
 * 「항상 나오는 이름」 으로 치려면 최근 경기 중 ★몇 번★ 나와야 하나.
 *
 * 한 번만 나온 이름은 ★상대 클랜★ 일 수 있다. 둘 이상이면 그 클랜 자신이다 —
 * 상대는 경기마다 바뀌지만 자신은 안 바뀐다.
 */
const MIN_HITS = 2

export interface ClanNameFromMatchesResult {
  /** 살펴본 클랜 수 */
  clans: number
  /** 이름이 달라 고친 수 */
  renamed: number
  /** 이름을 못 고른 수 (원문이 없거나 갈렸다) */
  unsure: number
  /** 마크가 달라 고친 수 */
  marked: number
  samples: { slug: string; before: string; after: string }[]
}

export async function runClanNameFromMatches(input: {
  confirm: boolean
}): Promise<ClanNameFromMatchesResult> {
  const result: ClanNameFromMatchesResult = { clans: 0, renamed: 0, unsure: 0, marked: 0, samples: [] }

  /* 살아 있는 클랜만 — 리그에 등록된 곳이다 */
  const clans = await prisma.clan.findMany({
    where: { active: true, leagueClans: { some: {} } },
    select: { id: true, slug: true, name: true, markBgUrl: true, markFrontUrl: true },
  })
  result.clans = clans.length

  for (const clan of clans) {
    /*
     * ⚠ ★한 클랜씩 적게 읽는다★ — `BarracksClanMatchRaw` 는 1.6GB 이고
     *   `payload` 가 행 안에 그대로 있어 ★어느 칸을 읽든 행 전체★ 를 읽는다.
     *   `subject` 인덱스를 타고 ★최근 여덟 줄★ 만 읽으면 싸다.
     */
    const rows = await prisma.barracksClanMatchRaw.findMany({
      where: { subject: clan.slug },
      orderBy: { fetchedAt: 'desc' },
      take: LOOK_BACK,
      select: { payload: true },
    })
    if (rows.length === 0) {
      result.unsure += 1
      continue
    }

    /* 나온 횟수를 센다 — ★그 클랜은 늘 나오고 상대는 바뀐다★ */
    const hits = new Map<string, number>()
    /** 이름 → 그 이름과 같은 줄에 있던 마크 (가장 최근 것) */
    const markOf = new Map<string, { bg: string; front: string }>()
    for (const row of rows) {
      const p = row.payload as Record<string, unknown> | null
      for (const side of ['red', 'blue'] as const) {
        const raw = p?.[`${side}_clan_name`]
        const name = typeof raw === 'string' ? raw.trim() : ''
        if (name === '') continue
        hits.set(name, (hits.get(name) ?? 0) + 1)
        if (markOf.has(name)) continue
        const bg = str(p?.[`${side}_clan_mark1`])
        const front = str(p?.[`${side}_clan_mark2`])
        /* ⚠ ★빈 마크는 안 담는다★ — 마크를 안 단 클랜이 그 자리일 수 있다 */
        if (bg === null || front === null || isEmptyMark(bg) || isEmptyMark(front)) continue
        markOf.set(name, { bg, front })
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

    /* ★갈리면 안 고친다★ — 틀린 이름으로 덮느니 그대로 두는 편이 낫다 (D-106) */
    if (best === null || bestHits < MIN_HITS || tied) {
      result.unsure += 1
      continue
    }

    /* ★마크★ — 이름이 그대로여도 마크만 바뀌었을 수 있다 */
    const mark = markOf.get(best) ?? null
    const markChanged =
      mark !== null && (mark.bg !== clan.markBgUrl || mark.front !== clan.markFrontUrl)
    const nameChanged = best !== clan.name
    if (!nameChanged && !markChanged) continue

    if (nameChanged) result.renamed += 1
    if (markChanged) result.marked += 1
    if (result.samples.length < 20) {
      result.samples.push({
        slug: clan.slug,
        before: clan.name,
        after: nameChanged ? best : `${best} (마크만)`,
      })
    }
    if (input.confirm) {
      await prisma.clan.update({
        where: { id: clan.id },
        data: {
          ...(nameChanged ? { name: best } : {}),
          ...(markChanged && mark !== null ? { markBgUrl: mark.bg, markFrontUrl: mark.front } : {}),
        },
      })
      /*
       * ★명부에 적힌 이름도 같이 고친다★ — 안 고치면 `clanAffiliation` 이
       * ★옛 이름으로 되돌린다.★ 그쪽은 명부를 진실로 보기 때문이다.
       */
      if (nameChanged) {
        await prisma.barracksClanMember.updateMany({
          where: { clanSlug: clan.slug },
          data: { clanName: best },
        })
      }
    }
  }

  log(
    `클랜 이름 — 살펴봄 ${result.clans} · 이름 ${result.renamed} · 마크 ${result.marked} · 못 고름 ${result.unsure}` +
      (input.confirm ? '' : ' (미리보기)'),
  )
  for (const s of result.samples) log(`  ${s.before} → ${s.after} (${s.slug})`)
  return result
}
