/**
 * 3rd.supply 라인업 → **팀 식별 보조 증거** (D-133).
 *
 * ── 무엇에만 쓰는가
 *   허용   그 경기에 어떤 진영(red/blue)이 있었고 각 진영이 **어느 클랜**인가
 *   금지   라인업의 `clan` 값을 **경기 당시 소속**으로 쓰는 것 (그건 현재 소속이다 · D-130)
 *   금지   라인업만 보고 참가자를 만드는 것 (k/d/a 가 없다. 지어내지 않는다)
 *   금지   `rating_update` · `weapon` 을 사실값으로 쓰는 것
 *
 * ── 진영과 승패를 어떻게 아는가
 *   스냅샷의 `perspectives[]` 는 한 클랜 시점의 기록이다.
 *   ```
 *   { clan_id, opponent_clan_id, win, blue_team }
 *   blue_team === true  → 그 클랜은 blue 진영
 *   win        === true → 그 진영이 이겼다
 *   ```
 *   여기서 (승리 진영 클랜, 패배 진영 클랜)이 나온다.
 *
 * ── 넥슨과 어긋나면 넥슨이 이긴다
 *   넥슨 참가자의 `outcome` 과 여기서 계산한 승리 진영이 **한 명이라도 어긋나면**
 *   그 경기의 보조 증거를 **통째로 버린다.** 조용히 덮지 않고 충돌로 센다.
 *   실측(Beta 구간 142경기)에서는 불일치가 **0건**이었다.
 */
import type { SideEvidence } from '@sacloud/rating'

export const LINEUP_EVIDENCE_SOURCE = '3rd.supply-lineup'

/** 라인업 한 줄 — [playerId, nickname, clanId, weapon] */
type LineupRow = [number | null, string | null, number | null, number | null]

interface SnapshotPerspective {
  clan_id: number | null
  opponent_clan_id: number | null
  win: boolean | null
  blue_team: boolean | null
}

interface SnapshotMatch {
  id: string
  red: LineupRow[]
  blue: LineupRow[]
  perspectives: SnapshotPerspective[]
}

export interface LineupSnapshot {
  capturedAt: string
  clans: Record<string, { name: string; slug: string }>
  matches: SnapshotMatch[]
}

/** 한 경기에서 읽어낸 진영 정보 */
export interface LineupSides {
  sourceMatchId: string
  /** 승리 진영의 클랜 slug */
  winnerClanSlug: string | null
  loserClanSlug: string | null
  /** 닉네임 → 진영. 넥슨 참가자와 대조해 승패 일관성을 검사하는 데 쓴다 */
  sideByNickname: Map<string, 'red' | 'blue'>
  winnerSide: 'red' | 'blue' | null
}

/** 스냅샷 → 경기별 진영 정보. 순수 함수다 */
export function buildLineupSides(snapshot: LineupSnapshot): Map<string, LineupSides> {
  const out = new Map<string, LineupSides>()

  for (const match of snapshot.matches) {
    const perspective = match.perspectives.find(
      (row) =>
        row.clan_id != null &&
        row.opponent_clan_id != null &&
        row.win != null &&
        row.blue_team != null,
    )

    let winnerClanSlug: string | null = null
    let loserClanSlug: string | null = null
    let winnerSide: 'red' | 'blue' | null = null

    if (perspective) {
      const viewerSide: 'red' | 'blue' = perspective.blue_team ? 'blue' : 'red'
      winnerSide = perspective.win ? viewerSide : viewerSide === 'red' ? 'blue' : 'red'
      const viewerSlug = snapshot.clans[String(perspective.clan_id)]?.slug ?? null
      const opponentSlug = snapshot.clans[String(perspective.opponent_clan_id)]?.slug ?? null
      if (perspective.win) {
        winnerClanSlug = viewerSlug
        loserClanSlug = opponentSlug
      } else {
        winnerClanSlug = opponentSlug
        loserClanSlug = viewerSlug
      }
    }

    const sideByNickname = new Map<string, 'red' | 'blue'>()
    for (const [, nickname] of match.red) if (nickname) sideByNickname.set(nickname, 'red')
    for (const [, nickname] of match.blue) if (nickname) sideByNickname.set(nickname, 'blue')

    out.set(match.id, {
      sourceMatchId: match.id,
      winnerClanSlug,
      loserClanSlug,
      sideByNickname,
      winnerSide,
    })
  }

  return out
}

export interface NexonOutcomeRow {
  userName: string | null
  outcome: 'win' | 'lose' | 'draw' | null
}

export type AgreementVerdict =
  | { agrees: true; checked: number }
  | { agrees: false; checked: number; mismatches: number }

/**
 * 넥슨 참가자의 승패가 라인업 진영과 맞는가.
 *
 * 겹치는 참가자가 하나도 없으면 **검증할 수 없다** — 그때는 보조 증거를 쓰지 않는다.
 * 검증되지 않은 근거로 팀을 이름 붙이면 그게 곧 오염이다.
 */
export function verifyAgreement(
  sides: LineupSides,
  nexonRows: readonly NexonOutcomeRow[],
): AgreementVerdict {
  if (!sides.winnerSide) return { agrees: false, checked: 0, mismatches: 0 }

  let checked = 0
  let mismatches = 0
  for (const row of nexonRows) {
    if (!row.userName) continue
    if (row.outcome !== 'win' && row.outcome !== 'lose') continue
    const side = sides.sideByNickname.get(row.userName)
    if (!side) continue
    checked += 1
    const expected = side === sides.winnerSide ? 'win' : 'lose'
    if (row.outcome !== expected) mismatches += 1
  }

  if (checked === 0) return { agrees: false, checked: 0, mismatches: 0 }
  return mismatches === 0 ? { agrees: true, checked } : { agrees: false, checked, mismatches }
}

/**
 * 진영 정보 → 팀 식별 보조 증거.
 *
 * 우리 리그 클랜으로 **둘 다** 연결될 때만 돌려준다. 한쪽만 알면 쓰지 않는다 —
 * 반쪽짜리 이름표는 팀 판정을 더 흐리게 만든다.
 */
export function toSideEvidence(
  sides: LineupSides,
  leagueClanIdBySlug: ReadonlyMap<string, string>,
): SideEvidence | null {
  if (!sides.winnerClanSlug || !sides.loserClanSlug) return null
  if (sides.winnerClanSlug === sides.loserClanSlug) return null

  const winnerLeagueClanId = leagueClanIdBySlug.get(sides.winnerClanSlug) ?? null
  const loserLeagueClanId = leagueClanIdBySlug.get(sides.loserClanSlug) ?? null
  if (!winnerLeagueClanId || !loserLeagueClanId) return null
  if (winnerLeagueClanId === loserLeagueClanId) return null

  return { winnerLeagueClanId, loserLeagueClanId, source: LINEUP_EVIDENCE_SOURCE }
}
