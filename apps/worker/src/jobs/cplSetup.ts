import { prisma } from '@sacloud/db'

import { log } from '../lib/log.js'

/**
 * ★★CPL 리그를 만든다★★ (2026-09-21 · 사장님 지시)
 *
 * > 「24개클랜으로 ★cpl 이라는 리그★ 따로 만들어줘 지금 있는 c1리그 화면에서
 * >  없애버리고 전부 다 지워 (…) ★아직 아무런 기록도 하지마★ 10/1일부터 기록 시작할거야.
 * >  그리고 추가로 클랜도 더 받아서 10/1일에 출범할거야 사람들이 cpl 들어가면
 * >  ★참여하는 클랜 명단★ 볼 수 있고 ★리그에 대한 설명★ 을 좀 해줘」
 *
 * ── 무엇을 만드나
 *
 *   ```
 *   League  cpl · CPL · 개막 전      ← 기록이 한 줄도 없다
 *   LeagueClan × 24                  ← 참가 클랜 명단. 전적은 전부 0
 *   ```
 *
 * ── ★기록을 만들지 않는다★
 *
 *   경기도 참가기록도 랭킹도 만들지 않는다. `LeagueClan` 은 ★명단★ 일 뿐이고
 *   `win`/`lose`/`rating` 은 기본값 그대로 둔다. 10/1 에 기록이 시작된다.
 *   집계 잡들도 CPL 을 안 본다 (`AGGREGATE_LEAGUE_SLUGS` 에 없다).
 *
 * ── ★클랜은 이름으로 찾되 사람이 확인한 목록만★ (D-221 의 정신)
 *
 *   사장님이 주신 14곳은 ★위장문자★ 가 섞여 있어 그대로는 안 찾힌다
 *   (`ctrl` → `ctrI` · `The vub` → `ThelVub` · `styleclan` → `stylecIan`).
 *   그래서 ★slug 를 박아 둔다★ — 이름이 바뀌어도 같은 클랜을 가리킨다.
 *
 * ```
 * pnpm --filter @sacloud/worker nexon cpl-setup             # 미리보기
 * pnpm --filter @sacloud/worker nexon cpl-setup --confirm   # 반영
 * ```
 */

export const CPL_SLUG = 'cpl'
export const CPL_NAME = 'CPL'

/**
 * ★참가 클랜 24곳★ — slug 로 박는다 (이름은 바뀐다).
 *
 * 앞 14곳은 2026-09-21 에 사장님이 직접 주신 목록이고,
 * 뒤 10곳은 옛 C1 리그에 있던 곳이다. ★그 둘을 합쳐 24곳★ 이다.
 */
export const CPL_CLAN_SLUGS: readonly string[] = [
  /* ── 사장님이 주신 14곳 (2026-09-21) ────────────────────────────── */
  'sorentolove', //  -tsAr.nTc
  'Onepoint', //     One.PoinT
  'Ensemble', //     isyour
  'aksrrzi', //      rNtwo-
  'susucom', //      unfair
  'suddenalexia', // afterpray
  'DOKKIMAMA', //    Mentalist-
  'LaonJN', //       PokerFace.
  'luminouszzang', //ctrI      ← 사장님 표기 「ctrl」 (위장문자 I)
  'inpum', //        respects-
  'Akillclass', //   ThelVub   ← 사장님 표기 「The vub」
  'footmania2', //   stylecIan ← 사장님 표기 「styleclan」
  'adfafasf', //     ＃chaseplay
  'e2stro2017', //   e2stro-
  /* ── 옛 C1 열 곳 (2026-09-20 밤에 뽑았던 상위 열 클랜) ──────────── */
  '01025606089', //  〃veritas
  'fdd8', //         amaryllis
  'ferwfwfwfwf', //  deluxe
  'saffggaaz', //    grave
  'ckdals2457', //   hardcores
  'luverduck12', //  igloo
  'hanbi0302', //    luvme
  'ssdko', //        methodcrew
  'minjihun', //     sometimes
  'uava01', //       vuvuzela
]

export interface CplSetupResult {
  /** 리그를 새로 만들었나 */
  createdLeague: boolean
  /** 명단에 새로 올린 클랜 수 */
  added: number
  /** 이미 명단에 있던 클랜 수 */
  already: number
  /** slug 로 못 찾은 클랜 */
  missing: string[]
  /** 지금 명단에 있는 클랜 수 */
  total: number
  confirmed: boolean
}

export async function runCplSetup(
  options: { confirm?: boolean; slugs?: readonly string[] } = {},
): Promise<CplSetupResult> {
  const confirm = options.confirm ?? false
  const slugs = options.slugs ?? CPL_CLAN_SLUGS

  const result: CplSetupResult = {
    createdLeague: false,
    added: 0,
    already: 0,
    missing: [],
    total: 0,
    confirmed: confirm,
  }

  let league = await prisma.league.findUnique({
    where: { slug: CPL_SLUG },
    select: { id: true },
  })

  if (league === null) {
    result.createdLeague = true
    if (confirm) {
      league = await prisma.league.create({
        data: {
          slug: CPL_SLUG,
          name: CPL_NAME,
          /* ★한 부리그★ — 배치시즌(cloud1)이 끝나야 C1·C2 로 갈린다 */
          divisionCount: 1,
          official: true,
          category: 'official',
          origin: 'sacloud',
        },
        select: { id: true },
      })
    }
  }

  const clans = await prisma.clan.findMany({
    where: { slug: { in: [...slugs] } },
    select: { id: true, slug: true, name: true },
  })
  const found = new Set(clans.map((c) => c.slug))
  result.missing = slugs.filter((s) => !found.has(s))

  if (league !== null) {
    for (const clan of clans) {
      const has = await prisma.leagueClan.findFirst({
        where: { leagueId: league.id, clanId: clan.id },
        select: { id: true },
      })
      if (has !== null) {
        result.already += 1
        continue
      }
      result.added += 1
      if (confirm) {
        /*
         * ⚠ ★기록을 만들지 않는다★ — `rating`·`win`·`lose` 는 기본값 그대로다.
         *   10/1 에 첫 경기가 들어오면 그때부터 쌓인다.
         */
        await prisma.leagueClan.create({
          data: { leagueId: league.id, clanId: clan.id, division: 1 },
        })
      }
    }
    result.total = await prisma.leagueClan.count({ where: { leagueId: league.id } })
  }

  log(
    `CPL — 리그 ${result.createdLeague ? '새로 만듦' : '이미 있음'} · ` +
      `명단에 더함 ${result.added} · 이미있음 ${result.already} · ` +
      `지금 ${result.total}곳${result.missing.length > 0 ? ` · ★못 찾음 ${result.missing.join(', ')}★` : ''}` +
      (confirm ? '' : ' (미리보기)'),
  )
  return result
}
