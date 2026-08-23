/**
 * 공식리그 경기 **발견**(discovery) — 3rd.supply 스냅샷 → 넥슨 스테이징 seed (D-127).
 *
 * ── 왜 3rd.supply 가 발견 경로인가
 *   넥슨 `/match` 목록은 최신순 수천 건이고 대부분 6종 로테이션 픽업 매치다.
 *   공식 경기(제3보급창고)는 그 안에 드물게 섞여 있어 최신 N건 상세로는 걸리지 않는다.
 *   실측으로 확인했다 — 신원 36명 · 상세 116건에 제3보급창고 **0건**(D-127).
 *
 *   반면 3rd.supply 클랜 상세의 최근매치에는 **넥슨 18자리 match_id 가 그대로** 있다.
 *   그 id 로 `/match-detail` 을 부르면 정확히 그 경기가 온다.
 *
 *     discovery = 3rd.supply        enrichment = Nexon
 *
 * ── 이 모듈이 하는 일 / 하지 않는 일
 *   한다   스냅샷을 읽어 `NexonMatch` 스테이징 행을 만든다 (id · 발견 출처만)
 *   안한다 넥슨 호출 · 맵/인원 판정 · 운영 Match 투영 · 래더 계산
 *
 * ── 스냅샷의 맵·인원·라인업을 **믿고 쓰지 않는다**
 *   스냅샷에는 `map` `player_count` `red/blue` 가 들어 있지만 여기서는 **필터 힌트로만**
 *   쓴다. 스테이징에 적재되는 사실값은 전부 넥슨 `/match-detail` 응답에서 온다.
 *   원본 두 곳이 어긋나면 넥슨이 기준이다 — 우리가 재현하는 것은 넥슨 전적이다.
 */
import { prisma } from '../src/index'

/** 스냅샷 라인업 한 줄 — [playerId, nickname, clanId|null, weapon] */
export type SupplyLineupRow = [number | null, string | null, number | null, number | null]

export interface SupplyMatchPerspective {
  clan_id: number | null
  opponent_clan_id: number | null
  opponent_rating: number | null
  opponent_division: number | null
  win: boolean | null
  blue_team: boolean | null
  placement: boolean | null
  /** 원본 래더 증감. **재계산하지 않는다** (CLAUDE.md 3-A 규칙 2) */
  rating_update: number | null
}

export interface SupplyMatchRecord {
  id: string
  map: string | null
  player_count: number | null
  start_at: string | null
  end_at: string | null
  play_time: string | null
  mvp_player_id: number | null
  red: SupplyLineupRow[]
  blue: SupplyLineupRow[]
  perspectives: SupplyMatchPerspective[]
}

export interface SupplyMatchSnapshot {
  source: string
  sourceType: string
  route: string
  capturedAt: string
  leagueSlug: string
  clanPages: number
  clans: Record<string, { name: string; slug: string }>
  matches: SupplyMatchRecord[]
}

/** 넥슨 match_id 는 18자리 숫자다. 그 외는 받지 않는다 */
const MATCH_ID = /^\d{18}$/

/** `260818140312124001` 앞 12자리가 경기 시작 시각(KST)이다. 실측으로 확인됐다 (D-126) */
export function startAtFromMatchId(matchId: string): Date | null {
  if (!MATCH_ID.test(matchId)) return null
  const [yy, mm, dd, hh, mi, ss] = [0, 2, 4, 6, 8, 10].map((at) =>
    Number(matchId.slice(at, at + 2)),
  ) as [number, number, number, number, number, number]
  // 원본 표기는 KST. UTC 로 저장한다
  const utc = Date.UTC(2000 + yy, mm - 1, dd, hh - 9, mi, ss)
  const date = new Date(utc)
  return Number.isNaN(date.getTime()) ? null : date
}

export interface SupplyDiscoveryFilter {
  /** 이 시각 이후 시작한 경기만 (포함) */
  since?: Date | null
  /** 이 시각 이전 시작한 경기만 (포함) */
  until?: Date | null
  /** 스냅샷 `map` 이 이 값인 것만. 넥슨 상세로 다시 확인하므로 어디까지나 힌트다 */
  map?: string | null
  /** 스냅샷 `player_count` 가 이 값인 것만 */
  playerCount?: number | null
  /** 최대 건수 */
  limit?: number | null
}

export interface SupplyDiscoveryCandidate {
  sourceMatchId: string
  startAt: Date | null
  hintMap: string | null
  hintPlayerCount: number | null
}

/**
 * 스냅샷 → 발견 후보. 순수 함수다(DB 를 모른다).
 * 정렬은 **오래된 것부터**다 — 중단 후 재개해도 같은 순서로 돈다.
 */
export function selectDiscoveryCandidates(
  snapshot: SupplyMatchSnapshot,
  filter: SupplyDiscoveryFilter = {},
): SupplyDiscoveryCandidate[] {
  const rows: SupplyDiscoveryCandidate[] = []
  const seen = new Set<string>()

  for (const match of snapshot.matches) {
    if (!MATCH_ID.test(match.id) || seen.has(match.id)) continue
    if (filter.map != null && match.map !== filter.map) continue
    if (filter.playerCount != null && match.player_count !== filter.playerCount) continue

    const startAt = startAtFromMatchId(match.id)
    if (filter.since && (!startAt || startAt < filter.since)) continue
    if (filter.until && (!startAt || startAt > filter.until)) continue

    seen.add(match.id)
    rows.push({
      sourceMatchId: match.id,
      startAt,
      hintMap: match.map,
      hintPlayerCount: match.player_count,
    })
  }

  rows.sort((a, b) => (a.sourceMatchId < b.sourceMatchId ? -1 : a.sourceMatchId > b.sourceMatchId ? 1 : 0))
  return filter.limit != null && filter.limit > 0 ? rows.slice(0, filter.limit) : rows
}

export interface SupplyDiscoveryResult {
  candidates: number
  /** 스테이징에 새로 만든 행 */
  created: number
  /** 이미 스테이징에 있던 행 */
  existing: number
  /** 그중 상세를 아직 안 받은 행 (다음 단계 대상) */
  detailPending: number
}

/**
 * 후보를 스테이징에 넣는다. **넥슨을 부르지 않는다.**
 *
 * 이미 있는 행은 건드리지 않는다 — 상세를 받아 둔 값을 스냅샷 힌트로 덮으면 안 된다.
 * 재실행해도 결과가 같다(idempotent).
 */
export async function seedStagingFromSupply(input: {
  candidates: readonly SupplyDiscoveryCandidate[]
  source: string
  discoverySource: string
  confirm?: boolean
}): Promise<SupplyDiscoveryResult> {
  const result: SupplyDiscoveryResult = {
    candidates: input.candidates.length,
    created: 0,
    existing: 0,
    detailPending: 0,
  }

  for (const candidate of input.candidates) {
    const existing = await prisma.nexonMatch.findUnique({
      where: {
        source_sourceMatchId: { source: input.source, sourceMatchId: candidate.sourceMatchId },
      },
      select: { id: true, detailFetchedAt: true },
    })

    if (existing) {
      result.existing += 1
      if (!existing.detailFetchedAt) result.detailPending += 1
      continue
    }

    result.created += 1
    result.detailPending += 1
    if (!input.confirm) continue

    await prisma.nexonMatch.create({
      data: {
        source: input.source,
        sourceMatchId: candidate.sourceMatchId,
        // 사실값은 넥슨 상세에서만 온다. 여기서는 발견 출처와 id 만 남긴다
        discoverySource: input.discoverySource,
      },
    })
  }

  return result
}
