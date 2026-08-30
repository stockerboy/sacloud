/**
 * **티어별 게임빈도 + 천적** (`docs/SITE_SPEC_V2.md` 4절).
 *
 * ```
 * vs 1티어  381판  승률 52.3%   vuvuzela 의 천적
 * vs 2티어  209판  승률 60%     hardcores 의 천적
 * vs 3티어    6판  승률 —       ← 10판 미만은 승률을 숨긴다
 * vs 4티어    0판  승률 —
 * ```
 *
 * ── 티어는 **경기 당시** 상대 클랜의 division 이다
 *   `MatchPlayerStat.opponentDivisionAtMatch` 를 읽는다. 지금의
 *   `LeagueClan.division` 을 join 해서 세면 상대가 승격·강등하는 순간
 *   **이미 끝난 과거 경기의 티어가 통째로 바뀐다** (`CLAUDE.md` 3-B 4번).
 *
 * ── 모집단은 화면의 다른 수치와 같다
 *   `withLadderMatch()` + 시즌0 창 (D-164 · D-178). 여기만 다른 경기를 세면
 *   같은 화면 안에서 티어별 판수 합계가 `상세정보` 의 총 전적과 어긋난다.
 *
 * ── 판정과 문구는 계약에 있다
 *   임계값(10판 · 50판 · 70%)은 전부 `packages/contract/src/tierBreakdown.ts` 에 있고
 *   `buildTierBreakdown()` 이 줄을 만든다. **여기서 다시 판정하지 않는다** —
 *   Mock 과 실제 API 가 같은 함수를 써야 두 모드의 응답이 갈리지 않는다.
 */
import { prisma } from '@sacloud/db'
import {
  buildTierBreakdown,
  type PlayerTierRecord,
  type TierClanTally,
  type TierTally,
} from '@sacloud/contract'
import { withLadderMatch } from './ladderScope'
import { seasonWindowWhere } from './season0Scope'

/** 티어 합계 + 그 티어에서 만난 클랜별 전적을 모으는 중간 그릇 */
interface TierBucket {
  games: number
  win: number
  lose: number
  /** 키는 상대 `LeagueClan.id`. 이름은 나중에 한 번에 붙인다 */
  clans: Map<string, { games: number; win: number; lose: number }>
}

const emptyBucket = (): TierBucket => ({ games: 0, win: 0, lose: 0, clans: new Map() })

export async function playerTierBreakdown(
  leagueId: string,
  playerId: string,
  divisionCount: number,
): Promise<PlayerTierRecord[]> {
  /* `take` 를 걸지 않는다. 이 카드가 답하는 것이 **판수**라서, 잘라서 세면
     `381판` 이 조용히 작아진다 (최근 N건만 보는 `recentDays.ts` 와 다른 점이다).
     시즌 창이 이미 기간을 자르고 있어 한 선수당 수백~수천 행이다 */
  const rows = await prisma.matchPlayerStat.findMany({
    where: { playerId, match: withLadderMatch({ leagueId, ...seasonWindowWhere() }) },
    select: {
      side: true,
      /* 경기 당시 스냅샷. 현재 division 을 join 하지 않는 이유가 이 줄에 있다 */
      opponentDivisionAtMatch: true,
      match: {
        select: { winnerSide: true, redLeagueClanId: true, blueLeagueClanId: true },
      },
    },
  })

  const byTier = new Map<number, TierBucket>()
  /* 이름을 붙여야 할 상대 클랜. 판수와 무관하게 모아 두고 **한 번에** 조회한다 —
     천적 조건(50판)으로 미리 걸러 두면 그 임계값이 계약과 이 파일 두 곳에 생긴다 */
  const opponentIds = new Set<string>()

  for (const row of rows) {
    const win = row.match.winnerSide === row.side
    const tier = row.opponentDivisionAtMatch
    const bucket = byTier.get(tier) ?? emptyBucket()
    bucket.games += 1
    if (win) bucket.win += 1
    else bucket.lose += 1

    const opponentId =
      row.side === 'red' ? row.match.blueLeagueClanId : row.match.redLeagueClanId
    opponentIds.add(opponentId)
    const clan = bucket.clans.get(opponentId) ?? { games: 0, win: 0, lose: 0 }
    clan.games += 1
    if (win) clan.win += 1
    else clan.lose += 1
    bucket.clans.set(opponentId, clan)

    byTier.set(tier, bucket)
  }

  /* 클랜명은 표기용이라 **판수를 다 센 뒤에** 한 번만 읽는다.
     한 리그의 클랜 수는 수십~수백이라 `in` 한 번으로 끝난다 */
  const clanRows =
    opponentIds.size === 0
      ? []
      : await prisma.leagueClan.findMany({
          where: { id: { in: [...opponentIds] } },
          select: { id: true, clan: { select: { name: true, slug: true } } },
        })
  const nameById = new Map(clanRows.map((row) => [row.id, row.clan]))

  const tallies: TierTally[] = [...byTier.entries()].map(([tier, bucket]) => {
    const clans: TierClanTally[] = []
    for (const [id, clan] of bucket.clans) {
      const named = nameById.get(id)
      /* 이름을 모르는 상대는 천적 후보에서 뺀다. 판수(위의 `bucket.games`)에는
         이미 들어가 있으므로 **경기가 사라지지는 않는다.**
         이름 자리를 `알수없음` 으로 채워 "알수없음 의 천적" 을 만들지 않는다 (D-106) */
      if (!named) continue
      clans.push({ key: id, name: named.name, slug: named.slug, ...clan })
    }
    return { tier, games: bucket.games, win: bucket.win, lose: bucket.lose, clans }
  })

  return buildTierBreakdown(divisionCount, tallies).map((row) => ({
    tier: row.tier,
    games: row.games,
    win: row.win,
    lose: row.lose,
    win_rate: row.winRate,
    nemeses: row.nemeses.map((nemesis) => ({
      name: nemesis.name,
      slug: nemesis.slug,
      games: nemesis.games,
      win: nemesis.win,
      lose: nemesis.lose,
      win_rate: nemesis.winRate,
    })),
  }))
}
