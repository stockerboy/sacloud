/**
 * 신원(identity) 판단 규칙 — **순수 함수**.
 *
 * 절대 규칙 (사용자 지시 · `docs/NEXON_INGEST_SPEC.md` 5장)
 * 1. **ouid만으로 영구 동일인을 가정하지 않는다.** 넥슨이 ouid 변경 가능성을 명시했다.
 * 2. **닉네임 일치만으로 자동 병합하지 않는다.** 닉네임도 영구 식별자가 아니다.
 * 3. 근거가 부족하면 **후보(candidate)** 로 남기고 사람이 판단한다. 자동 승인 경로는 없다.
 */

export type IdentityStatus = 'unresolved' | 'active' | 'superseded' | 'conflicted'

export interface IdentityRow {
  ouid: string
  playerId: string | null
  status: IdentityStatus
  userName: string | null
}

export type CandidateReason = 'ouid_change' | 'nickname_match'

export interface CandidatePlan {
  ouid: string
  targetPlayerId: string | null
  targetOuid: string | null
  reason: CandidateReason
  evidence: Record<string, unknown>
}

export interface IdentityPlan {
  /** ouid 행을 새로 만들어야 하는가 */
  createIdentity: boolean
  /** 자동 연결은 **절대 하지 않는다.** 항상 false — 타입으로 못 박아 둔다 */
  autoLink: false
  candidates: CandidatePlan[]
}

/** 후보 중복 방지 키. NULL을 유니크에 넣을 수 없어 문자열로 합친다 */
export function buildCandidateKey(plan: {
  ouid: string
  targetPlayerId: string | null
  targetOuid: string | null
  reason: string
}): string {
  return [plan.ouid, plan.targetPlayerId ?? '-', plan.targetOuid ?? '-', plan.reason].join('|')
}

/**
 * 닉네임으로 ouid를 새로 알아냈을 때 무엇을 할지 정한다.
 *
 * - 처음 보는 ouid → `unresolved` 행을 만든다. **누구인지는 아직 모른다.**
 * - 같은 닉네임의 **연결된** 다른 ouid가 있다 → `ouid_change` 후보. 자동 연결하지 않는다.
 * - 그 닉네임과 이름이 같은 `Player`가 **정확히 하나** 있다 → `nickname_match` 후보(약한 근거).
 *   둘 이상이면 후보조차 만들지 않는다(무엇을 고를지 모른다).
 */
export function planIdentityObservation(input: {
  ouid: string
  userName: string | null
  existing: IdentityRow | null
  /** 같은 닉네임으로 관측된 다른 ouid들 */
  sameNicknameIdentities: readonly IdentityRow[]
  /** 이름이 정확히 같은 로컬 플레이어 ID들 */
  playerIdsWithSameName?: readonly string[]
  observedAt: Date
}): IdentityPlan {
  const candidates: CandidatePlan[] = []
  const evidenceBase = {
    userName: input.userName,
    observedAt: input.observedAt.toISOString(),
  }

  for (const other of input.sameNicknameIdentities) {
    if (other.ouid === input.ouid) continue
    if (other.playerId === null) continue
    if (other.status === 'superseded') continue
    candidates.push({
      ouid: input.ouid,
      targetPlayerId: other.playerId,
      targetOuid: other.ouid,
      reason: 'ouid_change',
      evidence: {
        ...evidenceBase,
        note: '같은 닉네임의 다른 ouid가 이미 플레이어에 연결돼 있다. 동일인 여부는 확인되지 않았다',
        otherStatus: other.status,
      },
    })
  }

  const playerIds = input.playerIdsWithSameName ?? []
  const alreadyLinked = input.existing?.playerId ?? null
  if (candidates.length === 0 && alreadyLinked === null && playerIds.length === 1) {
    candidates.push({
      ouid: input.ouid,
      targetPlayerId: playerIds[0] ?? null,
      targetOuid: null,
      reason: 'nickname_match',
      evidence: {
        ...evidenceBase,
        note: '닉네임이 같은 플레이어가 하나 있다. 닉네임은 영구 식별자가 아니므로 근거가 약하다',
      },
    })
  }

  return {
    createIdentity: input.existing === null,
    autoLink: false,
    candidates,
  }
}

export type ParticipantResolution =
  | { status: 'resolved'; playerId: string; ouid: string }
  | { status: 'ambiguous'; reason: string }
  | { status: 'unresolved'; reason: string }

/**
 * 매치 상세의 참가자(닉네임뿐)를 플레이어로 해석한다.
 *
 * **연결된(active) 신원만** 근거로 쓴다. 후보·미해결 신원으로는 해석하지 않는다.
 * 둘 이상이 걸리면 `ambiguous` — 하나를 고르지 않는다.
 */
export function resolveParticipant(
  userName: string | null,
  identities: readonly IdentityRow[],
): ParticipantResolution {
  if (!userName) return { status: 'unresolved', reason: 'no_user_name' }

  const matches = identities.filter(
    (identity) =>
      identity.status === 'active' &&
      identity.playerId !== null &&
      identity.userName === userName,
  )

  if (matches.length === 1) {
    const only = matches[0]!
    return { status: 'resolved', playerId: only.playerId!, ouid: only.ouid }
  }
  if (matches.length > 1) {
    return { status: 'ambiguous', reason: `연결된 신원이 ${matches.length}건이다` }
  }
  return { status: 'unresolved', reason: '연결된 신원이 없다' }
}
