/**
 * `nexon supply-rosters` — 현재 클랜원 자동 갱신 (D-130).
 *
 * 입력은 이미 저장소에 있는 경기 스냅샷이다. **넥슨도 3rd.supply도 부르지 않는다.**
 *   1. `supply-official-matches.json` 라인업 clan → 선수별 현재 소속 도출
 *   2. 신규·이적·탈퇴를 감지해 `LeagueRosterMembership` 이력에 반영
 *   3. 현재 소속 표시값(`Player.clanId` · `LeaguePlayer.clanId`) 갱신
 *
 * 판단 규칙은 `@sacloud/db/ops`(순수)에 있다. 여기서는 관측 시각 확정과 로그만 한다.
 */
import { readFileSync } from 'node:fs'
import {
  deriveCurrentMembership,
  syncSupplyRosters,
  type CurrentMembershipSnapshot,
  type SupplyRosterResult,
} from '@sacloud/db/ops'
import { log, warn } from '../lib/log.js'

export function readCurrentMembership(matchesSnapshotPath: string): CurrentMembershipSnapshot {
  const snapshot = JSON.parse(readFileSync(matchesSnapshotPath, 'utf8'))
  return deriveCurrentMembership(snapshot)
}

export async function runSupplyRosters(input: {
  membership: CurrentMembershipSnapshot
  leagueSlug: string
  confirm?: boolean
  verified?: boolean
}): Promise<SupplyRosterResult> {
  /* 관측 시각은 **스냅샷을 뜬 시각**이다. 실행 시각이 아니다 —
     같은 스냅샷을 나중에 다시 돌려도 소속 이력이 달라지면 안 된다(idempotent). */
  const observedAt = new Date(input.membership.capturedAt)
  if (Number.isNaN(observedAt.getTime())) {
    throw new Error(`스냅샷 capturedAt 을 시각으로 읽을 수 없다: ${input.membership.capturedAt}`)
  }

  const result = await syncSupplyRosters({
    membership: input.membership,
    leagueSlug: input.leagueSlug,
    observedAt,
    confirm: input.confirm,
    verified: input.verified,
  })

  const problems = result.perClan.filter((per) => per.status !== 'ok')
  if (problems.length > 0) {
    warn(`처리하지 못한 클랜 ${problems.length}곳 — 아래 사유를 보고 사람이 판단한다`)
  }
  if (result.conflicts > 0) {
    warn(`근거가 갈린 선수 ${result.conflicts}명 — 소속을 고르지 않고 건너뛰었다`)
  }
  if (result.transfers > 0) {
    log(`이적 ${result.transfers}건 감지 — 이전 소속은 지우지 않고 관측 시각으로 닫았다`)
  }

  return result
}
