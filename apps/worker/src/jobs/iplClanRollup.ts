/**
 * IPL **클랜 집계** — 경기 결과로 `LeagueClan.{win, lose, rating, placement}` 를 채운다.
 *
 * ── 왜 새로 만드나
 *   클랜랭킹 화면(`getClanRanks`)은 이 네 칸을 **직접 읽는다.** 그런데 IPL 에는 그것을
 *   채워 주는 경로가 없었다 — `season0Apply` 는 origin 필터에서 빠지고, `rate.ts` 는
 *   참가자를 요구하고, `supplyRollup` 은 3rd.supply 가 준 값을 옮기는 것이라 IPL 엔 원본이 없다.
 *
 * ── ⚠ **위 서술은 낡았다. 손으로 돌릴 때 조심해라** (2026-09-02 · D-258)
 *
 *   커밋 `cc0be67` 이 `SEASON0_ORIGINS` 에 `nexon_barracks` 를 더하면서
 *   **`season0Apply` 가 IPL 을 집계하기 시작했다.** 즉 「빠진다」는 이제 거짓이다.
 *   실측(2026-09-02 · 운영): `season0-apply --leagues nolink` 가 선수 1,456 · 클랜 39 를 만든다.
 *
 *   그래서 이 잡과 `season0Apply` 는 **같은 칸을 다툰다** —
 *   `LeagueClan.{win, lose, rating, placement}` 넷 전부다.
 *   나중에 돌린 쪽이 이긴다. 이 잡은 **CLI 전용이고 어떤 워크플로도 부르지 않으므로**
 *   자동으로 부딪히지는 않지만, **손으로 돌리면 시간당 도는 `season0-apply` 결과를 덮는다.**
 *
 *   IPL 클랜 점수의 정본은 이제 `season0Apply` 다. 이 잡은 그것이 못 미더울 때
 *   대조하는 용도로 남긴다 (CLAUDE.md 10-4 — 지우지 않는다).
 *
 * ── 결정적 replay
 *   판정은 전부 `lib/iplClanStanding.ts`(순수 함수)가 한다. 여기서는 **읽고 받아 적기만** 한다.
 *   `startAt` 오름차순으로 처음부터 다시 계산하므로 몇 번을 돌려도 같은 값이 나온다.
 *
 * ── ⚠ 구성 가중치(D-172)를 걸지 않는다
 *   IPL 원문에 참가자가 없어서 **그 경기에 나간 본클랜원 수를 모른다.**
 *   모르는 값을 1 로 가정하지 않고 가중치를 아예 적용하지 않는다. 배틀로그가 모이면
 *   그때 다시 돌리면 된다 — replay 라 언제든 다시 매겨진다.
 *
 * ```
 * pnpm --filter @sacloud/worker nexon ipl-clan-rollup            # 미리보기
 * pnpm --filter @sacloud/worker nexon ipl-clan-rollup --confirm  # 반영
 * ```
 */
import { prisma } from '@sacloud/db'
import { V2_RATING_CONSTANTS } from '@sacloud/rating'
import { log, warn } from '../lib/log.js'
import {
  computeClanStandings,
  IPL_START_RATING,
  type ClanStanding,
  type StandingMatch,
} from '../lib/iplClanStanding.js'

const IPL_SLUG = 'nolink'

export interface IplClanRollupResult {
  matches: number
  clansWithGames: number
  registered: number
  /** 경기가 한 판도 없는 등록 클랜 — 시작값으로 되돌린다 */
  reset: number
  updated: number
  ranked: number
  placement: number
  top: Array<{ name: string; division: number; rating: number; win: number; lose: number }>
}

