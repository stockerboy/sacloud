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
/**
 * ★★CPL 참가 클랜 — 무소속 14곳★★ (2026-09-21 사장님이 직접 주신 목록)
 *
 * > 「sometimes grave deluxe igloo luvme hardcores vuvuzela veritas methodcrew
 * >  evermore amarilys hing valentina 레트로폭탄 — ★CPL 참가하는 무소속 클랜들이야★」
 *
 * ⚠ ★이름이 아니라 slug 로 박는다★ — 위장문자가 섞여 있어 이름으로는 못 찾는다
 *   (`hing` → `hingˇ` · `valentina` → `vaIentina`(대문자 I) · `amarilys` → `amaryllis`).
 * ⚠ ★옛 24곳 판은 아래 `CPL_CLAN_SLUGS_V1` 에 남겼다★ (`CLAUDE.md` 1-4).
 */
export const CPL_CLAN_SLUGS: readonly string[] = [
  'minjihun', //       sometimes
  'ajwjdjwuwuei5', //  grave (클랜원 35명 쪽)
  'ferwfwfwfwf', //    deluxe
  'luverduck12', //    igloo
  'hanbi0302', //      luvme
  'ckdals2457', //     hardcores
  'uava01', //         vuvuzela
  '01025606089', //    〃veritas
  'ssdko', //          methodcrew
  '4473', //           evermore
  'fdd8', //           amaryllis
  'adgeodud20', //     hingˇ
  'valentina2', //     vaIentina
  'wdasdw', //         레트로폭탄
]

/**
 * ★★맞은편 — 서플라이(PL) 14곳★★ (2026-09-21 사장님)
 *
 * > 「CPL 14개 PL14개니까 ★둘이 대결구도 존나 간지나게★ 만들어 마크를 양쪽에 두고
 * >  vs 이런식으로 ★무소속은 무소속섹터에 서플라이는 서플라이 섹터에★ 따로 두고」
 */
export const PL_RIVAL_SLUGS: readonly string[] = [
  'sorentolove', //    -tsAr.nTc
  'Onepoint', //       One.PoinT
  'Ensemble', //       isyour
  'aksrrzi', //        rNtwo-
  'susucom', //        unfair
  'suddenalexia', //   afterpray
  'DOKKIMAMA', //      Mentalist-
  'LaonJN', //         PokerFace.
  'luminouszzang', //  ctrI    ← 사장님 표기 「ctrl」
  'inpum', //          respects-
  'Akillclass', //     ThelVub ← 사장님 표기 「The vub」
  'footmania2', //     stylecIan ← 사장님 표기 「styleclan」
  'adfafasf', //       ＃chaseplay
  'e2stro2017', //     e2stro-
]

/** ⚠ 옛 24곳 판 (2026-09-21 낮). 지우지 않는다 — 되돌릴 때 쓴다 */
export const CPL_CLAN_SLUGS_V1: readonly string[] = [
  'sorentolove', 'Onepoint', 'Ensemble', 'aksrrzi', 'susucom', 'suddenalexia',
  'DOKKIMAMA', 'LaonJN', 'luminouszzang', 'inpum', 'Akillclass', 'footmania2',
  'adfafasf', 'e2stro2017',
  '01025606089', 'fdd8', 'ferwfwfwfwf', 'saffggaaz', 'ckdals2457',
  'luverduck12', 'hanbi0302', 'ssdko', 'minjihun', 'uava01',
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
  /** 지금 명단에 있는 클랜 수 (내린 곳은 안 센다) */
  total: number
  /** ★목록에 없어서 내린 곳★ — 지운 것이 아니라 `expelledAt` 만 찍었다 */
  expelled: number
  expelledNames: string[]
  /** 목록에 다시 들어와 내림표를 지운 곳 */
  restored: number
  confirmed: boolean
}

