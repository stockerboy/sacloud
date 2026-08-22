/**
 * 클랜 래더 — **네 가지를 절대 섞지 않는다** (Phase 11 · D-104).
 *
 *   1부 standings        1부 클랜끼리. 승강은 이것으로 판단한다
 *   2부 standings        2부 클랜끼리. 승강은 이것으로 판단한다
 *   무소속 Tier 내 순위   같은 Tier 안에서만 rating 순
 *   무소속 전체 래더      Tier를 **완전히 무시**하고 rating 순
 *   전체 통합 래더        1부·2부·무소속을 전부 섞어 rating 순
 *
 * 두 가지가 특히 중요하다.
 *
 * ① **Tier는 rating으로 자동으로 오르내리지 않는다.**
 *    Tier 1의 W가 1500이고 Tier 2의 A가 1800이어도 W는 Tier 1, A는 Tier 2다.
 *    Tier는 운영자가 정한 값(`Clan.tier`)을 **읽기만** 한다. 여기서 다시 계산하지 않는다.
 *
 * ② **전체 래더는 Tier도 부리그도 보지 않는다.**
 *    Tier 5 클랜이 전체 1위가 될 수 있고, 2부 클랜이 1부 클랜보다 위일 수 있다.
 *    정렬 기준은 오직 `rating`이다.
 *
 * 그래서 `tier`/`division`은 **표시용 값**으로만 따라다닌다. 정렬에 개입하지 않는다.
 * 저장 필드를 새로 만들지 않고 질의로 계산한다 (순위는 파생값이다).
 */
import { prisma } from '@sacloud/db'
import { winRate, type ClanRankRow } from '@sacloud/contract'
import { CLAN_SUMMARY_SELECT, toClanSummary } from '../mappers'
import { INDEPENDENT_CATEGORY } from './visibility'

/** 래더 정렬 — 점수 내림차순, 동점이면 id로 고정한다(페이지가 흔들리지 않게) */
const LADDER_ORDER = [{ rating: 'desc' as const }, { id: 'asc' as const }]

const LADDER_SELECT = {
  id: true,
  rating: true,
  division: true,
  win: true,
  lose: true,
  clan: { select: { ...CLAN_SUMMARY_SELECT, category: true, tier: true } },
}

type LadderRow = {
  id: string
  rating: number
  division: number
  win: number
  lose: number
  clan: {
    id: string
    slug: string
    name: string
    markBgUrl: string | null
    markFrontUrl: string | null
    category: string
    tier: number | null
  }
}

/** 무소속 클랜의 한 줄. 순위가 **두 종류**라 별도 타입이다 */
export interface IndependentLadderRow extends ClanRankRow {
  /** 운영자가 정한 Tier (1~5). 지정되지 않았으면 null */
  tier: number | null
  /** 같은 Tier 안에서의 순위. Tier가 없으면 null */
  tier_rank: number | null
  /** Tier를 무시한 무소속 전체 순위 */
  overall_rank: number
}

function toRow(row: LadderRow, rank: number): ClanRankRow {
  return {
    rank,
    league_clan_id: row.id,
    clan: toClanSummary(row.clan),
    division: row.division,
    win: row.win,
    lose: row.lose,
    win_rate: winRate(row.win, row.lose),
    rating: row.rating,
    category: row.clan.category,
  }
}

async function ladderRows(where: object): Promise<LadderRow[]> {
  return prisma.leagueClan.findMany({
    where,
    orderBy: LADDER_ORDER,
    select: LADDER_SELECT,
  }) as Promise<LadderRow[]>
}

/**
 * 전체 통합 클랜 래더 — 1부 · 2부 · 무소속을 **전부 섞어서** rating 순.
 *
 * 부리그도 Tier도 보정값이 아니다. 2부가 1부 위에 오는 것은 정상이다.
 * 배치고사 중인 클랜은 순위를 매기지 않는다(다른 랭킹과 같은 규칙).
 */
export async function getOverallClanLadder(leagueId: string): Promise<ClanRankRow[]> {
  const rows = await ladderRows({ leagueId, placement: false })
  return rows.map((row, index) => toRow(row, index + 1))
}

/**
 * 무소속 래더.
 *
 * 한 번 읽어서 **두 순위를 같이** 만든다.
 *   `overall_rank` Tier 무시, rating 순
 *   `tier_rank`    같은 Tier 안에서만 rating 순
 *
 * 두 값은 서로 독립이다. Tier 1 꼴찌가 전체 1위일 수도 있다.
 */
export async function getIndependentLadder(leagueId: string): Promise<IndependentLadderRow[]> {
  const rows = await ladderRows({
    leagueId,
    placement: false,
    clan: { category: INDEPENDENT_CATEGORY },
  })

  // Tier별 순번은 이미 rating 순으로 정렬된 배열을 훑으며 세면 된다
  const seenInTier = new Map<number, number>()

  return rows.map((row, index) => {
    const tier = row.clan.tier
    let tierRank: number | null = null
    if (tier !== null) {
      const next = (seenInTier.get(tier) ?? 0) + 1
      seenInTier.set(tier, next)
      tierRank = next
    }
    return {
      ...toRow(row, index + 1),
      tier,
      tier_rank: tierRank,
      overall_rank: index + 1,
    }
  })
}

/**
 * 특정 Tier 안의 순위만.
 *
 * `getIndependentLadder`를 걸러서 만든다 — 순위 계산을 두 벌 두지 않기 위해서다.
 */
export async function getTierLadder(
  leagueId: string,
  tier: number,
): Promise<IndependentLadderRow[]> {
  const all = await getIndependentLadder(leagueId)
  return all
    .filter((row) => row.tier === tier)
    .map((row) => ({ ...row, rank: row.tier_rank ?? row.rank }))
}

/** 이 리그에서 실제로 쓰이고 있는 무소속 Tier 목록 (운영자가 지정한 것만) */
export async function getIndependentTiers(leagueId: string): Promise<number[]> {
  const rows = await prisma.leagueClan.findMany({
    where: { leagueId, clan: { category: INDEPENDENT_CATEGORY, tier: { not: null } } },
    select: { clan: { select: { tier: true } } },
    distinct: ['clanId'],
  })
  return [...new Set(rows.map((row) => row.clan.tier).filter((tier): tier is number => tier !== null))].sort(
    (a, b) => a - b,
  )
}