export async function runIplClanRollup(
  options: { confirm?: boolean } = {},
): Promise<IplClanRollupResult> {
  const league = await prisma.league.findUnique({
    where: { slug: IPL_SLUG },
    select: { id: true, name: true },
  })
  if (!league) throw new Error(`리그 ${IPL_SLUG} 이 없다`)

  const rows = await prisma.match.findMany({
    where: { leagueId: league.id },
    select: { redLeagueClanId: true, blueLeagueClanId: true, winnerSide: true },
    orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
  })
  const matches: StandingMatch[] = rows.map((r) => ({
    redLeagueClanId: r.redLeagueClanId,
    blueLeagueClanId: r.blueLeagueClanId,
    winnerSide: r.winnerSide,
  }))

  /* ── 배치고사 폐지를 IPL 클랜에도 건다 (2026-09-02 · D-258)
     `computeClanStandings` 는 상수를 안 넘기면 `DEFAULT_RATING_CONSTANTS` 를 쓰는데
     그쪽 `placementMatches` 는 아직 **10** 이다 (`packages/rating/src/constants.ts` 의
     주석이 "IPL 클랜 집계까지 같이 움직이니 별건으로 다룬다"고 예고해 둔 것이 이것이다).

     그 결과 **10판 미만 IPL 클랜이 `placement=true` 가 되어 클랜랭킹에서 통째로 빠졌다.**
     아래 `top` 이 `!r.placement` 로 거르고, 화면도 같은 칸을 본다.
     표시만의 문제가 아니라 **클랜이 사라지는** 문제였고, 그 상태에서는 화면 문구
     「한 경기부터 바로 반영됩니다」가 IPL 클랜랭킹에서 거짓이 된다.

     `DEFAULT` 는 건드리지 않는다 — 그 상수를 쓰는 다른 경로까지 같이 움직인다.
     부르는 쪽에서 v2 를 넘긴다. 이 잡은 결정적 replay 라 다시 돌리면 값이 바로잡힌다 */
  const standings = computeClanStandings(matches, { constants: V2_RATING_CONSTANTS })

  const regs = await prisma.leagueClan.findMany({
    where: { leagueId: league.id },
    select: { id: true, division: true, clan: { select: { name: true } } },
  })

  const result: IplClanRollupResult = {
    matches: matches.length,
    clansWithGames: standings.size,
    registered: regs.length,
    reset: 0,
    updated: 0,
    ranked: 0,
    placement: 0,
    top: [],
  }

  /** 경기가 없는 등록 클랜도 **명시적으로 시작값**으로 둔다. 옛 값이 남아 있으면 거짓말이 된다 */
  const blank: Omit<ClanStanding, 'leagueClanId'> = {
    win: 0,
    lose: 0,
    games: 0,
    rating: IPL_START_RATING,
    placement: true,
    placementPlayed: 0,
  }

  for (const reg of regs) {
    const s = standings.get(reg.id)
    const value = s ?? { leagueClanId: reg.id, ...blank }
    if (!s) result.reset += 1

    if (value.placement) result.placement += 1
    else result.ranked += 1

    if (options.confirm) {
      await prisma.leagueClan.update({
        where: { id: reg.id },
        data: {
          win: value.win,
          lose: value.lose,
          rating: value.rating,
          placement: value.placement,
          placementPlayed: value.placementPlayed,
        },
      })
      result.updated += 1
    }
  }

  /* 등록되지 않았는데 경기에 나온 클랜이 있으면 알린다 — 조용히 넘기지 않는다 */
  const regIds = new Set(regs.map((r) => r.id))
  const strays = [...standings.keys()].filter((id) => !regIds.has(id))
  if (strays.length) warn(`등록되지 않았는데 경기에 나온 클랜 ${strays.length}곳`)

  result.top = regs
    .map((reg) => {
      const s = standings.get(reg.id)
      return {
        name: reg.clan.name,
        division: reg.division,
        rating: s?.rating ?? IPL_START_RATING,
        win: s?.win ?? 0,
        lose: s?.lose ?? 0,
        placement: s?.placement ?? true,
      }
    })
    .filter((r) => !r.placement)
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 10)
    .map(({ name, division, rating, win, lose }) => ({ name, division, rating, win, lose }))

  log(
    `IPL 클랜 집계 ${options.confirm ? '반영' : '미리보기'} — ` +
      `경기 ${result.matches.toLocaleString()} · 등록클랜 ${result.registered} · ` +
      `랭킹진입 ${result.ranked} · 배치고사 ${result.placement} · 무경기 ${result.reset}`,
  )
  if (!options.confirm) log('--confirm 없이는 한 줄도 쓰지 않았다')

  return result
}
