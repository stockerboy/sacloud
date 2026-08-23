/**
 * 관측된 참가자 — **버리지 않되 합치지도 않는다** (D-123).
 *
 * ── 무엇이 문제였나
 *   `match-detail`은 참가자 10명 전원을 K/D/A까지 정상적으로 준다.
 *   그런데 `resolveParticipant`가 **이미 아는 닉네임**(`NexonIdentity`에 등록된 사람)만
 *   `resolvedPlayerId`로 붙이고, 나머지는 `null`로 두었다.
 *   그리고 투영 단계가 `resolvedPlayerId === null`인 행을 통째로 버렸다.
 *
 *   실측: `NexonMatchParticipant` 668건 중 resolved 7건(1.0%).
 *   그래서 원본에 10명이 있는 경기가 화면에는 4명으로 나왔다.
 *
 * ── 고치는 방향
 *   참가자 **존재**와 **신원 확정**은 다른 문제다 (사용자 지시 4장).
 *   실제로 뛴 사람이면 기록은 남겨야 한다. 다만 그 사람이 **누구인지**는
 *   확실한 근거가 있을 때만 말한다.
 *
 *   그래서 신원을 모르는 참가자에게는 **관측 전용 Player**를 만든다.
 *     · id 접두사가 `OBS-`라 한눈에 구분된다
 *     · 닉네임 해시로 결정적이라 같은 사람은 같은 행에 쌓인다
 *     · **기존 Player와 절대 합치지 않는다** (D-036 · D-100)
 *     · `NexonIdentity` · `UserPlayerLink`를 자동으로 만들지 않는다
 *
 * ── 왜 닉네임 해시인가, 그리고 그 한계
 *   `match-detail` 참가자에는 **닉네임 말고 안정적인 식별자가 없다**.
 *   그래서 닉네임으로 키를 잡되, 그것이 "같은 사람"이라는 주장이 아니라
 *   **"같은 닉네임으로 관측됐다"는 주장**임을 이름으로 드러낸다.
 *   동명이인·닉변은 이 구조로 해결되지 않는다 — 해결됐다고 표시하지도 않는다.
 *   나중에 강한 근거(ouid · `user_nexon_sn`)가 생기면 운영자가 병합한다.
 */
import { createHash } from 'node:crypto'

/** 관측 전용 Player id 접두사. 실제 신원과 섞이지 않게 눈에 띄게 둔다 */
export const OBSERVED_PLAYER_PREFIX = 'OBS-'

/** 병영수첩 계정 번호로 만든 Player id 접두사 (강한 식별자) */
export const BARRACKS_PLAYER_PREFIX = 'BRX-'

/**
 * 닉네임 → 관측 Player id.
 *
 * 결정적이다. 같은 닉네임은 언제나 같은 id로 간다.
 * 닉네임 앞뒤 공백만 정리하고 **대소문자는 보존한다** —
 * 서든어택 닉네임은 대소문자가 다르면 다른 사람이다.
 */
export function observedPlayerKey(userName: string): string {
  const normalized = userName.trim()
  const digest = createHash('sha256').update(normalized).digest('hex').slice(0, 24)
  return `${OBSERVED_PLAYER_PREFIX}${digest}`
}

/** 병영수첩 계정 번호 → Player id (닉변에도 안 흔들리는 강한 키) */
export function barracksPlayerKeyFromSn(userNexonSn: number | string): string {
  return `${BARRACKS_PLAYER_PREFIX}${String(userNexonSn)}`
}

/** 관측 전용으로 만들어진 Player인가 */
export function isObservedPlayer(playerId: string | null | undefined): boolean {
  return typeof playerId === 'string' && playerId.startsWith(OBSERVED_PLAYER_PREFIX)
}

export type ParticipantIdentityKind =
  /** 운영자가 확인했거나 강한 근거로 연결된 사람 */
  | 'resolved'
  /** 실제로 뛴 것은 확실하지만 누구인지는 확정하지 못한 사람 */
  | 'observed'

export interface ParticipantIdentity {
  playerId: string
  kind: ParticipantIdentityKind
  /** 이 판정의 근거 */
  evidence: string
}

export interface IdentityResolutionInput {
  userName: string | null
  /** 기존 신원 해석 결과 (`resolveParticipant`) */
  resolvedPlayerId: string | null
  /** 병영수첩 등에서 얻은 강한 계정 식별자 */
  userNexonSn?: number | string | null
}

/**
 * 참가자 한 명의 Player id를 정한다.
 *
 * 우선순위 — **강한 근거 먼저**
 *   1. 이미 확정된 신원 (`NexonIdentity` → `playerId`)
 *   2. 병영수첩 계정 번호 (`user_nexon_sn`)
 *   3. 관측 전용 Player (닉네임 기준, **합치지 않음**)
 *
 * 3번까지 왔다고 참가자를 버리지 않는다. 그게 이 모듈의 존재 이유다.
 * 닉네임이 아예 없으면 그때만 `null`이다 — 그건 원본에 사람이 없는 것이다.
 */
export function participantIdentity(input: IdentityResolutionInput): ParticipantIdentity | null {
  if (input.resolvedPlayerId) {
    return {
      playerId: input.resolvedPlayerId,
      kind: 'resolved',
      evidence: '확정된 신원',
    }
  }

  if (input.userNexonSn !== null && input.userNexonSn !== undefined && `${input.userNexonSn}` !== '') {
    return {
      playerId: barracksPlayerKeyFromSn(input.userNexonSn),
      kind: 'resolved',
      evidence: '병영수첩 계정 번호',
    }
  }

  const name = (input.userName ?? '').trim()
  if (!name) return null

  return {
    playerId: observedPlayerKey(name),
    kind: 'observed',
    evidence: '경기 상세에서 관측된 닉네임 (동일인 주장 아님)',
  }
}
