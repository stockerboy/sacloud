/**
 * 클랜 래더 후보 — Phase 9 조사용 sandbox (운영 코드 아님).
 *
 * 개인 래더와 달리 **클랜 래더는 역추적 결과가 없다.**
 * `docs/IMPLEMENTATION_PLAN_1.md` Phase 9 §4가 "클랜 래더와 개인 래더의 **결합 방식**"을
 * `[미확인]`으로 명시했다. 그래서 여기서는 세 가지 결합 방식을 후보로 두고 비교만 한다.
 *
 * 관측된 사실은 두 가지뿐이다 (`docs/3rd-supply-structure.md`).
 *   - 클랜 래더 예: 1위 1,840점 · 20위 987점  → **개인 래더(1위 3,432점)보다 폭이 훨씬 좁다**
 *   - 랭킹은 1시간 배치, 배치고사가 끝난 클랜만 표시
 *
 * 후보를 고르는 기준은 "어느 쪽이 관측된 **분포 폭**을 재현하는가"이지,
 * "어느 쪽이 더 정교한가"가 아니다.
 */
import {
  ratingUpdate,
  roundHalfUp,
  type LadderParams,
  type CrossMode,
} from './ladder.js'

export type ClanLadderCandidate = 'team-elo' | 'member-mean' | 'roster-strength'

export interface ClanMatchInput {
  clanRating: number
  opponentClanRating: number
  isWin: boolean
  isPlacement?: boolean
  crossDamping?: number
  params: LadderParams
  crossMode?: CrossMode
  /** 그 경기에 나온 우리 선수들의 개인 증감 (C-2에서 쓴다) */
  memberUpdates: readonly number[]
  /** 등록 선수 전원의 현재 개인 래더 (C-3에서 쓴다) */
  rosterRatings: readonly number[]
  /** C-3에서 평균낼 상위 인원 수 */
  rosterTopN: number
}

/**
 * C-1 팀 Elo — 클랜을 하나의 개체로 본다.
 *
 * 장점: 개인 래더와 독립적이라 라인업을 바꿔도 클랜 점수가 흔들리지 않는다.
 * 단점: 선수 실력 변화가 클랜 점수에 늦게 반영된다. 로스터를 통째로 바꿔도 점수가 남는다.
 */
export function clanDeltaTeamElo(input: ClanMatchInput): number {
  return ratingUpdate({
    ratingBefore: input.clanRating,
    opponentAvgRating: input.opponentClanRating,
    isWin: input.isWin,
    isPlacement: input.isPlacement,
    crossDamping: input.crossDamping,
    params: input.params,
    crossMode: input.crossMode,
  }).ratingUpdate
}

/**
 * C-2 개인 증감 집계 — 그 경기에 나온 선수들의 증감 평균.
 *
 * 장점: 개인과 클랜이 같은 공식 하나로 묶인다. 강한 선수를 내보내면 그대로 반영된다.
 * 단점: **라인업 조작에 직접 노출된다.** 개인 래더가 낮은 선수만 내보내면 이겼을 때 더 오른다.
 */
export function clanDeltaMemberMean(input: ClanMatchInput): number {
  if (input.isPlacement || input.memberUpdates.length === 0) return 0
  const sum = input.memberUpdates.reduce((total, value) => total + value, 0)
  return roundHalfUp(sum / input.memberUpdates.length)
}

/**
 * C-3 로스터 강도 — 경기마다 누적하지 않고 **등록 선수 상위 N명 평균**으로 산출한다.
 *
 * 장점: 이적·라인업 조작이 곧바로 드러난다. 유령 클랜이 점수를 쥐고 있을 수 없다.
 * 단점: **경기 결과가 직접 반영되지 않는다.** "약팀을 이겨서 오른 점수"라는 개념이 없다.
 *       배치 계산이라 경기 직후 화면에 즉시 반영되지 않는다.
 */
export function clanRatingRosterStrength(
  rosterRatings: readonly number[],
  topN: number,
  fallback: number,
): number {
  if (rosterRatings.length === 0) return fallback
  const top = [...rosterRatings].sort((left, right) => right - left).slice(0, topN)
  const sum = top.reduce((total, value) => total + value, 0)
  return roundHalfUp(sum / top.length)
}

/** 후보별로 "이 경기 뒤 클랜 래더"를 만든다 (C-3는 경기와 무관하게 다시 계산된다) */
export function nextClanRating(candidate: ClanLadderCandidate, input: ClanMatchInput): number {
  if (candidate === 'roster-strength') {
    return clanRatingRosterStrength(input.rosterRatings, input.rosterTopN, input.clanRating)
  }
  const delta =
    candidate === 'team-elo' ? clanDeltaTeamElo(input) : clanDeltaMemberMean(input)
  return input.clanRating + delta
}