/**
 * ★★명단을 목록과 똑같이 맞춘다★★ (2026-09-22 사장님)
 *
 * > 「참가 클랜 목록 보여달라니까」 · 「pl 14군데 목록:…」
 * > 「vaIentina 클랜마크 안보여?」
 *
 * ── 왜 안 보였나 (실측 2026-09-22)
 *
 *   ```
 *   CPL 명단  ★옛 24곳 그대로★
 *   빠진 곳   valentina2 · 4473 · adgeodud20 · wdasdw · ajwjdjwuwuei5 …
 *   ```
 *   `vaIentina` 의 마크는 ★DB 에도 맞게 들어 있었고 주소도 살아 있었다★
 *   (`0_12_082.png` · 200). ★그 클랜이 CPL 명단에 아예 없어서★ 화면에 한 줄도
 *   안 그려진 것이다 — 마크가 깨진 게 아니라 ★클랜이 없었다.★
 *
 * ── `sync` 가 하는 일
 *
 *   ★목록에 있으면 넣고, 없으면 내린다.★ 내릴 때 ★지우지 않는다★ —
 *   `expelledAt` 만 찍는다 (`CLAUDE.md` 1-4). 되돌리려면 그 칸만 비우면 된다.
 */
export const CPL_ALL_SLUGS: readonly string[] = [...CPL_CLAN_SLUGS, ...PL_RIVAL_SLUGS]

export async function runCplSetup(
  options: { confirm?: boolean; slugs?: readonly string[]; sync?: boolean } = {},
): Promise<CplSetupResult> {
  const confirm = options.confirm ?? false
  const sync = options.sync ?? false
  const slugs = options.slugs ?? (sync ? CPL_ALL_SLUGS : CPL_CLAN_SLUGS)

  const result: CplSetupResult = {
    createdLeague: false,
    added: 0,
    already: 0,
    missing: [],
    total: 0,
    expelled: 0,
    expelledNames: [],
    restored: 0,
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
    /*
     * ★목록에 없는 곳은 내린다★ — 지우지 않고 `expelledAt` 만 찍는다.
     *   되돌리려면 그 칸을 비우면 그대로 돌아온다 (`CLAUDE.md` 1-4).
     */
    if (sync) {
      const keep = new Set(clans.map((c) => c.id))
      const rows = await prisma.leagueClan.findMany({
        where: { leagueId: league.id, expelledAt: null },
        select: { id: true, clanId: true, clan: { select: { name: true, slug: true } } },
      })
      const drop = rows.filter((r) => !keep.has(r.clanId))
      result.expelled = drop.length
      result.expelledNames = drop.map((r) => `${r.clan?.name ?? '?'}(${r.clan?.slug ?? '?'})`)
      if (confirm && drop.length > 0) {
        await prisma.leagueClan.updateMany({
          where: { id: { in: drop.map((r) => r.id) } },
          data: { expelledAt: new Date() },
        })
      }
      /* ★되돌아온 곳은 다시 올린다★ — 목록에 다시 들어오면 내림표를 지운다 */
      const back = await prisma.leagueClan.updateMany({
        where: { leagueId: league.id, clanId: { in: [...keep] }, expelledAt: { not: null } },
        data: { expelledAt: null },
      })
      result.restored = confirm ? back.count : 0
    }

    result.total = await prisma.leagueClan.count({
      where: { leagueId: league.id, expelledAt: null },
    })
  }

  log(
    `CPL — 리그 ${result.createdLeague ? '새로 만듦' : '이미 있음'} · ` +
      `명단에 더함 ${result.added} · 이미있음 ${result.already} · ` +
      `지금 ${result.total}곳` +
      (result.expelled > 0 ? ` · ★내림 ${result.expelled}★` : '') +
      (result.restored > 0 ? ` · 되올림 ${result.restored}` : '') +
      (result.missing.length > 0 ? ` · ★못 찾음 ${result.missing.join(', ')}★` : '') +
      (confirm ? '' : ' (미리보기)'),
  )
  return result
}
