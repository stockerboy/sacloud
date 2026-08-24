/**
 * 현재 소속 도출 — 3rd.supply 라인업 clan → 선수별 **현재 클랜** (D-130).
 *
 * ── 왜 라인업의 clan 이 "현재" 인가 (실측으로 확정)
 *   같은 스냅샷 750경기(2025-09-30 ~ 2026-08-24, 11개월)에서 선수 1,091명 중
 *   **단 한 명도** 경기마다 다른 클랜으로 나오지 않았다.
 *   반대로 같은 기간 넥슨 `/match-detail` 의 `guild_name` 은 닉네임 1,341명 중 69명이
 *   서로 다른 클랜으로 나오고 그중 65명은 **기간이 겹치지 않는다**(이적의 모양).
 *
 *   11개월 동안 아무도 이적하지 않았을 리는 없다. 그러므로
 *     · 3rd.supply 라인업 clan = **렌더 시점의 현재 소속**
 *     · 넥슨 guild_name        = **경기 당시 소속**
 *   이다. 두 값의 쓰임을 절대 바꾸지 않는다 (D-131).
 *
 * ── 클랜원 목록 페이지는 현재 소속이 아니다
 *   `/league/supply/clan/{slug}/player` 는 "그 클랜에서 1경기 이상 뛴 선수"다.
 *   실측에서 1,235명 중 **181명이 두 곳 이상**에 동시에 들어 있었다. 이력 목록이다.
 *   그래서 현재 소속의 근거로 쓰지 않는다.
 */

/** 라인업 한 줄 — [playerId, nickname, clanId|null, weapon] */
type LineupRow = [number | null, string | null, number | null, number | null]

interface MatchesSnapshotLike {
  capturedAt: string
  clans: Record<string, { name: string; slug: string }>
  matches: { id: string; red: LineupRow[]; blue: LineupRow[] }[]
}

export interface CurrentMembershipRow {
  sourcePlayerId: string
  nickname: string
  clanSlug: string
  clanName: string
  /** 이 선수를 관측한 경기 수. 근거의 두께다 */
  observations: number
}

export interface CurrentMembershipSnapshot {
  source: string
  capturedAt: string
  /** 근거가 갈린 선수 (같은 선수가 서로 다른 클랜으로 나옴). **정상이면 0이다** */
  conflicts: { sourcePlayerId: string; nickname: string; clanSlugs: string[] }[]
  /** 클랜이 없는 선수 (무소속). 소속을 만들지 않는다 */
  clanless: number
  rows: CurrentMembershipRow[]
}

/**
 * 경기 스냅샷 → 선수별 현재 소속. 순수 함수다(DB 를 모른다).
 *
 * 한 선수가 서로 다른 클랜으로 관측되면 **고르지 않는다.** `conflicts` 에 담고 제외한다.
 * 추측으로 하나를 고르면 그게 곧 잘못된 소속이 된다.
 */
export function deriveCurrentMembership(
  snapshot: MatchesSnapshotLike,
): CurrentMembershipSnapshot {
  const byPlayer = new Map<
    string,
    { nickname: string; clans: Map<string, number> }
  >()
  let clanless = 0

  for (const match of snapshot.matches) {
    for (const [playerId, nickname, clanId] of [...match.red, ...match.blue]) {
      if (playerId == null) continue
      const key = String(playerId)
      const entry = byPlayer.get(key) ?? { nickname: nickname ?? key, clans: new Map() }
      if (nickname) entry.nickname = nickname
      if (clanId == null) {
        clanless += 1
      } else {
        const slug = snapshot.clans[String(clanId)]?.slug
        if (slug) entry.clans.set(slug, (entry.clans.get(slug) ?? 0) + 1)
      }
      byPlayer.set(key, entry)
    }
  }

  const rows: CurrentMembershipRow[] = []
  const conflicts: CurrentMembershipSnapshot['conflicts'] = []

  for (const [sourcePlayerId, entry] of byPlayer) {
    const slugs = [...entry.clans.keys()]
    if (slugs.length === 0) continue
    if (slugs.length > 1) {
      conflicts.push({ sourcePlayerId, nickname: entry.nickname, clanSlugs: slugs })
      continue
    }
    const slug = slugs[0]!
    const clan = Object.values(snapshot.clans).find((c) => c.slug === slug)
    rows.push({
      sourcePlayerId,
      nickname: entry.nickname,
      clanSlug: slug,
      clanName: clan?.name ?? slug,
      observations: entry.clans.get(slug) ?? 0,
    })
  }

  rows.sort((a, b) => a.sourcePlayerId.localeCompare(b.sourcePlayerId))
  return {
    source: '3rd.supply-lineup',
    capturedAt: snapshot.capturedAt,
    conflicts,
    clanless,
    rows,
  }
}
